import os
import sys

# 프로젝트 루트를 sys.path에 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

try:
    import gspread
    from google.oauth2.service_account import Credentials
except ImportError:
    pass

try:
    from config import CONSUMABLES_SPREADSHEET_ID, GOOGLE_CREDENTIALS_FILE, GOOGLE_CREDENTIALS_JSON
except ImportError:
    CONSUMABLES_SPREADSHEET_ID = os.environ.get("CONSUMABLES_SPREADSHEET_ID")
    GOOGLE_CREDENTIALS_FILE = os.environ.get("GOOGLE_CREDENTIALS_FILE", "data/st-asset-project-8000c6bb9905.json")
    GOOGLE_CREDENTIALS_JSON = os.environ.get("GOOGLE_CREDENTIALS_JSON")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

def _get_consumables_client():
    creds = None
    if GOOGLE_CREDENTIALS_JSON:
        import json
        creds = Credentials.from_service_account_info(json.loads(GOOGLE_CREDENTIALS_JSON), scopes=SCOPES)
    elif os.path.exists(GOOGLE_CREDENTIALS_FILE):
        creds = Credentials.from_service_account_file(GOOGLE_CREDENTIALS_FILE, scopes=SCOPES)
    else:
        print("⚠️  소모품 시트 인증 정보 없음")
        return None, None
        
    try:
        client = gspread.authorize(creds)
        spreadsheet = client.open_by_key(CONSUMABLES_SPREADSHEET_ID)
        return client, spreadsheet
    except Exception as e:
        print(f"⚠️  소모품 Google Sheets 연결 오류: {e}")
        return None, None

def get_available_months():
    _, ss = _get_consumables_client()
    if not ss: return []
    # "월"로 끝나는 시트 이름 반환
    months = [ws.title for ws in ss.worksheets() if ws.title.endswith("월")]
    return months

def get_items_list():
    _, ss = _get_consumables_client()
    if not ss: return []
    try:
        ws = ss.worksheet("품목리스트")
        # A부터 E열까지 (분류, 품목, 가격, 관리여부, 초기수량)
        records = ws.get_values("A2:E")
        items = []
        tracked_item_names = set()

        for r in records:
            if not r or not str(r[0]).strip(): continue
            is_tracked = False
            base_qty = 0
            
            # 파이썬 Index 오류 방지 처리를 통해 D, E열 접근
            if len(r) > 3 and str(r[3]).strip().upper() == "O":
                is_tracked = True
                tracked_item_names.add(str(r[1]).strip())
                try:
                    if len(r) > 4:
                        base_qty = int(str(r[4]).strip().replace(',', ''))
                except ValueError:
                    base_qty = 0

            items.append({
                "category": str(r[0]).strip() if len(r) > 0 else "",
                "item_name": str(r[1]).strip() if len(r) > 1 else "",
                "price": str(r[2]).strip() if len(r) > 2 else "",
                "is_tracked": is_tracked,
                "base_qty": base_qty,
                "current_stock": base_qty if is_tracked else None,
                "dispatched_qty": 0 if is_tracked else None
            })

        # 재고 관리 대상이 있으면 전 월의 출고 내역을 Batch Get으로 가져와 잔여 재고 계산
        if tracked_item_names:
            months = [ws.title for ws in ss.worksheets() if ws.title.endswith("월")]
            if months:
                ranges = [f"{m}!A2:D" for m in months]
                batch_res = ss.values_batch_get(ranges)
                dispatched_agg = {name: 0 for name in tracked_item_names}

                for res in batch_res.get('valueRanges', []):
                    values = res.get('values', [])
                    for row in values:
                        if len(row) > 2:
                            i_name = str(row[1]).strip()
                            if i_name in tracked_item_names:
                                try:
                                    qty = int(str(row[2]).strip().replace(',', ''))
                                    dispatched_agg[i_name] += qty
                                except ValueError:
                                    pass

                for item in items:
                    if item["is_tracked"]:
                        i_name = item["item_name"]
                        d_qty = dispatched_agg.get(i_name, 0)
                        item["dispatched_qty"] = d_qty
                        item["current_stock"] = item["base_qty"] - d_qty

        return items
    except Exception as e:
        print(f"Error reading items list: {e}")
        return []

def get_outbound_history(month: str):
    _, ss = _get_consumables_client()
    if not ss: return []
    try:
        ws = ss.worksheet(month)
        # A부터 D열까지 (날짜, 품목, 수량, 이름)
        records = ws.get_values("A2:D")
        history = []
        for i, r in enumerate(records):
            if not r or not str(r[0]).strip() or str(r[0]).strip() == "날짜": continue
            history.append({
                "row_index": i + 2, # 시트 내 실제 행 번호 (A2부터 시작)
                "date": str(r[0]).strip() if len(r) > 0 else "",
                "item_name": str(r[1]).strip() if len(r) > 1 else "",
                "quantity": str(r[2]).strip() if len(r) > 2 else "",
                "user_name": str(r[3]).strip() if len(r) > 3 else ""
            })
        return history
    except Exception as e:
        print(f"Error reading outbound history: {e}")
        return []

