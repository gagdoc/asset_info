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
    from config import CONSUMABLES_MASTER_SPREADSHEET_ID, CONSUMABLES_OUTBOUND_SPREADSHEET_ID, GOOGLE_CREDENTIALS_FILE, GOOGLE_CREDENTIALS_JSON, TONER_SPREADSHEET_ID, TONER_SHEET_GID
except ImportError:
    CONSUMABLES_MASTER_SPREADSHEET_ID = os.environ.get("CONSUMABLES_MASTER_SPREADSHEET_ID")
    CONSUMABLES_OUTBOUND_SPREADSHEET_ID = os.environ.get("CONSUMABLES_OUTBOUND_SPREADSHEET_ID")
    GOOGLE_CREDENTIALS_FILE = os.environ.get("GOOGLE_CREDENTIALS_FILE", "data/st-asset-project-8000c6bb9905.json")
    GOOGLE_CREDENTIALS_JSON = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    TONER_SPREADSHEET_ID = os.environ.get("TONER_SPREADSHEET_ID", "19AMXwNtrF8BcA_BqXpBcy-vWKX8Wu2IkbFTYNPZORc0")
    TONER_SHEET_GID = int(os.environ.get("TONER_SHEET_GID", "394456635"))

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

import time
import logging

logger = logging.getLogger(__name__)

_CACHE = {}
_CACHE_TTL = 120  # 120초 캐싱 (Google Sheets API 과다 호출 방지)

def _get_cached(key, func, *args):
    now = time.time()
    if key in _CACHE:
        val, exp = _CACHE[key]
        if now < exp:
            return val
    val = func(*args)
    _CACHE[key] = (val, now + _CACHE_TTL)
    return val

def invalidate_cache(key_prefix: str = None):
    """캐시 무효화. key_prefix 지정 시 해당 키만, 없으면 전체 삭제."""
    if key_prefix is None:
        _CACHE.clear()
    else:
        for k in list(_CACHE.keys()):
            if k.startswith(key_prefix):
                del _CACHE[k]

def _retry_sheets_op(func, max_retries=3, initial_delay=1.0):
    """Google Sheets API 호출을 재시도합니다 (지수 백오프).
    읽기 전용 작업에 사용하세요. 쓰기 작업은 중복 방지를 위해 직접 호출합니다."""
    last_exc = None
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            last_exc = e
            if attempt < max_retries - 1:
                delay = initial_delay * (2 ** attempt)
                logger.warning(f"Sheets API 오류 (시도 {attempt+1}/{max_retries}): {e}. {delay:.1f}초 후 재시도...")
                time.sleep(delay)
    raise last_exc

def _get_worksheet_safe(ss, sheet_name: str):
    """워크시트를 안전하게 가져옵니다. 없으면 None 반환."""
    try:
        return ss.worksheet(sheet_name)
    except Exception as e:
        logger.error(f"워크시트 '{sheet_name}' 없음 또는 접근 오류: {e}")
        return None

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
        headers = ['날짜', '품목 명', '수량 (개)', '사용자 이름', '출고유형']
        ws.update('A1:E1', [headers])
        
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
    # 재고는 항상 전체 누적 기준이므로 캐시 키를 단일키로 통합
    return _get_cached("items_all", lambda: _get_items_list_impl())

