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
        # A부터 C열까지 (분류, 품목, 가격)
        records = ws.get_values("A2:C")
        items = []
        for r in records:
            if not r or not str(r[0]).strip(): continue
            items.append({
                "category": str(r[0]).strip() if len(r) > 0 else "",
                "item_name": str(r[1]).strip() if len(r) > 1 else "",
                "price": str(r[2]).strip() if len(r) > 2 else ""
            })
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
        for r in records:
            if not r or not str(r[0]).strip() or str(r[0]).strip() == "날짜": continue
            history.append({
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
    _, ss = _get_consumables_client()
    if not ss: return []
    try:
        ws = ss.worksheet(month)
        # F부터 L열 (NO, ITEM, 품목, 총수, 사용자, 단가, 견적비용)
        # 견적비용이 L열이나 K뒤 어딘가에 있다고 가정하고 넉넉히 가져옴
        records = ws.get_values("F2:L")
        estimate = []
        for r in records:
            if not r or not str(r[0]).strip() or not str(r[0]).strip().isdigit(): 
                continue # NO 열이 비어있거나 숫자가 아니면 스킵
            
            # 사용자 데이터가 없는 경우를 대비
            estimate.append({
                "no": str(r[0]).strip() if len(r) > 0 else "",
                "category": str(r[1]).strip() if len(r) > 1 else "",
                "item_name": str(r[2]).strip() if len(r) > 2 else "",
                "total_qty": str(r[3]).strip() if len(r) > 3 else "",
                "users": str(r[4]).strip() if len(r) > 4 else "",
                "unit_price": str(r[5]).strip() if len(r) > 5 else "",
                "total_price": str(r[6]).strip() if len(r) > 6 else ""
            })
        return estimate
    except Exception as e:
        print(f"Error reading estimate: {e}")
        return []

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

def save_item(data: dict) -> bool:
    """품목리스트 시트 A~C열에 새로운 품목을 추가하거나 기존 품목(B열 기준)을 수정합니다."""
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
                
        if row_idx:
            # 존재하면 해당 행 A~C 덮어쓰기
            ws.update(f"A{row_idx}:C{row_idx}", [[
                data.get('category', ''), 
                data.get('item_name', ''), 
                data.get('price', '')
            ]])
        else:
            # 없으면 맨 아래(B열 비어있는 곳 기준) A~C 추가
            next_row = len(col_B) + 1
            ws.update(f"A{next_row}:C{next_row}", [[
                data.get('category', ''), 
                data.get('item_name', ''), 
                data.get('price', '')
            ]])
        return True
    except Exception as e:
        print(f"Error saving item: {e}")
        return False
