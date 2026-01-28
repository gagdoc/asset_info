import sqlite3
import pandas as pd
import os
import streamlit as st
from supabase import create_client, Client

# ==========================================
# Configuration & Constants
# ==========================================
DB_FILE = "consumables.db"
ASSET_DB_FILE = "asset_database.db"

# Supabase Credentials (Env / Streamlit Secrets)
# For local dev without secrets.toml, you can set env vars or wait for user to provide them.
SUPABASE_URL = os.environ.get("SUPABASE_URL") or st.secrets.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or st.secrets.get("SUPABASE_KEY")

def get_supabase_client():
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Supabase connection error: {e}")
        return None

# ==========================================
# Legacy SQLite Connection (Asset DB)
# ==========================================
# Note: "Consumables" part was using DB_FILE, while Assets were effectively using "asset_database.db" (generated from Excel).
# We are moving both to Supabase.

def get_connection():
    return sqlite3.connect(DB_FILE)

# ==========================================
# Database Initialization (Supabase vs SQLite)
# ==========================================
def init_db():
    supabase = get_supabase_client()
    if supabase:
        # Assuming tables are created via migration script or SQL Editor.
        # We can skip local SQLite init if using Supabase, or keep it as backup?
        # For now, let's just log.
        print("Using Supabase as backend.")
        return
    
    # Fallback to Local SQLite
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
    
    # 마이그레이션 로직 (SQLite)
    c.execute("PRAGMA table_info(items)")
    item_cols = [info[1] for info in c.fetchall()]
    if "current_qty" not in item_cols:
        c.execute("ALTER TABLE items ADD COLUMN current_qty INTEGER DEFAULT 0")
        c.execute("UPDATE items SET current_qty = fixed_qty")

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

# ==========================================
# User Detail Fetching
# ==========================================
def get_users_detailed():
    """
    Returns: DataFrame (cols: EngName, KorName, Email), Status String
    """
    supabase = get_supabase_client()
    if supabase:
        try:
            # Fetch from Supabase 'users' table
            response = supabase.table("users").select("*").execute()
            data = response.data
            if not data:
                return pd.DataFrame(), "NO_DATA"
            
            df = pd.DataFrame(data)
            
            # Column mapping to match expected output format
            # Supabase schema: email, NO, NAME, KorName, ROLE, BU, SKL분류
            # Expected output: EngName, KorName, Email
            
            # Map columns
            df["EngName"] = df.get("NAME", "")
            df["KorName"] = df.get("KorName", "")
            df["Email"] = df.get("email", "")
            
            return df[["EngName", "KorName", "Email"]], "SUCCESS"
        except Exception as e:
            return pd.DataFrame(), f"SUPABASE_ERROR: {str(e)}"

    # Fallback to local
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

        name_col = next((c for c in ["Name", "name", "User", "user"] if c in columns), None)
        kor_col = next((c for c in ["KorName", "korname", "이름"] if c in columns), None)
        email_col = next((c for c in ["Email", "email"] if c in columns), None)

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
