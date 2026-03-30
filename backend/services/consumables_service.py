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
    from config import CONSUMABLES_MASTER_SPREADSHEET_ID, CONSUMABLES_OUTBOUND_SPREADSHEET_ID, GOOGLE_CREDENTIALS_FILE, GOOGLE_CREDENTIALS_JSON
except ImportError:
    CONSUMABLES_MASTER_SPREADSHEET_ID = os.environ.get("CONSUMABLES_MASTER_SPREADSHEET_ID")
    CONSUMABLES_OUTBOUND_SPREADSHEET_ID = os.environ.get("CONSUMABLES_OUTBOUND_SPREADSHEET_ID")
    GOOGLE_CREDENTIALS_FILE = os.environ.get("GOOGLE_CREDENTIALS_FILE", "data/st-asset-project-8000c6bb9905.json")
    GOOGLE_CREDENTIALS_JSON = os.environ.get("GOOGLE_CREDENTIALS_JSON")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

import time

_CACHE = {}
_CACHE_TTL = 30  # 30초 캐싱 (잦은 API 호출 방지용)

def _get_cached(key, func, *args):
    now = time.time()
    if key in _CACHE:
        val, exp = _CACHE[key]
        if now < exp:
            return val
    val = func(*args)
    _CACHE[key] = (val, now + _CACHE_TTL)
    return val

def invalidate_cache():
    _CACHE.clear()

def _get_consumables_client(spreadsheet_id: str = None):
    """
    구글 시트 클라이언트를 반환합니다.
    spreadsheet_id가 전달되지 않으면 마스터 시트를 기본으로 반환합니다.
    """
    if not spreadsheet_id:
        spreadsheet_id = CONSUMABLES_MASTER_SPREADSHEET_ID

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
        spreadsheet = client.open_by_key(spreadsheet_id)
        return client, spreadsheet
    except Exception as e:
        print(f"⚠️  소모품 Google Sheets 연결 오류 (ID: {spreadsheet_id}): {e}")
        return None, None

def get_available_months():
    return _get_cached("months", _get_available_months_impl)

def create_month_sheet(month_name: str, start_date: str) -> bool:
    try:
        _, ss = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
        if not ss: return False
        
        # 이름 중복 확인
        existing = [ws.title for ws in ss.worksheets()]
        if month_name in existing:
            return False
            
        # 새 시트 추가
        ws = ss.add_worksheet(title=month_name, rows=1000, cols=20)
        
        # 헤더 기록
        headers = ['날짜', '품목 명', '수량 (개)', '사용자 이름']
        ws.update('A1:D1', [headers])
        
        # 시작 안내 데이터 한 줄 추가 (옵션)
        if start_date:
            ws.update('A2:D2', [[start_date, '==출고 내역 시작==', '', '']])
            
        invalidate_cache()
        return True
    except Exception as e:
        print(f"Error creating month sheet: {e}")
        return False

def _get_available_months_impl():
    _, ss = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    if not ss: return []
    # "월" 키워드가 포함된 시트만 출고 내역 시트로 간주
    months = [ws.title for ws in ss.worksheets() if "월" in ws.title and ws.title != "품목리스트" and ws.title != "재고리스트"]
    
    import re
    from datetime import datetime
    current_year = datetime.now().year
    
    def sort_key(title):
        # "2026년 4월" 또는 "3월" 형식 처리
        year_match = re.search(r'(\d{4})년', title)
        month_match = re.search(r'(\d{1,2})월', title)
        
        month = int(month_match.group(1)) if month_match else 0
        now = datetime.now()
        
        if year_match:
            year = int(year_match.group(1))
        else:
            # 연도가 없으면 현재 연도로 가정하되, 
            # 만약 월이 현재 월보다 많이 크면(예: 현재 3월인데 12월) 작년으로 간주
            year = now.year
            if month > now.month + 3: # 넉넉하게 3개월 정도 여유 둠
                year -= 1
        
        return (year, month)

    # 연도와 월 기준 내림차순 정렬
    months.sort(key=sort_key, reverse=True)
    return months

def get_items_list(month=None):
    return _get_cached(f"items_{month}", lambda: _get_items_list_impl(month=month))