def _get_items_list_impl(month=None):
    # 품목 정보는 Master 시트에서 가져옴
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master: return []
    try:
        ws = _get_worksheet_safe(ss_master, "품목리스트")
        if not ws:
            logger.error("'품목리스트' 시트를 찾을 수 없습니다.")
            return []
        # A부터 F열까지 (분류, 품목, 가격, 관리여부, 초기수량, 발주수량)
        records = _retry_sheets_op(lambda: ws.get_values("A2:F"))
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
        # 재고는 월 필터와 무관하게 항상 전체 월 누적 출고량으로 계산 (물류 입출고 방식)
        if tracked_item_names:
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
        ws = _get_worksheet_safe(ss, month)
        if not ws:
            logger.warning(f"출고 내역 시트 없음: {month}")
            return []
        # A부터 G열까지 (날짜, 품목, 수량, 이름, 출고유형, 지급담당, 수령방법)
        records = _retry_sheets_op(lambda: ws.get_values("A2:G"))
        history = []
        for i, r in enumerate(records):
            if not r or not str(r[0]).strip() or str(r[0]).strip() == "날짜": continue
            outbound_type = str(r[4]).strip() if len(r) > 4 else "일반"
            # 위탁 출고는 월별 출고 내역에서 제외 — 위탁 토너 내역에서 별도 관리
            if outbound_type == '위탁':
                continue
            history.append({
                "row_index": i + 2, # 시트 내 실제 행 번호 (A2부터 시작)
                "date": str(r[0]).strip() if len(r) > 0 else "",
                "item_name": str(r[1]).strip() if len(r) > 1 else "",
                "quantity": str(r[2]).strip() if len(r) > 2 else "",
                "user_name": str(r[3]).strip() if len(r) > 3 else "",
                "outbound_type": outbound_type,
                "staff": str(r[5]).strip() if len(r) > 5 else "",
                "delivery": str(r[6]).strip() if len(r) > 6 else "",
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
    # 위탁 출고는 견적서에서 제외 — 별도 위탁 토너 내역으로 관리
    agg = {}
    for h in history:
        if h.get('outbound_type', '일반') == '위탁':
            continue
        i_name = h.get('item_name', '').strip()
        if not i_name: continue
        # 시트 맨 위 '==출고 내역 시작==' 마커 행 등 구분자 제외
        if i_name.startswith('==') and i_name.endswith('=='):
            continue

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
    """월별 출고 시트 왼쪽 A~E열의 빈 칸 맨 아래에 데이터를 기록합니다."""
    _, ss = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    if not ss: return False
    try:
        ws = _get_worksheet_safe(ss, month)
        if not ws:
            logger.error(f"출고 등록 실패: '{month}' 시트 없음")
            return False
        col_A = _retry_sheets_op(lambda: ws.col_values(1))  # A열 (날짜) 데이터들
        next_row = len(col_A) + 1 # 최초로 빈 행

        # E열: 출고유형 (일반/위탁), 기본값은 일반
        outbound_type = data.get('outbound_type', '일반')
        if not outbound_type or outbound_type.strip() == '':
            outbound_type = '일반'

        # update() 메서드를 활용하여 A~G 열에 값 대입
        ws.update(f"A{next_row}:G{next_row}", [[
            data.get('date', ''),
            data.get('item_name', ''),
            data.get('quantity', ''),
            data.get('user_name', ''),
            outbound_type,
            data.get('staff', ''),
            data.get('delivery', ''),
        ]])
        invalidate_cache(f"outbound_{month}")
        invalidate_cache("items_all")
        # 데이터 변경 시 재고리스트 요약 시트 동기화
        sync_inventory_summary_sheet()

        # 일반·위탁 모두 토너 재고 시트에서 품목 검색 후 차감
        # (사전 체크 없이 직접 deduct 시도 — _is_in_toner_sheet API 실패 우회)
        try:
            qty_int = int(str(data.get('quantity', '0')).replace(',', ''))
            i_name = data.get('item_name', '').strip()
            if i_name:
                result = deduct_toner_stock(i_name, qty_int)
                if result:
                    logger.info(f"토너 재고 차감 완료: '{i_name}' -{qty_int} (유형: {outbound_type})")
                else:
                    logger.debug(f"토너 재고 시트에 없는 품목 (차감 없음): '{i_name}'")
        except Exception as e:
            logger.warning(f"토너 재고 차감 중 오류 (출고 기록은 완료): {e}")

        return True
    except Exception as e:
        print(f"Error adding outbound: {e}")
        return False

def _resolve_row_index(ws, row_index: int, verify_date: str, verify_item: str, verify_user: str = "") -> int:
    """
    row_index가 유효한지 검증하고, 내용 불일치 시 시트 전체에서 실제 행을 탐색합니다.
    verify_user까지 제공되면 날짜+품목+사용자 3중 검증으로 중복 행 오탐 방지.
    반환값: 실제 삭제/수정할 행 번호 (1-indexed), 찾지 못하면 -1
    """
    def _match(r_date, r_item, r_user):
        if r_date != verify_date or r_item != verify_item:
            return False
        if verify_user:
            return r_user == verify_user
        return True

    try:
        row_values = ws.row_values(row_index)
        actual_date = str(row_values[0]).strip() if len(row_values) > 0 else ""
        actual_item = str(row_values[1]).strip() if len(row_values) > 1 else ""
        actual_user = str(row_values[3]).strip() if len(row_values) > 3 else ""

        # 내용이 일치하면 그대로 사용
        if _match(actual_date, actual_item, actual_user):
            return row_index

        # 불일치: 시트 전체에서 재탐색 (날짜+품목+사용자)
        logger.warning(
            f"row_index={row_index} 내용 불일치 "
            f"(기대: {verify_date}/{verify_item}/{verify_user}, "
            f"실제: {actual_date}/{actual_item}/{actual_user}). 전체 탐색 중..."
        )
        all_rows = ws.get_values("A2:G")
        for i, row in enumerate(all_rows):
            r_date = str(row[0]).strip() if len(row) > 0 else ""
            r_item = str(row[1]).strip() if len(row) > 1 else ""
            r_user = str(row[3]).strip() if len(row) > 3 else ""
            if _match(r_date, r_item, r_user):
                found = i + 2
                logger.info(f"실제 행 발견: {found}")
                return found

        logger.error(f"행을 찾을 수 없음: {verify_date}/{verify_item}/{verify_user}")
        return -1
    except Exception as e:
        logger.error(f"행 검증 중 오류: {e}")
        return row_index  # 검증 실패 시 원래 인덱스로 fallback


def update_outbound_history(month: str, row_index: int, data: dict) -> bool:
    """월별 출고 시트의 특정 행(row_index) 데이터를 수정합니다.
    verify_date, verify_item이 제공되면 삭제 전 행 내용을 검증합니다."""
    _, ss = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    if not ss: return False
    try:
        ws = _get_worksheet_safe(ss, month)
        if not ws: return False

        # 행 내용 검증 (인덱스 이동 방지)
        verify_date = str(data.get('verify_date', data.get('date', ''))).strip()
        verify_item = str(data.get('verify_item', data.get('item_name', ''))).strip()
        verify_user = str(data.get('verify_user', data.get('user_name', ''))).strip()
        if verify_date and verify_item:
            row_index = _resolve_row_index(ws, row_index, verify_date, verify_item, verify_user)
            if row_index == -1:
                return False

        outbound_type = data.get('outbound_type', '일반')
        if not outbound_type or outbound_type.strip() == '':
            outbound_type = '일반'
        ws.update(f"A{row_index}:G{row_index}", [[
            data.get('date', ''),
            data.get('item_name', ''),
            data.get('quantity', ''),
            data.get('user_name', ''),
            outbound_type,
            data.get('staff', ''),
            data.get('delivery', ''),
        ]])
        invalidate_cache(f"outbound_{month}")
        invalidate_cache("items_all")
        sync_inventory_summary_sheet()
        return True
    except Exception as e:
        logger.error(f"Error updating outbound: {e}")
        return False


def delete_outbound_history(month: str, row_index: int,
                            verify_date: str = "", verify_item: str = "", verify_user: str = "") -> bool:
    """월별 출고 시트의 특정 행(row_index)을 완전히 삭제합니다.
    verify_date + verify_item + verify_user 3중 검증으로 중복 행 오탐 방지."""
    _, ss = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    if not ss: return False
    try:
        ws = _get_worksheet_safe(ss, month)
        if not ws: return False

        # 행 내용 검증 (인덱스 이동 방지)
        if verify_date and verify_item:
            row_index = _resolve_row_index(ws, row_index, verify_date, verify_item, verify_user)
            if row_index == -1:
                return False

        ws.delete_rows(row_index)
        invalidate_cache(f"outbound_{month}")
        invalidate_cache("items_all")
        sync_inventory_summary_sheet()
        return True
    except Exception as e:
        logger.error(f"Error deleting outbound: {e}")
        return False

def save_item(data: dict) -> bool:
    """품목리스트 시트 A~F열에 새로운 품목을 추가하거나 기존 품목(B열 기준)을 수정합니다."""
    _, ss = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss: return False
    try:
        ws = _get_worksheet_safe(ss, "품목리스트")
        if not ws: return False
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

def delete_item(row_index: int, item_name: str) -> bool:
    """품목리스트 시트에서 특정 행을 삭제합니다. row_index와 item_name 이중 검증."""
    _, ss = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss: return False
    try:
        ws = _get_worksheet_safe(ss, "품목리스트")
        if not ws: return False

        # 이중 검증: 해당 행의 B열(품목명)이 일치하는지 확인
        cell_val = ws.cell(row_index, 2).value  # B열
        if str(cell_val).strip() != item_name.strip():
            logger.warning(f"품목 삭제 검증 실패: row={row_index}, 기대={item_name}, 실제={cell_val}")
            return False

        ws.delete_rows(row_index)
        invalidate_cache()
        invalidate_cache("items_all")
        sync_inventory_summary_sheet()
        logger.info(f"품목 삭제 완료: row={row_index}, item={item_name}")
        return True
    except Exception as e:
        logger.error(f"품목 삭제 오류: {e}")
        return False

def get_item_outbound_history(item_name: str):
    """특정 품목의 과거 출고 이력을 모든 월별 시트에서 검색하여 년-월별 집계 가능하게 반환"""
    _, ss_outbound = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    if not ss_outbound: return []

    months = [ws.title for ws in ss_outbound.worksheets() if "월" in ws.title and ws.title != "품목리스트"]
    if not months: return []

    ranges = [f"{m}!A2:E" for m in months]
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
                    "user_name": str(row[3]).strip() if len(row) > 3 else "",
                    "outbound_type": str(row[4]).strip() if len(row) > 4 else "일반"
                })
    return history


