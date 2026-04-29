import os
import sys
import json
import logging
import pandas as pd
import concurrent.futures
import threading

logger = logging.getLogger(__name__)

# 프로젝트 루트를 sys.path에 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

try:
    import gspread
    from google.oauth2.service_account import Credentials
    GSPREAD_AVAILABLE = True
except ImportError:
    GSPREAD_AVAILABLE = False
    logger.warning("gspread 미설치: pip install gspread google-auth")

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
            logger.warning(f"Google Sheets API {timeout}초 타임아웃 — SQLite로 전환합니다")
            return "TIMEOUT"
        except Exception as e:
            logger.error("Google Sheets API 오류 발생 (상세 내용 로그 생략)")
            return "ERROR"


# ── 클라이언트 초기화 ─────────────────────────────────────

def _get_client():
    """
    gspread 클라이언트 + 스프레드시트 반환 (내부용, 타임아웃 없음)
    - 개발 환경: data/local/{SPREADSHEET_ID}.json 로컬 파일 사용
    - 운영 환경: 실제 Google Sheets API 사용
    """
    # ── 개발 모드: 로컬 JSON 파일 사용 ─────────────────────
    try:
        from config import IS_PRODUCTION as _IS_PROD
    except ImportError:
        _IS_PROD = os.environ.get("APP_ENV", "development") == "production"

    if not _IS_PROD and SPREADSHEET_ID:
        try:
            from backend.services.local_sheets import get_local_client
            client = get_local_client()
            return client, client.open_by_key(SPREADSHEET_ID)
        except Exception as e:
            logger.warning(f"로컬 클라이언트 초기화 실패, Google Sheets로 전환: {e}")

    # ── 운영 모드: 실제 Google Sheets ───────────────────────
    if not GSPREAD_AVAILABLE:
        return None, None

    if not SPREADSHEET_ID:
        logger.warning("SPREADSHEET_ID가 설정되지 않았습니다.")
        return None, None

    try:
        creds = None
        # 클라우드 배포 시 환경 변수 사용을 최우선으로 함
        if GOOGLE_CREDENTIALS_JSON:
            try:
                creds_dict = json.loads(GOOGLE_CREDENTIALS_JSON)
                creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
            except json.JSONDecodeError:
                logger.error("GOOGLE_CREDENTIALS_JSON 파싱 실패 (JSON 형식 오류) — 인증정보 내용은 로그에 기록하지 않음")
                return None, None
            except Exception:
                logger.error("서비스 계정 인증 초기화 실패 — 인증정보 내용은 로그에 기록하지 않음")
                return None, None
        # 환경 변수가 없으면 로컬 JSON 파일 사용
        elif os.path.exists(GOOGLE_CREDENTIALS_FILE):
            try:
                creds = Credentials.from_service_account_file(GOOGLE_CREDENTIALS_FILE, scopes=SCOPES)
            except Exception:
                logger.error(f"서비스 계정 파일 로드 실패: {GOOGLE_CREDENTIALS_FILE}")
                return None, None
        else:
            logger.warning("Google Sheets 인증 정보 없음 (파일 및 환경 변수 모두 누락)")
            return None, None

        client = gspread.authorize(creds)
        spreadsheet = client.open_by_key(SPREADSHEET_ID)
        return client, spreadsheet
    except Exception:
        # 예외 메시지에 인증정보가 포함될 수 있으므로 상세 내용 미기록
        logger.error("Google Sheets 연결 오류 — 환경변수/파일 설정 확인 필요")
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
        logger.warning(f"시트 → DataFrame 변환 오류: {e}")
        return pd.DataFrame()


def _df_to_rows(df: pd.DataFrame) -> list:
    df_clean = df.copy().fillna("").astype(str)
    df_clean = df_clean.replace({"nan": "", "None": "", "NaN": ""})
    return [df_clean.columns.tolist()] + df_clean.values.tolist()


# ── 읽기 (내부 - 타임아웃 래퍼 없음) ────────────────────────

def _load_sheets_internal() -> dict | None:
    """실제 Sheets 읽기 로직 (초고속 Batch Get 적용으로 1건의 API만 호출)"""
    _, spreadsheet = _get_client()
    if not spreadsheet:
        return None

    data = {}
    keys = list(SHEET_MAPPING.keys())
    ranges = [f"{sheet_name}!A:Z" for sheet_name in SHEET_MAPPING.values()]

    try:
        # 단일 번들 요청(Batch Get)으로 9개 시트를 1~2초 내에 한꺼번에 가져옴
        batch_results = spreadsheet.values_batch_get(ranges)
        valueRanges = batch_results.get('valueRanges', [])

        for idx, res in enumerate(valueRanges):
            key = keys[idx]
            values = res.get('values', [])
            if values:
                # 첫 번째 행을 컬럼명으로 취급 (공백 제거)
                header = [str(x).strip() for x in values[0]]
                # 중복 컬럼명 방지 (예: '', '', '')
                seen = set()
                new_header = []
                for c in header:
                    if c in seen or not c:
                        new_col = f"Unnamed_{len(new_header)}"
                        while new_col in seen:
                            new_col += "_"
                        new_header.append(new_col)
                        seen.add(new_col)
                    else:
                        new_header.append(c)
                        seen.add(c)
                        
                max_cols = len(new_header)
                padded_values = []
                for idx_row in range(1, len(values)):
                    row = values[idx_row]
                    padded_row = row + [''] * (max_cols - len(row))
                    padded_values.append(padded_row[:max_cols])

                df = pd.DataFrame(padded_values, columns=new_header)
                data[key] = df
            else:
                data[key] = pd.DataFrame()

        logger.info("Google Sheets 데이터 로드 완료 (Batch Get 최적화)")
        return data
    except Exception as e:
        logger.error(f"시트 Batch Get 로드 오류: {e}")
        return None


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
            logger.info(f"시트 탭 '{sheet_name}' 자동 생성")

        ws.clear()
        rows = _df_to_rows(df)
        if len(rows) > 1:
            ws.update(rows, value_input_option="USER_ENTERED")

        logger.info(f"'{sheet_name}' 업데이트 완료 ({len(df)}행)")
        return True
    except Exception as e:
        logger.error(f"시트 '{sheet_name}' 업데이트 오류: {e}")
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