def _get_items_list_impl(month=None):
    # 품목 정보는 Master 시트에서 가져옴
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master: return []
    try:
        ws = ss_master.worksheet("품목리스트")
        # A부터 E열까지 (분류, 품목, 가격, 관리여부, 초기수량)
        records = ws.get_values("A2:F")
        items = []
        tracked_item_names = set()

        for i, r in enumerate(records):
            if not r or not str(r[0]).strip(): continue
            is_tracked = False
            base_qty = 0
            order_qty = 0
            
            if len(r) > 3 and str(r[3]).strip().upper() == "O":
                is_tracked = True
                tracked_item_names.add(str(r[1]).strip())
                try:
                    if len(r) > 4:
                        base_qty = int(str(r[4]).strip().replace(',', ''))
                except ValueError:
                    base_qty = 0
                    
                try:
                    if len(r) > 5:
                        order_qty = int(str(r[5]).strip().replace(',', ''))
                except ValueError:
                    order_qty = 0

            items.append({
                "category": str(r[0]).strip() if len(r) > 0 else "",
                "item_name": str(r[1]).strip() if len(r) > 1 else "",
                "price": str(r[2]).strip() if len(r) > 2 else "",
                "is_tracked": is_tracked,
                "base_qty": base_qty,        # 이제 이것은 '고정 재고'를 의미
                "order_qty": order_qty,      # 발주 수량
                "current_stock": order_qty if is_tracked else None,
                "row_index": i + 2,
                "dispatched_qty": 0 if is_tracked else None
            })

        # 2단계: Tracking 대상이 있으면 출고 데이터를 합산
        if tracked_item_names:
            if month and month != "전체":
                months = [month]
            else:
                _, ss_outbound = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
                if not ss_outbound: return items
                months = [ws.title for ws in ss_outbound.worksheets() if "월" in ws.title and ws.title != "품목리스트"]
                
            if months:
                _, ss_outbound = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
                if not ss_outbound: return items
                ranges = [f"{m}!A2:D" for m in months]
                batch_res = ss_outbound.values_batch_get(ranges)
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
                        item["current_stock"] = item["order_qty"] - d_qty

        return items
    except Exception as e:
        print(f"Error reading items list: {e}")
        return []

def get_outbound_history(month: str):
    return _get_cached(f"outbound_{month}", _get_outbound_history_impl, month)

def _get_outbound_history_impl(month: str):
    _, ss = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
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
        user_count = len(data['users'])
        for u, q in data['users'].items():
            # 팀명 제거 (Name (Team) -> Name)
            name_only = u.split(' (')[0] if ' (' in u else u
            
            # 사용자가 2명 이상이고, 해당 사용자가 받은 수량이 2개 이상일 때만 (Q) 표시
            # 사용자가 1명인 경우는 수량에 관계없이 이름만 표시
            if user_count > 1 and q > 1:
                user_list.append(f"{name_only} ({q})")
            else:
                user_list.append(name_only)
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
    _, ss = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
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
        invalidate_cache()
        # 데이터 변경 시 재고리스트 요약 시트 동기화
        sync_inventory_summary_sheet()
        return True
    except Exception as e:
        print(f"Error adding outbound: {e}")
        return False

def update_outbound_history(month: str, row_index: int, data: dict) -> bool:
    """월별 출고 시트의 특정 행(row_index) 데이터를 수정합니다."""
    _, ss = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    if not ss: return False
    try:
        ws = ss.worksheet(month)
        ws.update(f"A{row_index}:D{row_index}", [[
            data.get('date', ''), 
            data.get('item_name', ''), 
            data.get('quantity', ''), 
            data.get('user_name', '')
        ]])
        invalidate_cache()
        # 데이터 변경 시 재고리스트 요약 시트 동기화
        sync_inventory_summary_sheet()
        return True
    except Exception as e:
        print(f"Error updating outbound: {e}")
        return False

def delete_outbound_history(month: str, row_index: int) -> bool:
    """월별 출고 시트의 특정 행(row_index)을 완전히 삭제합니다."""
    _, ss = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    if not ss: return False
    try:
        ws = ss.worksheet(month)
        ws.delete_rows(row_index)
        invalidate_cache()
        # 데이터 변경 시 재고리스트 요약 시트 동기화
        sync_inventory_summary_sheet()
        return True
    except Exception as e:
        print(f"Error deleting outbound: {e}")
        return False