def get_tonner_consignment_history(month: str = None):
    """위탁 출고된 Tonner 내역을 반환. month가 없으면 전체 월 조회."""
    _, ss_outbound = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    if not ss_outbound: return []

    if month:
        months = [month]
    else:
        months = [ws.title for ws in ss_outbound.worksheets() if "월" in ws.title and ws.title != "품목리스트"]
    if not months: return []

    ranges = [f"{m}!A2:E" for m in months]
    batch_res = ss_outbound.values_batch_get(ranges)

    history = []
    for month_title, res in zip(months, batch_res.get('valueRanges', [])):
        values = res.get('values', [])
        for i, row in enumerate(values):
            if len(row) < 3: continue
            outbound_type = str(row[4]).strip() if len(row) > 4 else "일반"
            if outbound_type != '위탁': continue
            item_name = str(row[1]).strip()
            qty_str = str(row[2]).strip().replace(',', '')
            qty = int(qty_str) if qty_str.isdigit() else 0
            history.append({
                "month": month_title,
                "row_index": i + 2,  # 시트 내 실제 행 번호 (A2부터 시작)
                "date": str(row[0]).strip() if len(row) > 0 else "",
                "item_name": item_name,
                "quantity": qty,
                "user_name": str(row[3]).strip() if len(row) > 3 else "",
                "outbound_type": "위탁"
            })
    return history

