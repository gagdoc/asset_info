import os
import sys
import pandas as pd
import concurrent.futures
import threading

# 프로젝트 루트를 sys.path에 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

try:
    import gspread
    from google.oauth2.service_account import Credentials
    GSPREAD_AVAILABLE = True
except ImportError:
    GSPREAD_AVAILABLE = False
    print("⚠️  gspread 미설치: pip install gspread google-auth")

try:
    from config import SHEET_MAPPING, SPREADSHEET_ID, GOOGLE_CREDENTIALS_FILE, GOOGLE_CREDENTIALS_JSON
except ImportError:
    SHEET_MAPPING = {
        "All_User": "All_User",
        "Lease": "Lease_List",
        "iPad": "Ipad_List",
        "Teams": "TeamsNumber",
        "Printer": "Printer",
        "Monitor": "Monitor",
        "Resign": "퇴사자",
        "NewHire": "신규입사자",
        "Dept_Config": "Dept_Config",
    }
    SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "")
    GOOGLE_CREDENTIALS_FILE = os.environ.get(
        "GOOGLE_CREDENTIALS_FILE",
        "data/st-asset-project-8000c6bb9905.json"
    )
    GOOGLE_CREDENTIALS_JSON = os.environ.get("GOOGLE_CREDENTIALS_JSON")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Google Sheets API 전역 타임아웃 (초)
SHEETS_TIMEOUT = 30

# 스레드 안전 잠금 (동시 다중 요청 방지)
_sheets_lock = threading.Lock()


# ── 타임아웃 래퍼 ─────────────────────────────────────────

def _run_with_timeout(fn, timeout=SHEETS_TIMEOUT):
    """
    블로킹 함수를 별도 스레드에서 실행하며 timeout 초 안에 완료되지 않으면
    None을 반환합니다 (SQLite 폴백 신호).
    """
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(fn)
        try:
            return future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            print(f"⏰ Google Sheets API {timeout}초 타임아웃 — SQLite로 전환합니다")
            return "TIMEOUT"
        except Exception as e:
            print(f"⚠️  Google Sheets API 오류: {e}")
            return "ERROR"


# ── 클라이언트 초기화 ─────────────────────────────────────

def _get_client():
    """gspread 클라이언트 + 스프레드시트 반환 (내부용, 타임아웃 없음)"""
    if not GSPREAD_AVAILABLE:
        return None, None

    if not SPREADSHEET_ID:
        print("⚠️  SPREADSHEET_ID가 설정되지 않았습니다.")
        return None, None

    try:
        creds = None
        # 클라우드 배포 시 환경 변수 사용을 최우선으로 함
        if GOOGLE_CREDENTIALS_JSON:
            import json
            creds_dict = json.loads(GOOGLE_CREDENTIALS_JSON)
            creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
        # 환경 변수가 없으면 로컬 JSON 파일 사용
        elif os.path.exists(GOOGLE_CREDENTIALS_FILE):
            creds = Credentials.from_service_account_file(GOOGLE_CREDENTIALS_FILE, scopes=SCOPES)
        else:
            print(f"⚠️  Google Sheets 인증 정보 없음 (파일 및 환경 변수 모두 누락)")
            return None, None

        client = gspread.authorize(creds)
        spreadsheet = client.open_by_key(SPREADSHEET_ID)
        return client, spreadsheet
    except Exception as e:
        print(f"⚠️  Google Sheets 연결 오류: {e}")
        return None, None


def get_sheets_client():
    """외부용: 클라이언트만 반환 (타임아웃 적용)"""
    result = _run_with_timeout(lambda: _get_client())
    if result in ("TIMEOUT", "ERROR", None):
        return None
    client, _ = result
    return client


def get_spreadsheet():
    """외부용: 스프레드시트 객체 반환 (타임아웃 적용)"""
    result = _run_with_timeout(lambda: _get_client())
    if result in ("TIMEOUT", "ERROR", None):
        return None
    _, spreadsheet = result
    return spreadsheet


