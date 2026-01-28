import sqlite3
import pandas as pd
import os

DB_FILE = "consumables.db"
ASSET_DB_FILE = "asset_database.db"


def get_connection():
    return sqlite3.connect(DB_FILE)


def init_db():
    conn = get_connection()
    c = conn.cursor()

    # 1. 품목 리스트 테이블
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER,
            month INTEGER,
            category TEXT,
            item_name TEXT,
            unit_price INTEGER,
            current_qty INTEGER DEFAULT 0,  -- [신규] 재고 수량 (초기/입고)
            fixed_qty INTEGER DEFAULT 0,    -- [변경] 고정 수량 (알림 기준)
            is_essential BOOLEAN DEFAULT 0,
            UNIQUE(year, month, item_name)
        )
    """
    )

    # 2. 출고 내역 테이블
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS outbound (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            year INTEGER,
            month INTEGER,
            item_name TEXT,
            quantity INTEGER,
            unit_price INTEGER,
            total_price INTEGER,
            user_name TEXT,
            department TEXT,
            estimate_year INTEGER,
            estimate_month INTEGER
        )
    """
    )

    # 3. DB 마이그레이션 (컬럼 추가)
    c.execute("PRAGMA table_info(items)")
    item_cols = [info[1] for info in c.fetchall()]

    # current_qty 없으면 추가 (기존 fixed_qty 값을 복사하여 초기화)
    if "current_qty" not in item_cols:
        c.execute("ALTER TABLE items ADD COLUMN current_qty INTEGER DEFAULT 0")
        c.execute("UPDATE items SET current_qty = fixed_qty")

    # outbound 테이블 마이그레이션
    c.execute("PRAGMA table_info(outbound)")
    out_cols = [info[1] for info in c.fetchall()]

    if "estimate_year" not in out_cols:
        c.execute("ALTER TABLE outbound ADD COLUMN estimate_year INTEGER")
        c.execute("UPDATE outbound SET estimate_year = year")

    if "estimate_month" not in out_cols:
        c.execute("ALTER TABLE outbound ADD COLUMN estimate_month INTEGER")
        c.execute("UPDATE outbound SET estimate_month = month")

    conn.commit()
    conn.close()


def get_users_detailed():
    if not os.path.exists(ASSET_DB_FILE):
        return pd.DataFrame(), "FILE_NOT_FOUND"
    try:
        conn = sqlite3.connect(ASSET_DB_FILE)
        tables = pd.read_sql("SELECT name FROM sqlite_master WHERE type='table'", conn)
        target_table = "All_User"
        real_table_name = next(
            (t for t in tables["name"].tolist() if t.lower() == target_table.lower()),
            None,
        )

        if not real_table_name:
            conn.close()
            return pd.DataFrame(), "TABLE_NOT_FOUND"

        df_cols = pd.read_sql(f"PRAGMA table_info({real_table_name})", conn)
        columns = df_cols["name"].tolist()

        name_col = next(
            (
                c
                for c in ["Name", "name", "User", "user", "EngName", "EmpName"]
                if c in columns
            ),
            None,
        )
        kor_col = next(
            (
                c
                for c in ["KorName", "korname", "이름", "한글이름", "KoreanName"]
                if c in columns
            ),
            None,
        )
        email_col = next(
            (c for c in ["Email", "email", "E-mail", "mail"] if c in columns), None
        )

        if not name_col and not kor_col:
            conn.close()
            return pd.DataFrame(), "NAME_COLUMN_NOT_FOUND"

        primary_name_col = name_col if name_col else kor_col
        select_clause = f"{primary_name_col} as EngName"
        select_clause += f", {kor_col} as KorName" if kor_col else ", '' as KorName"
        select_clause += f", {email_col} as Email" if email_col else ", '' as Email"

        df = pd.read_sql(
            f"SELECT DISTINCT {select_clause} FROM {real_table_name}", conn
        )
        conn.close()
        return df, "SUCCESS"
    except Exception as e:
        return pd.DataFrame(), f"ERROR: {str(e)}"