## ── 토너 전용 재고 시트 ──────────────────────────────────────

def _get_toner_worksheet():
    """토너 전용 재고 스프레드시트의 특정 탭(GID) 반환"""
    if not TONER_SPREADSHEET_ID:
        logger.warning("TONER_SPREADSHEET_ID 미설정")
        return None
    _, ss = _get_consumables_client(TONER_SPREADSHEET_ID)
    if not ss:
        return None
    try:
        return ss.get_worksheet_by_id(TONER_SHEET_GID)
    except Exception as e:
        logger.error(f"토너 재고 워크시트(GID={TONER_SHEET_GID}) 접근 오류: {e}")
        return None


def _find_col_idx(headers: list, keywords: list) -> int | None:
    """헤더 목록에서 키워드를 포함하는 첫 번째 컬럼 인덱스 반환 (대소문자 무시)"""
    for i, h in enumerate(headers):
        h_lower = h.lower()
        if any(kw in h_lower for kw in keywords):
            return i
    return None


def get_toner_inventory():
    """토너 전용 재고 시트 전체 데이터 반환 (캐시 적용)"""
    return _get_cached("toner_inventory", _get_toner_inventory_impl)


def _get_toner_inventory_impl():
    ws = _get_toner_worksheet()
    if not ws:
        return {"headers": [], "items": [], "name_col": None, "stock_col": None, "model_col": None}
    try:
        all_values = ws.get_all_values()
        if not all_values:
            return {"headers": [], "items": [], "name_col": None, "stock_col": None, "model_col": None}

        raw_headers = all_values[0]
        headers = [str(h).strip() for h in raw_headers]

        # 주요 컬럼 인덱스 탐색
        name_col_idx   = _find_col_idx(headers, ['품번', '토너_품번', 'toner', 'tonner', '토너', '품목명', '명칭', 'name', '모델', 'model', '품목'])
        stock_col_idx  = _find_col_idx(headers, ['재고', 'stock', 'qty', '수량'])
        model_col_idx  = _find_col_idx(headers, ['기종', 'compatible', '호환', 'printer'])

        if name_col_idx is None:
            name_col_idx = 0  # 기본값: 첫 번째 컬럼

        items = []
        for row_num, row in enumerate(all_values[1:], start=2):
            # 이름 컬럼이 비어 있으면 건너뜀
            name_val = str(row[name_col_idx]).strip() if name_col_idx < len(row) else ""
            if not name_val:
                continue

            padded = row + [''] * (len(headers) - len(row))
            item = {"row_index": row_num}

            for j, header in enumerate(headers):
                item[header] = str(padded[j]).strip() if j < len(padded) else ""

            # 편의 필드
            item["item_name"] = item.get(headers[name_col_idx], "")

            if stock_col_idx is not None and stock_col_idx < len(headers):
                stock_str = item.get(headers[stock_col_idx], "0").replace(',', '')
                try:
                    item["current_stock"] = int(float(stock_str)) if stock_str.strip() else 0
                except (ValueError, TypeError):
                    item["current_stock"] = 0
            else:
                item["current_stock"] = None

            if model_col_idx is not None and model_col_idx < len(headers):
                item["compatible_models"] = item.get(headers[model_col_idx], "")
            else:
                item["compatible_models"] = ""

            items.append(item)

        name_col  = headers[name_col_idx]  if name_col_idx  is not None else None
        stock_col = headers[stock_col_idx] if stock_col_idx is not None else None
        model_col = headers[model_col_idx] if model_col_idx is not None else None

        return {
            "headers": headers,
            "items": items,
            "name_col": name_col,
            "stock_col": stock_col,
            "model_col": model_col,
        }
    except Exception as e:
        logger.error(f"토너 재고 데이터 로드 오류: {e}")
        return {"headers": [], "items": [], "name_col": None, "stock_col": None, "model_col": None}