# ── DataFrame 변환 헬퍼 ──────────────────────────────────

def _sheet_to_df(worksheet) -> pd.DataFrame:
    try:
        records = worksheet.get_all_records(
            empty2zero=False,
            head=1,
            default_blank="",
            numericise_ignore=["all"],
        )
        return pd.DataFrame(records)
    except Exception as e:
        print(f"⚠️  시트 → DataFrame 변환 오류: {e}")
        return pd.DataFrame()


def _df_to_rows(df: pd.DataFrame) -> list:
    df_clean = df.copy().fillna("").astype(str)
    df_clean = df_clean.replace({"nan": "", "None": "", "NaN": ""})
    return [df_clean.columns.tolist()] + df_clean.values.tolist()


# ── 읽기 (내부 - 타임아웃 래퍼 없음) ────────────────────────

def _load_sheets_internal() -> dict | None:
    """실제 Sheets 읽기 로직 (별도 스레드에서 실행됨)"""
    _, spreadsheet = _get_client()
    if not spreadsheet:
        return None

    data = {}
    for key, sheet_name in SHEET_MAPPING.items():
        try:
            ws = spreadsheet.worksheet(sheet_name)
            df = _sheet_to_df(ws)
            data[key] = df
        except gspread.WorksheetNotFound:
            print(f"⚠️  시트 탭 '{sheet_name}' 없음 → 빈 DataFrame 사용")
            data[key] = pd.DataFrame()
        except Exception as e:
            print(f"⚠️  시트 '{sheet_name}' 로드 오류: {e}")
            data[key] = pd.DataFrame()

    print("✅ Google Sheets 데이터 로드 완료")
    return data


# ── 쓰기 (내부 - 타임아웃 래퍼 없음) ────────────────────────

def _update_sheet_internal(key: str, df: pd.DataFrame) -> bool:
    """실제 Sheets 쓰기 로직 (별도 스레드에서 실행됨)"""
    _, spreadsheet = _get_client()
    if not spreadsheet:
        return False

    sheet_name = SHEET_MAPPING.get(key, key)
    try:
        try:
            ws = spreadsheet.worksheet(sheet_name)
        except gspread.WorksheetNotFound:
            ws = spreadsheet.add_worksheet(
                title=sheet_name,
                rows=max(len(df) + 2, 100),
                cols=max(len(df.columns) + 2, 20),
            )
            print(f"✅ 시트 탭 '{sheet_name}' 자동 생성")

        ws.clear()
        rows = _df_to_rows(df)
        if len(rows) > 1:
            ws.update(rows, value_input_option="USER_ENTERED")

        print(f"✅ '{sheet_name}' 업데이트 완료 ({len(df)}행)")
        return True
    except Exception as e:
        print(f"⚠️  시트 '{sheet_name}' 업데이트 오류: {e}")
        return False


# ── 공개 API (타임아웃 적용) ─────────────────────────────────

def load_from_sheets() -> dict | None:
    """
    30초 타임아웃으로 모든 시트를 읽어 dict[str, DataFrame] 반환.
    타임아웃/오류 시 None 반환 → database.py가 SQLite 폴백 처리.
    """
    result = _run_with_timeout(_load_sheets_internal, timeout=SHEETS_TIMEOUT)
    if result in ("TIMEOUT", "ERROR"):
        return None
    return result


def update_sheet(key: str, df: pd.DataFrame) -> bool:
    """
    30초 타임아웃으로 특정 시트 탭을 덮어씁니다.
    타임아웃/오류 시 False 반환 → SQLite에만 저장.
    """
    result = _run_with_timeout(
        lambda: _update_sheet_internal(key, df),
        timeout=SHEETS_TIMEOUT,
    )
    if result in ("TIMEOUT", "ERROR"):
        return False
    return bool(result)
