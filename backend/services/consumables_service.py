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
    from config import CONSUMABLES_MASTER_SPREADSHEET_ID, CONSUMABLES_OUTBOUND_SPREADSHEET_ID, GOOGLE_CREDENTIALS_FILE, GOOGLE_CREDENTIALS_JSON, TONER_SPREADSHEET_ID, TONER_SHEET_GID, IS_PRODUCTION
except ImportError:
    CONSUMABLES_MASTER_SPREADSHEET_ID = os.environ.get("CONSUMABLES_MASTER_SPREADSHEET_ID")
    CONSUMABLES_OUTBOUND_SPREADSHEET_ID = os.environ.get("CONSUMABLES_OUTBOUND_SPREADSHEET_ID")
    GOOGLE_CREDENTIALS_FILE = os.environ.get("GOOGLE_CREDENTIALS_FILE", "data/st-asset-project-8000c6bb9905.json")
    GOOGLE_CREDENTIALS_JSON = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    TONER_SPREADSHEET_ID = os.environ.get("TONER_SPREADSHEET_ID", "19AMXwNtrF8BcA_BqXpBcy-vWKX8Wu2IkbFTYNPZORc0")
    TONER_SHEET_GID = int(os.environ.get("TONER_SHEET_GID", "394456635"))
    IS_PRODUCTION = os.environ.get("APP_ENV", "development") == "production"

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
    - 개발 환경: data/local/{id}.json 로컬 파일 사용 (Google API 불필요)
    - 운영 환경: 실제 Google Sheets API 사용
    spreadsheet_id가 전달되지 않으면 마스터 시트를 기본으로 반환합니다.
    """
    if not spreadsheet_id:
        spreadsheet_id = CONSUMABLES_MASTER_SPREADSHEET_ID

    # ── 개발 모드: 로컬 JSON 파일 사용 ─────────────────────
    if not IS_PRODUCTION:
        try:
            from backend.services.local_sheets import get_local_client
            client = get_local_client()
            return client, client.open_by_key(spreadsheet_id)
        except Exception as e:
            logger.warning(f"로컬 클라이언트 초기화 실패, Google Sheets로 전환: {e}")

    # ── 운영 모드: 실제 Google Sheets ───────────────────────
    creds = None
    if GOOGLE_CREDENTIALS_JSON:
        import json as _json
        creds = Credentials.from_service_account_info(_json.loads(GOOGLE_CREDENTIALS_JSON), scopes=SCOPES)
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

def get_items_list(month=None, dispatch_mode="cumulative"):
    """
    품목 리스트를 반환합니다.
    dispatch_mode:
      'cumulative' - 전체 기간 누적 출고량 (기본값)
      'monthly'    - 특정 월(month)의 출고량만 집계
    """
    cache_key = f"items_{dispatch_mode}_{month or 'all'}"
    return _get_cached(cache_key, lambda: _get_items_list_impl(month=month, dispatch_mode=dispatch_mode))

def _get_items_list_impl(month=None, dispatch_mode="cumulative"):
    # 품목 정보는 Master 시트에서 가져옴
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master: return []
    try:
        ws = _get_worksheet_safe(ss_master, "품목리스트")
        if not ws:
            logger.error("'품목리스트' 시트를 찾을 수 없습니다.")
            return []
        # A부터 F열까지 (분류, 품목, 가격, 관리여부, 구매수량, 추가수량)
        records = _retry_sheets_op(lambda: ws.get_values("A2:F"))
        items = []
        tracked_item_names = set()

        for i, r in enumerate(records):
            if not r or not str(r[0]).strip(): continue
            is_tracked = len(r) > 3 and str(r[3]).strip().upper() == "O"

            if is_tracked:
                tracked_item_names.add(str(r[1]).strip())

            # 추적 여부와 무관하게 시트에 저장된 수량 값을 항상 읽음
            try:
                base_qty = int(str(r[4]).strip().replace(',', '')) if len(r) > 4 and str(r[4]).strip() else 0
            except ValueError:
                base_qty = 0

            try:
                order_qty = int(str(r[5]).strip().replace(',', '')) if len(r) > 5 and str(r[5]).strip() else 0
            except ValueError:
                order_qty = 0

            total_stock = base_qty + order_qty  # 총 재고 = 구매 + 추가

            items.append({
                "category": str(r[0]).strip() if len(r) > 0 else "",
                "item_name": str(r[1]).strip() if len(r) > 1 else "",
                "price": str(r[2]).strip() if len(r) > 2 else "",
                "is_tracked": is_tracked,
                "base_qty": base_qty,        # E열: 구매 수량 (업체 구매)
                "order_qty": order_qty,      # F열: 추가 수량 (개별 추가)
                "total_stock": total_stock,  # 총 재고 = 구매 + 추가 (읽기전용 계산값)
                "current_stock": total_stock,  # 비추적: 총재고 그대로, 추적: 아래에서 갱신
                "row_index": i + 2,
                "dispatched_qty": 0 if is_tracked else None,
                "dispatch_mode": dispatch_mode,
                "dispatch_month": month,
            })

        # 2단계: Tracking 대상이 있으면 출고 데이터를 합산
        if tracked_item_names:
            _, ss_outbound = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
            if not ss_outbound: return items

            all_ws = ss_outbound.worksheets()
            all_month_titles = [w.title for w in all_ws if "월" in w.title and w.title != "품목리스트"]

            if dispatch_mode == "monthly" and month:
                # 월별 모드: 지정된 월의 시트만 읽음
                target_months = [m for m in all_month_titles if m == month]
            else:
                # 누적 모드: 전체 월 합산
                target_months = all_month_titles

            if target_months:
                ranges = [f"{m}!A2:E" for m in target_months]
                batch_res = ss_outbound.values_batch_get(ranges)
                dispatched_agg = {name: 0 for name in tracked_item_names}

                for res in batch_res.get('valueRanges', []):
                    values = res.get('values', [])
                    for row in values:
                        if len(row) > 2:
                            i_name = str(row[1]).strip()
                            outbound_type = str(row[4]).strip() if len(row) > 4 else "일반"
                            if outbound_type == "위탁":
                                continue
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
                        item["current_stock"] = item["total_stock"] - d_qty  # 현재고 = 총재고 - 출고

        return items
    except Exception as e:
        print(f"Error reading items list: {e}")
        return []


# ──────────────────────────────────────────────────────────────
# 구매 입고 내역 (Purchase History)
# 시트: CONSUMABLES_MASTER_SPREADSHEET_ID / "구매입고내역"
# 컬럼: 날짜 | 품목명 | 수량 | 구매처 | 담당자 | 비고
# ──────────────────────────────────────────────────────────────
PURCHASE_SHEET = "구매입고내역"
PURCHASE_HEADERS = ["날짜", "품목명", "수량", "구매처", "담당자", "비고"]

def _ensure_purchase_sheet(ss_master):
    """구매입고내역 시트가 없으면 자동 생성 후 반환"""
    ws = _get_worksheet_safe(ss_master, PURCHASE_SHEET)
    if not ws:
        ws = ss_master.add_worksheet(title=PURCHASE_SHEET, rows=2000, cols=6)
        ws.update("A1:F1", [PURCHASE_HEADERS])
        logger.info(f"'{PURCHASE_SHEET}' 시트 자동 생성")
    return ws

def get_purchase_history():
    return _get_cached("purchase_history", _get_purchase_history_impl)

def _get_purchase_history_impl():
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master: return []
    try:
        ws = _ensure_purchase_sheet(ss_master)
        records = _retry_sheets_op(lambda: ws.get_values("A2:F"))
        history = []
        for i, r in enumerate(records):
            if not r or not str(r[0]).strip(): continue
            history.append({
                "row_index": i + 2,
                "date": str(r[0]).strip() if len(r) > 0 else "",
                "item_name": str(r[1]).strip() if len(r) > 1 else "",
                "quantity": str(r[2]).strip() if len(r) > 2 else "",
                "vendor": str(r[3]).strip() if len(r) > 3 else "",
                "staff": str(r[4]).strip() if len(r) > 4 else "",
                "note": str(r[5]).strip() if len(r) > 5 else "",
            })
        # 최신순 정렬
        history.sort(key=lambda x: x["date"], reverse=True)
        return history
    except Exception as e:
        logger.error(f"구매입고내역 조회 오류: {e}")
        return []

def add_purchase_record(data: dict) -> dict:
    """구매 입고 내역 한 건 추가"""
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master:
        return {"success": False, "error": "Google Sheets 연결 실패"}
    try:
        ws = _ensure_purchase_sheet(ss_master)
        row = [
            data.get("date", ""),
            data.get("item_name", ""),
            str(data.get("quantity", 0)),
            data.get("vendor", ""),
            data.get("staff", ""),
            data.get("note", ""),
        ]
        ws.append_row(row, value_input_option="USER_ENTERED")
        invalidate_cache("purchase_history")
        return {"success": True}
    except Exception as e:
        logger.error(f"구매입고내역 추가 오류: {e}")
        return {"success": False, "error": str(e)}

def delete_purchase_record(row_index: int) -> dict:
    """구매 입고 내역 한 건 삭제 (행 번호 기준)"""
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master:
        return {"success": False, "error": "Google Sheets 연결 실패"}
    try:
        ws = _ensure_purchase_sheet(ss_master)
        ws.delete_rows(row_index)
        invalidate_cache("purchase_history")
        return {"success": True}
    except Exception as e:
        logger.error(f"구매입고내역 삭제 오류: {e}")
        return {"success": False, "error": str(e)}

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


def sync_toner_to_items_list() -> dict:
    """
    토너 전용 재고 시트에 있는 품목 중 마스터 '품목리스트' 시트에 없는 항목을
    자동으로 추가합니다. (토너 재고 시트 → 품목리스트 단방향 동기화)

    Returns:
        {"added": [추가된 품목명 목록], "skipped": [이미 존재하는 품목명 목록]}
    """
    # 1. 토너 재고 시트에서 품목명 목록 수집
    toner_inv = _get_toner_inventory_impl()
    toner_items = toner_inv.get("items", [])
    if not toner_items:
        logger.info("토너 재고 시트에 품목이 없어 동기화를 건너뜁니다.")
        return {"added": [], "skipped": []}

    toner_names = [it.get("item_name", "").strip() for it in toner_items if it.get("item_name", "").strip()]

    # 2. 품목리스트 시트에서 현재 등록된 Tonner 품목명 수집
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master:
        logger.error("마스터 스프레드시트 접근 실패")
        return {"added": [], "skipped": toner_names}

    ws = _get_worksheet_safe(ss_master, "품목리스트")
    if not ws:
        logger.error("'품목리스트' 시트를 찾을 수 없습니다.")
        return {"added": [], "skipped": toner_names}

    existing_records = _retry_sheets_op(lambda: ws.get_values("A2:B"))
    existing_names = set()
    for r in existing_records:
        if len(r) > 1 and str(r[1]).strip():
            existing_names.add(str(r[1]).strip())

    # 3. 누락된 토너 품목 추가
    added = []
    skipped = []
    for name in toner_names:
        if name in existing_names:
            skipped.append(name)
            continue
        try:
            # 품목리스트에 새 행 추가: [category, item_name, price, is_tracked, base_qty, order_qty]
            ws.append_row(["Tonner", name, "0", "", "", ""], value_input_option="USER_ENTERED")
            added.append(name)
            existing_names.add(name)  # 중복 방지
            logger.info(f"품목리스트에 토너 추가: '{name}'")
        except Exception as e:
            logger.error(f"토너 품목 추가 실패 ('{name}'): {e}")

    # 4. 캐시 무효화 (품목리스트 변경됨)
    if added:
        invalidate_cache("items_all")

    return {"added": added, "skipped": skipped}


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
        headers = ['분류', '품목명', '단가', '재고추적여부', '총재고(구매+추가)', '구매(업체입고)', '추가(개별추가)', '총출고량', '현재고현황', '상태']
        rows = [headers]

        for it in items:
            is_tracked = "O" if it.get("is_tracked") else "X"
            dispatched = it.get("dispatched_qty", 0) if it.get("is_tracked") else "-"
            current = it.get("current_stock", 0) if it.get("is_tracked") else "-"
            total_stock = it.get("total_stock", 0)

            status = "-"
            if it.get("is_tracked"):
                status = "🚨 부족" if (current or 0) < 5 else "✅ 양호"

            rows.append([
                it.get("category", ""),
                it.get("item_name", ""),
                it.get("price", ""),
                is_tracked,
                total_stock,
                it.get("base_qty", ""),   # 구매 (E열)
                it.get("order_qty", ""),  # 추가 (F열)
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


# ────────────────────────────────────────────────
# 입고 이력 (재고 입출고 추적 시스템)
# ────────────────────────────────────────────────

INBOUND_SHEET_NAME = "입고이력"
INBOUND_HEADERS = ["날짜", "품목명", "수량", "비고"]


def _ensure_inbound_sheet(ss) -> object:
    """'입고이력' 시트가 없으면 생성하고 반환합니다."""
    try:
        existing = [ws.title for ws in ss.worksheets()]
        if INBOUND_SHEET_NAME not in existing:
            ws = ss.add_worksheet(title=INBOUND_SHEET_NAME, rows=2000, cols=10)
            ws.update("A1:D1", [INBOUND_HEADERS])
            logger.info(f"'{INBOUND_SHEET_NAME}' 시트 생성 완료")
        else:
            ws = ss.worksheet(INBOUND_SHEET_NAME)
        return ws
    except Exception as e:
        logger.error(f"'{INBOUND_SHEET_NAME}' 시트 확보 오류: {e}")
        return None


def get_inbound_history(item_name: str = None) -> list:
    """입고 이력 전체 또는 특정 품목 이력 반환."""
    cache_key = f"inbound_{item_name or 'all'}"
    return _get_cached(cache_key, _get_inbound_history_impl, item_name)


def _get_inbound_history_impl(item_name: str = None) -> list:
    _, ss = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss:
        return []
    try:
        ws = _ensure_inbound_sheet(ss)
        if not ws:
            return []
        records = _retry_sheets_op(lambda: ws.get_values("A2:D"))
        result = []
        for i, r in enumerate(records):
            if not r or not str(r[0]).strip():
                continue
            i_name = str(r[1]).strip() if len(r) > 1 else ""
            if item_name and i_name != item_name.strip():
                continue
            result.append({
                "row_index": i + 2,
                "date": str(r[0]).strip() if len(r) > 0 else "",
                "item_name": i_name,
                "quantity": str(r[2]).strip() if len(r) > 2 else "0",
                "memo": str(r[3]).strip() if len(r) > 3 else "",
            })
        return result
    except Exception as e:
        logger.error(f"입고 이력 조회 오류: {e}")
        return []


def add_inbound(date: str, item_name: str, quantity: int, memo: str = "") -> bool:
    """입고 이력 시트에 새 입고 기록을 추가합니다."""
    _, ss = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss:
        return False
    try:
        ws = _ensure_inbound_sheet(ss)
        if not ws:
            return False
        col_a = _retry_sheets_op(lambda: ws.col_values(1))
        next_row = len(col_a) + 1
        ws.update(f"A{next_row}:D{next_row}", [[date, item_name, str(quantity), memo]])
        invalidate_cache("inbound_")
        invalidate_cache("inventory_report")
        logger.info(f"입고 기록 추가: {date} / {item_name} / {quantity}")
        return True
    except Exception as e:
        logger.error(f"입고 기록 추가 오류: {e}")
        return False


def delete_inbound(row_index: int, item_name: str) -> bool:
    """입고 이력 시트에서 특정 행을 삭제합니다 (행 이름 검증 포함)."""
    _, ss = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss:
        return False
    try:
        ws = _ensure_inbound_sheet(ss)
        if not ws:
            return False
        cell_val = ws.cell(row_index, 2).value
        if str(cell_val).strip() != item_name.strip():
            logger.warning(f"입고 삭제 검증 실패: row={row_index}, 기대={item_name}, 실제={cell_val}")
            return False
        ws.delete_rows(row_index)
        invalidate_cache("inbound_")
        invalidate_cache("inventory_report")
        return True
    except Exception as e:
        logger.error(f"입고 이력 삭제 오류: {e}")
        return False


def update_inbound(row_index: int, date: str, item_name: str, quantity: int, memo: str = "", verify_item: str = "") -> bool:
    """입고 이력 시트의 특정 행을 수정합니다."""
    _, ss = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss:
        return False
    try:
        ws = _ensure_inbound_sheet(ss)
        if not ws:
            return False
        # 검증
        if verify_item:
            cell_val = str(ws.cell(row_index, 2).value or "").strip()
            if cell_val != verify_item.strip():
                logger.warning(f"입고 수정 검증 실패: row={row_index}, 기대={verify_item}, 실제={cell_val}")
                return False
        ws.update(f"A{row_index}:D{row_index}", [[date, item_name, str(quantity), memo]])
        invalidate_cache("inbound_")
        invalidate_cache("inventory_report")
        return True
    except Exception as e:
        logger.error(f"입고 이력 수정 오류: {e}")
        return False


def get_inventory_report() -> dict:
    """
    전체 입고 이력 + 전체 출고 이력을 집계하여
    품목별 / 월별 입출고 현황 리포트를 반환합니다.

    반환 형태:
    {
      "by_item": {
        "품목명": {
          "total_in": 100, "total_out": 80, "balance": 20,
          "monthly": {
            "2026-04": {"in": 30, "out": 20},
            ...
          }
        }, ...
      },
      "by_month": {
        "2026-04": {
          "total_in": 100, "total_out": 80,
          "items": { "품목명": {"in": 30, "out": 20}, ... }
        }, ...
      }
    }
    """
    return _get_cached("inventory_report", _get_inventory_report_impl)


def _parse_ym(date_str: str) -> str:
    """날짜 문자열에서 YYYY-MM 추출. 형식: YYYY-MM-DD 또는 YYYY/MM/DD 또는 MM/DD 등."""
    import re
    date_str = str(date_str).strip()
    # YYYY-MM-DD 또는 YYYY/MM/DD
    m = re.match(r"(\d{4})[-/](\d{1,2})", date_str)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}"
    # MM/DD 또는 M월 D일 형식 → 연도 없음 → 현재 연도로 가정
    m2 = re.match(r"(\d{1,2})/(\d{1,2})", date_str)
    if m2:
        from datetime import datetime
        year = datetime.now().year
        return f"{year}-{m2.group(1).zfill(2)}"
    # 한글 날짜: 2026년 4월 등
    m3 = re.match(r"(\d{4})년\s*(\d{1,2})월", date_str)
    if m3:
        return f"{m3.group(1)}-{m3.group(2).zfill(2)}"
    return ""


def _get_inventory_report_impl() -> dict:
    from datetime import datetime
    by_item = {}
    by_month = {}

    def _ensure_item(name):
        if name not in by_item:
            by_item[name] = {"total_in": 0, "total_out": 0, "balance": 0, "monthly": {}}

    def _ensure_month_item(ym, name):
        if ym not in by_month:
            by_month[ym] = {"total_in": 0, "total_out": 0, "items": {}}
        if name not in by_month[ym]["items"]:
            by_month[ym]["items"][name] = {"in": 0, "out": 0}

    # 1. 입고 이력 집계
    inbound = _get_inbound_history_impl()
    for rec in inbound:
        name = rec.get("item_name", "").strip()
        if not name:
            continue
        try:
            qty = int(str(rec.get("quantity", "0")).replace(",", ""))
        except ValueError:
            qty = 0
        ym = _parse_ym(rec.get("date", ""))

        _ensure_item(name)
        by_item[name]["total_in"] += qty

        if ym:
            _ensure_month_item(ym, name)
            by_item[name]["monthly"].setdefault(ym, {"in": 0, "out": 0})
            by_item[name]["monthly"][ym]["in"] += qty
            by_month[ym]["total_in"] += qty
            by_month[ym]["items"][name]["in"] += qty

    # 2. 출고 이력 집계 (전체 월별 시트)
    _, ss_outbound = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    if ss_outbound:
        months_list = [ws.title for ws in ss_outbound.worksheets()
                       if "월" in ws.title and ws.title not in ("품목리스트", "재고리스트")]
        if months_list:
            ranges = [f"{m}!A2:C" for m in months_list]
            try:
                batch_res = ss_outbound.values_batch_get(ranges)
                for sheet_title, res in zip(months_list, batch_res.get("valueRanges", [])):
                    values = res.get("values", [])
                    for row in values:
                        if len(row) < 3:
                            continue
                        i_name = str(row[1]).strip()
                        if not i_name or (i_name.startswith("==") and i_name.endswith("==")):
                            continue
                        try:
                            qty = int(str(row[2]).replace(",", "").strip())
                        except ValueError:
                            continue
                        date_str = str(row[0]).strip()
                        ym = _parse_ym(date_str)

                        _ensure_item(i_name)
                        by_item[i_name]["total_out"] += qty

                        if ym:
                            _ensure_month_item(ym, i_name)
                            by_item[i_name]["monthly"].setdefault(ym, {"in": 0, "out": 0})
                            by_item[i_name]["monthly"][ym]["out"] += qty
                            by_month[ym]["total_out"] += qty
                            by_month[ym]["items"][i_name]["out"] += qty
            except Exception as e:
                logger.error(f"출고 이력 배치 조회 오류: {e}")

    # 3. 잔고 계산
    for name, data in by_item.items():
        data["balance"] = data["total_in"] - data["total_out"]

    # 4. by_month 정렬 (최신순)
    by_month_sorted = dict(sorted(by_month.items(), reverse=True))

    return {"by_item": by_item, "by_month": by_month_sorted}


# ────────────────────────────────────────────────────────────────
# 월별 재고 스냅샷 & 마감 시스템
# ────────────────────────────────────────────────────────────────

SNAPSHOT_SHEET   = "월별스냅샷"   # 마스터 스프레드시트 내 시트명
CLOSE_STATUS_SHEET = "월별마감"   # 마스터 스프레드시트 내 시트명


def _ensure_snapshot_sheets(ss_master) -> tuple:
    """월별스냅샷, 월별마감 시트가 없으면 자동 생성 후 반환.
    스냅샷 컬럼: 월 | 분류(일반/토너) | 품목명 | 시작재고 | 스냅샷일시 | 이월여부
    """
    snap_ws = _get_worksheet_safe(ss_master, SNAPSHOT_SHEET)
    if not snap_ws:
        snap_ws = ss_master.add_worksheet(title=SNAPSHOT_SHEET, rows=2000, cols=6)
        snap_ws.update("A1:F1", [["월", "분류", "품목명", "시작재고", "스냅샷일시", "이월여부"]])
        logger.info(f"'{SNAPSHOT_SHEET}' 시트 자동 생성")

    close_ws = _get_worksheet_safe(ss_master, CLOSE_STATUS_SHEET)
    if not close_ws:
        close_ws = ss_master.add_worksheet(title=CLOSE_STATUS_SHEET, rows=500, cols=4)
        close_ws.update("A1:D1", [["월", "상태", "확정일시", "마감일시"]])
        logger.info(f"'{CLOSE_STATUS_SHEET}' 시트 자동 생성")

    return snap_ws, close_ws


def get_month_close_status(month: str) -> dict:
    """월의 현재 상태 반환: open / confirmed / closed"""
    return _get_cached(f"month_status_{month}", _get_month_close_status_impl, month)


def _get_month_close_status_impl(month: str) -> dict:
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master:
        return {"month": month, "status": "open", "confirmed_at": None, "closed_at": None}
    try:
        _, close_ws = _ensure_snapshot_sheets(ss_master)
        rows = _retry_sheets_op(lambda: close_ws.get_all_values())
        for row in rows[1:]:  # 헤더 제외
            if len(row) > 0 and row[0].strip() == month:
                return {
                    "month": month,
                    "status": row[1].strip() if len(row) > 1 else "open",
                    "confirmed_at": row[2].strip() if len(row) > 2 else None,
                    "closed_at": row[3].strip() if len(row) > 3 else None,
                }
    except Exception as e:
        logger.error(f"월 상태 조회 오류: {e}")
    return {"month": month, "status": "open", "confirmed_at": None, "closed_at": None}


def confirm_month_snapshot(month: str) -> dict:
    """
    '이달 재고 확정': 일반 소모품(is_tracked) + 토너 재고를 해당 월 시작 재고로 저장.
    이전 달이 마감된 경우 → 분류별 잔여재고를 자동 이월.
    스냅샷 컬럼: 월 | 분류(일반/토너) | 품목명 | 시작재고 | 스냅샷일시 | 이월여부
    """
    from datetime import datetime
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master:
        return {"success": False, "error": "마스터 시트 접근 실패"}

    snap_ws, close_ws = _ensure_snapshot_sheets(ss_master)

    # 이미 확정/마감된 월이면 거부
    status = get_month_close_status(month)
    if status["status"] in ("confirmed", "closed"):
        return {"success": False, "error": f"이미 {status['status']} 상태입니다."}

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ── 이전 달 잔여재고 확인 (분류별) ──
    prev_remaining = _get_previous_month_remaining_by_type(month)
    prev_general = prev_remaining.get("일반", {})
    prev_toner   = prev_remaining.get("토너", {})
    has_prev = bool(prev_general or prev_toner)

    # ── 일반 소모품 스냅샷 ──
    if prev_general:
        general_data = prev_general
        general_carryover = True
    else:
        # 품목리스트의 is_tracked 일반 품목에서 현재 재고 읽기
        all_items = _get_items_list_impl()
        general_data = {}
        for it in all_items:
            name = it.get("item_name", "").strip()
            cat  = it.get("category", "").lower()
            if it.get("is_tracked") and name and "tonner" not in cat and "toner" not in cat and "토너" not in cat:
                general_data[name] = it.get("current_stock", 0) or 0
        general_carryover = False

    # ── 토너 스냅샷 ──
    if prev_toner:
        toner_data = prev_toner
        toner_carryover = True
    else:
        toner_inv = _get_toner_inventory_impl()
        toner_data = {}
        for item in toner_inv.get("items", []):
            name  = item.get("item_name", "").strip()
            stock = item.get("current_stock", 0) or 0
            if name:
                toner_data[name] = stock
        toner_carryover = False

    # 기존 스냅샷 행 삭제 (재확정 시 덮어쓰기)
    try:
        all_snap = snap_ws.get_all_values()
        rows_to_delete = [i + 1 for i, r in enumerate(all_snap) if i > 0 and len(r) > 0 and r[0].strip() == month]
        for row_idx in sorted(rows_to_delete, reverse=True):
            snap_ws.delete_rows(row_idx)
    except Exception as e:
        logger.warning(f"기존 스냅샷 삭제 오류 (무시): {e}")

    # 스냅샷 기록 — 분류 컬럼 포함
    new_rows = []
    for name, qty in general_data.items():
        new_rows.append([month, "일반", name, qty, now_str, "이월" if general_carryover else "현재재고"])
    for name, qty in toner_data.items():
        new_rows.append([month, "토너", name, qty, now_str, "이월" if toner_carryover else "현재재고"])

    if new_rows:
        snap_ws.append_rows(new_rows, value_input_option="USER_ENTERED")

    _upsert_close_status(close_ws, month, "confirmed", now_str, "")
    invalidate_cache(f"month_status_{month}")
    invalidate_cache(f"monthly_report_{month}")

    total = len(general_data) + len(toner_data)
    logger.info(f"재고 확정: {month} — 일반 {len(general_data)}개, 토너 {len(toner_data)}개 (이월: {has_prev})")
    return {
        "success": True, "month": month,
        "general_count": len(general_data), "toner_count": len(toner_data),
        "item_count": total, "is_carryover": has_prev,
    }


def close_month(month: str) -> dict:
    """월 마감: 신규 출고 추가 차단. 수정은 허용."""
    from datetime import datetime
    status = get_month_close_status(month)
    if status["status"] == "closed":
        return {"success": False, "error": "이미 마감된 월입니다."}
    if status["status"] == "open":
        return {"success": False, "error": "재고 확정(이달 재고 확정) 후 마감할 수 있습니다."}

    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master:
        return {"success": False, "error": "마스터 시트 접근 실패"}

    _, close_ws = _ensure_snapshot_sheets(ss_master)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _upsert_close_status(close_ws, month, "closed", status.get("confirmed_at", ""), now_str)
    invalidate_cache(f"month_status_{month}")

    return {"success": True, "month": month, "closed_at": now_str}


def reopen_month(month: str) -> dict:
    """마감 해제: closed → confirmed (수정 가능 상태로 복귀)"""
    status = get_month_close_status(month)
    if status["status"] != "closed":
        return {"success": False, "error": "마감된 월만 해제할 수 있습니다."}

    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master:
        return {"success": False, "error": "마스터 시트 접근 실패"}

    _, close_ws = _ensure_snapshot_sheets(ss_master)
    _upsert_close_status(close_ws, month, "confirmed", status.get("confirmed_at", ""), "")
    invalidate_cache(f"month_status_{month}")

    return {"success": True, "month": month}


def get_monthly_toner_report(month: str) -> dict:
    """월별 재고 보고서 (일반 소모품 + 토너 구분): 시작재고 / 출고수량 / 잔여재고"""
    return _get_cached(f"monthly_report_{month}", _get_monthly_toner_report_impl, month)


def _get_monthly_toner_report_impl(month: str) -> dict:
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master:
        return {"month": month, "general_items": [], "toner_items": [], "status": "open", "has_snapshot": False}

    snap_ws, _ = _ensure_snapshot_sheets(ss_master)

    # 1. 스냅샷 로드 — 분류별로 분리
    # 컬럼 형식: 월 | 분류 | 품목명 | 시작재고 | 스냅샷일시 | 이월여부
    # 구형(분류 컬럼 없음): 월 | 품목명 | 시작재고 | ... → 분류="토너"로 간주
    general_start = {}  # {품목명: 시작재고}
    toner_start   = {}
    try:
        all_snap = snap_ws.get_all_values()
        headers = all_snap[0] if all_snap else []
        has_type_col = len(headers) >= 2 and headers[1].strip() in ("분류", "type")

        for row in all_snap[1:]:
            if not row or row[0].strip() != month:
                continue
            if has_type_col:
                # 신형: 월, 분류, 품목명, 시작재고
                if len(row) < 4:
                    continue
                cls  = row[1].strip()
                name = row[2].strip()
                try:
                    qty = int(str(row[3]).replace(",", "").strip() or "0")
                except ValueError:
                    qty = 0
            else:
                # 구형(분류 컬럼 없음) → 토너로 간주
                if len(row) < 3:
                    continue
                cls  = "토너"
                name = row[1].strip()
                try:
                    qty = int(str(row[2]).replace(",", "").strip() or "0")
                except ValueError:
                    qty = 0

            if not name:
                continue
            if cls == "일반":
                general_start[name] = qty
            else:
                toner_start[name] = qty
    except Exception as e:
        logger.error(f"스냅샷 조회 오류: {e}")

    # 2. 해당 월 출고 내역 로드
    _, ss_outbound = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    outbound_qty = {}  # {품목명: 총출고량}
    if ss_outbound:
        try:
            ws_out = _get_worksheet_safe(ss_outbound, month)
            if ws_out:
                rows = ws_out.get_values("A2:E")
                for row in rows:
                    if len(row) > 2:
                        name = str(row[1]).strip()
                        if name and not (name.startswith("==") and name.endswith("==")):
                            try:
                                qty = int(str(row[2]).replace(",", "").strip() or "0")
                                outbound_qty[name] = outbound_qty.get(name, 0) + qty
                            except ValueError:
                                pass
        except Exception as e:
            logger.error(f"출고 내역 조회 오류: {e}")

    def _build_items(start_dict):
        all_names = set(list(start_dict.keys()) + [k for k in outbound_qty if k in start_dict])
        result = []
        for name in sorted(all_names):
            s = start_dict.get(name, 0)
            o = outbound_qty.get(name, 0)
            result.append({"item_name": name, "start_stock": s, "outbound_qty": o, "remaining": s - o})
        return result

    status_info = get_month_close_status(month)
    has_snapshot = bool(general_start or toner_start)
    return {
        "month": month,
        "status": status_info["status"],
        "confirmed_at": status_info.get("confirmed_at"),
        "closed_at": status_info.get("closed_at"),
        "general_items": _build_items(general_start),
        "toner_items":   _build_items(toner_start),
        "has_snapshot": has_snapshot,
        # 하위 호환용 (기존 코드가 items를 쓸 경우)
        "items": _build_items({**general_start, **toner_start}),
    }


def reset_month_snapshot(month: str) -> dict:
    """
    개발/테스트용 초기화: 해당 월 스냅샷 행 삭제 + 마감 상태를 open으로 리셋.
    프로덕션 환경에서는 차단됩니다.
    """
    if IS_PRODUCTION:
        return {"success": False, "error": "프로덕션 환경에서는 초기화를 사용할 수 없습니다."}

    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master:
        return {"success": False, "error": "마스터 시트 접근 실패"}

    snap_ws, close_ws = _ensure_snapshot_sheets(ss_master)
    deleted_rows = 0

    try:
        all_snap = snap_ws.get_all_values()
        rows_to_delete = [i + 1 for i, r in enumerate(all_snap) if i > 0 and len(r) > 0 and r[0].strip() == month]
        for row_idx in sorted(rows_to_delete, reverse=True):
            snap_ws.delete_rows(row_idx)
            deleted_rows += 1
    except Exception as e:
        logger.warning(f"스냅샷 행 삭제 오류: {e}")

    try:
        all_close = close_ws.get_all_values()
        for i, row in enumerate(all_close[1:], start=2):
            if len(row) > 0 and row[0].strip() == month:
                close_ws.delete_rows(i)
                break
    except Exception as e:
        logger.warning(f"마감 상태 행 삭제 오류: {e}")

    invalidate_cache(f"month_status_{month}")
    invalidate_cache(f"monthly_report_{month}")
    logger.info(f"[DEV] 월 초기화 완료: {month} (스냅샷 {deleted_rows}행 삭제, 상태 → open)")
    return {"success": True, "month": month, "deleted_rows": deleted_rows}


def _get_previous_month_remaining_by_type(month: str) -> dict:
    """이전 달이 마감 상태라면 분류별 잔여재고 반환: {"일반": {품목명:qty}, "토너": {품목명:qty}}"""
    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if not ss_master:
        return {"일반": {}, "토너": {}}
    try:
        _, close_ws = _ensure_snapshot_sheets(ss_master)
        all_close = close_ws.get_all_values()
        closed_months = [r[0].strip() for r in all_close[1:] if len(r) > 1 and r[1].strip() == "closed"]
        if not closed_months:
            return {"일반": {}, "토너": {}}

        current_ym = _parse_ym_from_month_title(month)
        prev_closed = []
        for m in closed_months:
            ym = _parse_ym_from_month_title(m)
            if ym and current_ym and ym < current_ym:
                prev_closed.append((ym, m))
        if not prev_closed:
            return {"일반": {}, "토너": {}}

        _, prev_month = max(prev_closed, key=lambda x: x[0])
        prev_report = _get_monthly_toner_report_impl(prev_month)

        return {
            "일반": {it["item_name"]: it["remaining"] for it in prev_report.get("general_items", []) if it["remaining"] > 0},
            "토너": {it["item_name"]: it["remaining"] for it in prev_report.get("toner_items",   []) if it["remaining"] > 0},
        }
    except Exception as e:
        logger.warning(f"이전 달 잔여재고 조회 오류: {e}")
        return {"일반": {}, "토너": {}}


def _parse_ym_from_month_title(title: str):
    """'2026년4월' → (2026, 4) 튜플"""
    import re
    m = re.search(r'(\d{4})년\s*(\d{1,2})월', title)
    if m:
        return (int(m.group(1)), int(m.group(2)))
    m2 = re.search(r'(\d{1,2})월', title)
    if m2:
        return (2026, int(m2.group(1)))
    return None


def _upsert_close_status(close_ws, month: str, status: str, confirmed_at: str, closed_at: str):
    """월별마감 시트에서 해당 월 행을 찾아 업데이트하거나 새 행 추가."""
    try:
        all_rows = close_ws.get_all_values()
        for i, row in enumerate(all_rows[1:], start=2):
            if len(row) > 0 and row[0].strip() == month:
                close_ws.update(f"A{i}:D{i}", [[month, status, confirmed_at, closed_at]])
                return
        # 없으면 추가
        close_ws.append_row([month, status, confirmed_at, closed_at], value_input_option="USER_ENTERED")
    except Exception as e:
        logger.error(f"마감 상태 기록 오류: {e}")