def get_estimate(month: str):
    """
    해당 월의 출고 데이터(A~D열)와 품목 리스트 데이터를 조합해
    파이썬 백엔드에서 그룹별로 수량을 합산하여 견적서를 직접 생성합니다.
    (사용자 요청: 시트의 F 이후 단은 사용하지 않음)
    """
    history = get_outbound_history(month)
    if not history:
        return []

    # 1. 품목 단가 딕셔너리 생성
    items = get_items_list()
    item_dict = {}
    for it in items:
        raw_p = it.get('price', '0').replace(',', '').strip()
        price = int(raw_p) if raw_p.isdigit() else 0
        item_dict[it['item_name']] = {
            'category': it.get('category', ''),
            'price': price
        }

    # 2. 아이템별 그룹화 (수량 합산, 사용자별 수량 병합)
    agg = {}
    for h in history:
        i_name = h.get('item_name', '').strip()
        if not i_name: continue
        
        qty_str = str(h.get('quantity', '0')).replace(',', '').strip()
        qty = int(qty_str) if qty_str.isdigit() else 0
        user = str(h.get('user_name', '')).strip()

        if i_name not in agg:
            agg[i_name] = {'total_qty': 0, 'users': {}}

        agg[i_name]['total_qty'] += qty
        
        if user:
            if user in agg[i_name]['users']:
                agg[i_name]['users'][user] += qty
            else:
                agg[i_name]['users'][user] = qty

    # 3. 견적서 형태 리스트로 변환
    estimate = []
    no = 1
    for i_name, data in agg.items():
        # 사용자 문자열 만들기 (ex: "홍길동(2), 김철수")
        user_list = []
        for u, q in data['users'].items():
            if q > 1:
                user_list.append(f"{u}({q})")
            else:
                user_list.append(u)
        users_str = ", ".join(user_list)

        info = item_dict.get(i_name, {'category': '', 'price': 0})
        cat = info['category']
        u_price = info['price']
        t_price = data['total_qty'] * u_price

        estimate.append({
            "no": str(no),
            "category": cat,
            "item_name": i_name,
            "total_qty": str(data['total_qty']),
            "users": users_str,
            "unit_price": format(u_price, ","),
            "total_price": format(t_price, ",")
        })
        no += 1

    return estimate

def add_outbound(month: str, data: dict) -> bool:
    """월별 출고 시트 왼쪽 A~D열의 빈 칸 맨 아래에 데이터를 기록합니다."""
    _, ss = _get_consumables_client()
    if not ss: return False
    try:
        ws = ss.worksheet(month)
        col_A = ws.col_values(1) # A열 (날짜) 데이터들
        next_row = len(col_A) + 1 # 최초로 빈 행
        
        # update() 메서드를 활용하여 A~D 열에 값 대입
        ws.update(f"A{next_row}:D{next_row}", [[
            data.get('date', ''), 
            data.get('item_name', ''), 
            data.get('quantity', ''), 
            data.get('user_name', '')
        ]])
        return True
    except Exception as e:
        print(f"Error adding outbound: {e}")
        return False

def update_outbound_history(month: str, row_index: int, data: dict) -> bool:
    """월별 출고 시트의 특정 행(row_index) 데이터를 수정합니다."""
    _, ss = _get_consumables_client()
    if not ss: return False
    try:
        ws = ss.worksheet(month)
        ws.update(f"A{row_index}:D{row_index}", [[
            data.get('date', ''), 
            data.get('item_name', ''), 
            data.get('quantity', ''), 
            data.get('user_name', '')
        ]])
        return True
    except Exception as e:
        print(f"Error updating outbound: {e}")
        return False

def delete_outbound_history(month: str, row_index: int) -> bool:
    """월별 출고 시트의 특정 행(row_index)을 완전히 삭제합니다."""
    _, ss = _get_consumables_client()
    if not ss: return False
    try:
        ws = ss.worksheet(month)
        ws.delete_rows(row_index)
        return True
    except Exception as e:
        print(f"Error deleting outbound: {e}")
        return False

def save_item(data: dict) -> bool:
    """품목리스트 시트 A~E열에 새로운 품목을 추가하거나 기존 품목(B열 기준)을 수정합니다."""
    _, ss = _get_consumables_client()
    if not ss: return False
    try:
        ws = ss.worksheet("품목리스트")
        col_B = ws.col_values(2) # B열 (품명) 기준
        target_item = data.get('item_name', '').strip()
        
        row_idx = None
        for i, val in enumerate(col_B):
            if val.strip() == target_item:
                row_idx = i + 1
                break
                
        is_tracked_str = 'O' if data.get('is_tracked') else 'X'
        base_qty_str = str(data.get('base_qty', '0'))

        if row_idx:
            # 존재하면 해당 행 A~E 덮어쓰기
            ws.update(f"A{row_idx}:E{row_idx}", [[
                data.get('category', ''), 
                data.get('item_name', ''), 
                data.get('price', ''),
                is_tracked_str,
                base_qty_str
            ]])
        else:
            # 없으면 맨 아래(B열 비어있는 곳 기준) A~E 추가
            next_row = len(col_B) + 1
            ws.update(f"A{next_row}:E{next_row}", [[
                data.get('category', ''), 
                data.get('item_name', ''), 
                data.get('price', ''),
                is_tracked_str,
                base_qty_str
            ]])
        return True
    except Exception as e:
        print(f"Error saving item: {e}")
        return False
