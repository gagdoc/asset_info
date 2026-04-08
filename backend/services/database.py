import sqlite3
import pandas as pd
import os
import sys
import io

# Add parent directory to sys.path to allow imports from root
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

try:
    from config import (
        DB_FILE,
        SHEET_MAPPING,
        COLUMN_MAPPING,
        ASSET_TYPES,
        RESIGNED_KEYWORD,
    )
except ImportError:
    DB_FILE = "asset_database.db"
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

# Google Sheets 서비스 임포트
try:
    from backend.services.sheets_service import load_from_sheets, update_sheet
    SHEETS_AVAILABLE = True
except ImportError:
    SHEETS_AVAILABLE = False

# Constants
ASSET_DB_FILE = "asset_database.db"
CONSUMABLES_DB_FILE = "consumables.db"


def get_connection(db_file=ASSET_DB_FILE):
    return sqlite3.connect(db_file)


def normalize_email(df):
    if "email" in df.columns:
        df["email"] = df["email"].astype(str).str.strip()
        # regex=True일 경우 "finance" 와 같은 문자열 내의 "nan"이 삭제되는 버그 발생 ("fice")
        # 특정 문자열과 완벽히 일치할 때만 빈 문자열로 치환하도록 변경
        df["email"] = df["email"].replace(
            ["nan", "none", "null"], "", regex=False
        )
    return df


def deduplicate_columns(df):
    cols = pd.Series(df.columns)
    for dup in cols[cols.duplicated()].unique():
        cols[cols[cols == dup].index.values.tolist()] = [
            dup + "." + str(i) if i != 0 else dup for i in range(sum(cols == dup))
        ]
    df.columns = cols
    return df


def _post_process(data: dict) -> dict:
    """읽어온 데이터에 공통 후처리 적용 (이메일 정규화, 정렬 등)"""
    for key, df in data.items():
        if df.empty:
            continue
        if key == "All_User" and "KorName" in df.columns:
            df.rename(columns={"KorName": "이름"}, inplace=True)
        if key != "Dept_Config":
            df = normalize_email(df)
        if key == "Resign":
            # Google Sheets는 "년", SQLite는 "F"를 연도 컬럼으로 사용
            year_col = "년" if "년" in df.columns else ("F" if "F" in df.columns else None)
            sort_cols = [c for c in [year_col, "월", "날짜", "NAME"] if c and c in df.columns]
            asc = [False] * (len(sort_cols) - 1) + [True] if sort_cols else []
            if sort_cols:
                df = df.sort_values(by=sort_cols, ascending=asc, na_position="last")

        elif key == "All_User" and "NAME" in df.columns:
            df = df.sort_values(by="NAME", na_position="last")
        data[key] = df
    return data


def load_from_db() -> dict:
    """
    데이터 로드 우선순위: Google Sheets → SQLite 폴백
    반환값: dict[str, DataFrame]
    """
    # 1. Google Sheets 시도
    if SHEETS_AVAILABLE:
        try:
            data = load_from_sheets()
            if data is not None:
                return _post_process(data)
        except Exception as e:
            print(f"Google Sheets 로드 오류, SQLite로 전환: {e}")

    # 2. 로컬 SQLite 폴백
    print("📂 로컬 SQLite 사용 중...")
    try:
        conn = get_connection(ASSET_DB_FILE)
        data = {}
        for key in SHEET_MAPPING.keys():
            try:
                df = pd.read_sql(f"SELECT * FROM '{key}'", conn)
                data[key] = df
            except Exception:
                data[key] = pd.DataFrame()
        conn.close()
        return _post_process(data)
    except Exception as e:
        print(f"SQLite 연결 오류: {e}")
        return {key: pd.DataFrame() for key in SHEET_MAPPING.keys()}


def update_db(key: str, df: pd.DataFrame):
    """
    저장 순서: Google Sheets (기본) + SQLite (백업)
    Sheets 실패 시에도 SQLite에는 항상 저장합니다.
    """
    if key != "Dept_Config":
        df = normalize_email(df)
    df = deduplicate_columns(df)

    # 1. Google Sheets 저장
    if SHEETS_AVAILABLE:
        try:
            ok = update_sheet(key, df)
            if ok:
                print(f"✅ Google Sheets '{key}' 저장 완료")
            else:
                print(f"⚠️  Google Sheets 저장 실패, SQLite에만 저장됩니다.")
        except Exception as e:
            print(f"⚠️  Google Sheets 저장 오류: {e}")

    # 2. SQLite 백업 저장 (항상 실행)
    try:
        conn = get_connection(ASSET_DB_FILE)
        df.to_sql(key, conn, if_exists="replace", index=False)
        conn.close()
    except Exception as e:
        print(f"SQLite 저장 오류 ({key}): {e}")
        raise


def save_excel_to_db_service(file_content: bytes):
    """Excel 파일을 파싱해 모든 시트를 Google Sheets + SQLite에 저장"""
    try:
        xls = pd.ExcelFile(io.BytesIO(file_content))
        for key, sheet_name in SHEET_MAPPING.items():
            if sheet_name in xls.sheet_names:
                df = pd.read_excel(xls, sheet_name=sheet_name)
                df.columns = df.columns.str.strip()
                df = deduplicate_columns(df)
                df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)
                df = normalize_email(df)
                update_db(key, df)
        return True
    except Exception as e:
        print(f"Excel 업로드 오류: {e}")
        raise e