def save_item(data: dict) -> bool:
    """품목리스트 시트 A~F열에 새로운 품목을 추가하거나 기존 품목(B열 기준)을 수정합니다."""
    _, ss = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss: return False
    try:
        ws = ss.worksheet("품목리스트")
        target_item = data.get('item_name', '').strip()
        row_idx = data.get('row_index') # 만약 인라인 수정 등에서 행 번호를 직접 보낸다면 우선순위 가짐
        
        if not row_idx:
            col_B = ws.col_values(2) # B열 (품명) 기준
            for i, val in enumerate(col_B):
                if val.strip() == target_item:
                    row_idx = i + 1
                    break
                
        is_tracked_str = 'O' if data.get('is_tracked') else 'X'
        base_qty_str = str(data.get('base_qty', '0'))
        order_qty_str = str(data.get('order_qty', '0'))

        if row_idx:
            # 존재하면 해당 행 A~F 덮어쓰기
            ws.update(f"A{row_idx}:F{row_idx}", [[
                data.get('category', ''), 
                data.get('item_name', ''), 
                data.get('price', ''),
                is_tracked_str,
                base_qty_str,
                order_qty_str
            ]])
        else:
            # 없으면 맨 아래(B열 비어있는 곳 기준) A~F 추가
            next_row = len(col_B) + 1
            ws.update(f"A{next_row}:F{next_row}", [[
                data.get('category', ''), 
                data.get('item_name', ''), 
                data.get('price', ''),
                is_tracked_str,
                base_qty_str,
                order_qty_str
            ]])
        invalidate_cache()
        # 데이터 변경 시 재고리스트 요약 시트 동기화
        sync_inventory_summary_sheet()
        return True
    except Exception as e:
        print(f"Error saving item: {e}")
        return False

def get_item_outbound_history(item_name: str):
    """특정 품목의 과거 출고 이력을 모든 월별 시트에서 검색하여 년-월별 집계 가능하게 반환"""
    _, ss_outbound = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    if not ss_outbound: return []
    
    months = [ws.title for ws in ss_outbound.worksheets() if "월" in ws.title and ws.title != "품목리스트"]
    if not months: return []
    
    ranges = [f"{m}!A2:D" for m in months]
    batch_res = ss_outbound.values_batch_get(ranges)
    
    history = []
    
    for month_title, res in zip(months, batch_res.get('valueRanges', [])):
        values = res.get('values', [])
        for row in values:
            if len(row) > 2 and str(row[1]).strip() == item_name:
                qty_str = str(row[2]).strip().replace(',', '')
                qty = int(qty_str) if qty_str.isdigit() else 0
                history.append({
                    "month": month_title,
                    "date": str(row[0]).strip() if len(row) > 0 else "",
                    "quantity": qty,
                    "user_name": str(row[3]).strip() if len(row) > 3 else ""
                })
    return history

def sync_inventory_summary_sheet():
    """
    현재 등록된 모든 소모품의 마스터 정보와 '전체 기간' 기준 재고 현황을 
    '재고리스트' 구글 시트에 일괄 업데이트합니다.
    """
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master: return False
    
    try:
        # 1. 최신 데이터 가져오기 (전체 기간 기준)
        items = _get_items_list_impl(month=None)
        
        # 2. 시트 데이터 구성을 위한 헤더 및 행 생성
        headers = ['분류', '품목명', '단가', '재고추적여부', '고정재고(기준)', '현재재고(입고량)', '총출고량', '최종잔여재고', '상태']
        rows = [headers]
        
        for it in items:
            is_tracked = "O" if it.get("is_tracked") else "X"
            dispatched = it.get("dispatched_qty", 0) if it.get("is_tracked") else "-"
            current = it.get("current_stock", 0) if it.get("is_tracked") else "-"
            
            status = "-"
            if it.get("is_tracked"):
                base = it.get("base_qty", 1)
                status = "🚨 부족" if current < base else "✅ 양호"

            rows.append([
                it.get("category", ""),
                it.get("item_name", ""),
                it.get("price", ""),
                is_tracked,
                it.get("base_qty", ""),
                it.get("order_qty", ""),
                dispatched,
                current,
                status
            ])
            
        # 3. '재고리스트' 시트에 덮어쓰기
        ws = ss_master.worksheet("재고리스트")
        ws.clear()
        ws.update("A1", rows)
        return True
    except Exception as e:
        print(f"Error syncing inventory summary sheet: {e}")
        return False