def update_toner_item(row_index: int, data: dict) -> bool:
    """토너 재고 시트의 특정 행(row_index) 전체를 업데이트"""
    ws = _get_toner_worksheet()
    if not ws:
        return False
    try:
        headers = ws.row_values(1)
        if not headers:
            return False
        new_row = [str(data.get(h, "")) for h in headers]
        end_col = chr(64 + len(headers))  # A=65 → chr(64+n)
        ws.update(f"A{row_index}:{end_col}{row_index}", [new_row])
        invalidate_cache()
        return True
    except Exception as e:
        logger.error(f"토너 항목 수정 오류 (row {row_index}): {e}")
        return False


def deduct_toner_stock(item_name: str, quantity: int) -> bool:
    """
    토너 출고 시 재고 차감.
    item_name 으로 행을 찾아 재고 컬럼을 (current - quantity)로 갱신.
    음수 방지: 0 미만이면 0으로 설정.
    """
    ws = _get_toner_worksheet()
    if not ws:
        return False
    try:
        all_values = ws.get_all_values()
        if not all_values:
            return False

        headers = [str(h).strip() for h in all_values[0]]
        name_col_idx  = _find_col_idx(headers, ['품번', '토너_품번', 'toner', 'tonner', '토너', '품목명', '명칭', 'name', '모델', 'model', '품목'])
        stock_col_idx = _find_col_idx(headers, ['재고', 'stock', 'qty', '수량'])

        if name_col_idx is None:
            name_col_idx = 0
        if stock_col_idx is None:
            logger.warning(f"토너 재고 컬럼 없음. 헤더: {headers}")
            return False

        logger.info(f"[deduct] 검색 품목: '{item_name}' | name_col={headers[name_col_idx]}(idx={name_col_idx}) | stock_col={headers[stock_col_idx]}(idx={stock_col_idx})")

        # 정확히 일치하는 행 검색 (대소문자 무시)
        item_name_lower = item_name.lower()
        for row_num, row in enumerate(all_values[1:], start=2):
            if name_col_idx >= len(row):
                continue
            row_name = str(row[name_col_idx]).strip()
            if row_name.lower() != item_name_lower:
                continue

            current_str = row[stock_col_idx].replace(',', '') if stock_col_idx < len(row) else "0"
            try:
                current = int(float(current_str)) if current_str.strip() else 0
            except (ValueError, TypeError):
                current = 0

            new_stock = max(0, current - quantity)
            stock_cell = f"{chr(65 + stock_col_idx)}{row_num}"
            ws.update(stock_cell, [[str(new_stock)]])
            invalidate_cache()
            logger.info(f"토너 재고 차감: '{item_name}' {current} → {new_stock} (-{quantity})")
            return True

        logger.warning(f"토너 재고 시트에서 품목 미발견: '{item_name}'")
        return False
    except Exception as e:
        logger.error(f"토너 재고 차감 오류: {e}")
        return False


def _is_in_toner_sheet(item_name: str) -> bool:
    """캐시된 토너 재고 데이터를 이용해 해당 품목이 토너 시트에 있는지 빠르게 확인"""
    try:
        inv = _get_cached("toner_inventory", _get_toner_inventory_impl)
        names = {it.get("item_name", "").strip() for it in inv.get("items", [])}
        return item_name.strip() in names
    except Exception:
        # 캐시 실패 시 이름 기반 휴리스틱 판단
        n = item_name.lower()
        return any(kw in n for kw in ['tonner', 'toner', '토너'])


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

        # 3. '재고리스트' 시트에 덮어쓰기 (없으면 건너뜀)
        ws = _get_worksheet_safe(ss_master, "재고리스트")
        if not ws:
            logger.warning("'재고리스트' 시트가 없어 동기화를 건너뜁니다.")
            return False
        ws.clear()
        ws.update("A1", rows)
        return True
    except Exception as e:
        logger.error(f"재고리스트 동기화 오류: {e}")
        return False
