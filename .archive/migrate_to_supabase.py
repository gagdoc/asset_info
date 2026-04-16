import os
import pandas as pd
from supabase import create_client, Client
from common.utils import load_from_db, normalize_email, get_connection
import sqlite3

# ==========================================
# Configuration
# ==========================================
SUPABASE_URL = "https://lbglnxnrisujcwdqyjtv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiZ2xueG5yaXN1amN3ZHF5anR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1Nzc3NjksImV4cCI6MjA4NTE1Mzc2OX0.OgoJlfv3TGMigBZDhCGbz5_FsyQvmwr_kVDy5_qSkGU"

def get_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def create_tables(supabase: Client):
    """
    Note: Ideally, tables should be created via Supabase SQL Editor to handle types correctly.
    This function assumes tables might already be created or we rely on some auto-creation if possible (Supabase requires explicit schema usually).
    
    We will print the SQL commands to run in Supabase SQL Editor.
    """
    print("\n[IMPORTANT] Please run the following SQL in your Supabase SQL Editor to create tables:\n")
    
    sql_commands = """
    -- 1. Users Table
    CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        "NO" TEXT,
        "NAME" TEXT,
        "KorName" TEXT,
        "ROLE" TEXT,
        "BU" TEXT,
        "SKL분류" TEXT,
        "Lease_List" TEXT,
        "Ipad_List" TEXT,
        "TeamsNum" TEXT,
        "Printer" TEXT,
        "Monitor" TEXT
    );

    -- 2. Asset Tables
    -- 2. Asset Tables
    -- [UPDATED] Lease Table with all columns
    DROP TABLE IF EXISTS assets_lease;
    CREATE TABLE IF NOT EXISTS assets_lease (
        "S/N" TEXT PRIMARY KEY,
        "Model" TEXT,
        "종류" TEXT,
        "SNOW Tag" TEXT,
        "Lease Date" TEXT,
        "BU" TEXT,
        "User" TEXT,
        "email" TEXT,
        "Additional Information" TEXT,
        "참고" TEXT
    );

    CREATE TABLE IF NOT EXISTS assets_ipad (
        "S/N" TEXT PRIMARY KEY,
        "Model" TEXT,
        "Date" TEXT,
        "전화 번호" TEXT,
        "애플펜슬 2세대" TEXT,
        "BU" TEXT,
        "Role" TEXT,
        "User" TEXT,
        "email" TEXT,
        "Additional Information" TEXT,
        "해지유무" TEXT,
        "참고" TEXT
    );
    
    CREATE TABLE IF NOT EXISTS assets_teams (
        "Number" TEXT PRIMARY KEY,
        "email" TEXT,
        "Extension" TEXT,
        "LineURI" TEXT,
        "Business Title" TEXT,
        "ID" TEXT
    );
    
    CREATE TABLE IF NOT EXISTS assets_monitor (
        id SERIAL PRIMARY KEY,
        "Model" TEXT,
        "Date" TEXT,
        "User" TEXT,
        "email" TEXT,
        "Additional Information" TEXT
    );
    
    CREATE TABLE IF NOT EXISTS assets_printer (
        id SERIAL PRIMARY KEY,
        "Model" TEXT,
        "date" TEXT,
        "User" TEXT,
        "BU" TEXT,
        "ROLE" TEXT,
        "email" TEXT,
        "Additional Information 2" TEXT,
        "카트리지 사용 내역" TEXT
    );

    -- [NEW] Resign Table
    DROP TABLE IF EXISTS "Resign";
    CREATE TABLE IF NOT EXISTS "Resign" (
        "email" TEXT PRIMARY KEY,
        "F" INTEGER,
        "월" INTEGER,
        "날짜" INTEGER,
        "NAME" TEXT,
        "설명" TEXT,
        "BU" TEXT,
        "노트북" TEXT,
        "아이패드" TEXT,
        "모니터" TEXT,
        "복합기" TEXT,
        "Teams" TEXT,
        "추가사항" TEXT
    );
    
    -- 3. Consumables Items
    CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        year INTEGER,
        month INTEGER,
        category TEXT,
        item_name TEXT,
        unit_price INTEGER,
        current_qty INTEGER DEFAULT 0,
        fixed_qty INTEGER DEFAULT 0,
        is_essential BOOLEAN DEFAULT FALSE,
        UNIQUE(year, month, item_name)
    );

    -- 4. Inbound/Outbound (Consumables)
    CREATE TABLE IF NOT EXISTS outbound (
        id SERIAL PRIMARY KEY,
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
    );
    """
    print(sql_commands)
    print("\n------------------------------------------------\n")

import numpy as np

def clean_dataframe(df, target_columns):
    # 1. Filter columns
    df = df[df.columns.intersection(target_columns)].copy()
    
    # 2. Replace NaN with None (which becomes NULL in JSON/SQL)
    df = df.replace({np.nan: None})
    return df

def load_from_local_db():
    data = {}
    conn = get_connection()
    # Import SHEET_MAPPING from config or define it here if not available
    # It checks config.SHEET_MAPPING
    from config import SHEET_MAPPING
    
    for key in SHEET_MAPPING.keys():
        try:
            df = pd.read_sql(f"SELECT * FROM {key}", conn)
            if key != "Dept_Config":
                df = normalize_email(df)
            data[key] = df
        except Exception as e:
            print(f"Local load error for {key}: {e}")
            data[key] = pd.DataFrame()
    conn.close()
    return data

def migrate_assets(supabase: Client):
    print("Loading data from local DB/Excel...")
    # dfs = load_from_db() # This would try Supabase now, which is empty!
    dfs = load_from_local_db()

    # 1. Users
    if "All_User" in dfs and not dfs["All_User"].empty:
        df = dfs["All_User"].copy()
        df = normalize_email(df)
        df = df.rename(columns={"이름": "KorName"})
        
        target_cols = [
            "email", "NO", "NAME", "KorName", "ROLE", "BU", "SKL분류",
            "Lease_List", "Ipad_List", "TeamsNum", "Printer", "Monitor"
        ]
        df = clean_dataframe(df, target_cols)
        
        records = df.to_dict(orient="records")
        try:
            response = supabase.table("users").upsert(records).execute()
            print(f"✅ Users migrated: {len(records)} rows")
        except Exception as e:
            print(f"❌ Users migration failed: {e}")

    # 2. Assets (Lease)
    if "Lease" in dfs and not dfs["Lease"].empty:
        df = dfs["Lease"].copy()
        df = normalize_email(df)
        
        # Excel Header mapping if needed (e.g. "lease Date" -> "Lease Date")
        # Assuming Excel has "lease Date" based on pandas check
        # We want to store it as "Lease Date" or keep it as "lease Date"
        # Let's standardize to Title Case for SQL if possible, or matches SQL schema
        df = df.rename(columns={"lease Date": "Lease Date"})

        target_cols = [
            "Model", "종류", "SNOW Tag", "S/N", "Lease Date", 
            "BU", "User", "email", "Additional Information"
        ]
        df = clean_dataframe(df, target_cols)
        
        records = df.to_dict(orient="records")
        try:
             # Using upsert
            supabase.table("assets_lease").upsert(records).execute()
            print(f"✅ Lease assets migrated: {len(records)} rows (Columns: {len(target_cols)})")
        except Exception as e:
            print(f"❌ Lease migration failed: {e}")

    # 3. Assets (iPad)
    if "iPad" in dfs and not dfs["iPad"].empty:
        df = dfs["iPad"].copy()
        df = normalize_email(df)
        
        target_cols = ["S/N", "email", "Model", "할당일"]
        df = clean_dataframe(df, target_cols)
        # Filter null PK
        df = df[df["S/N"].notna()]
        
        records = df.to_dict(orient="records")
        try:
            supabase.table("assets_ipad").upsert(records).execute()
            print(f"✅ iPad assets migrated: {len(records)} rows")
        except Exception as e:
            print(f"❌ iPad migration failed: {e}")

    # 4. Assets (Teams)
    if "Teams" in dfs and not dfs["Teams"].empty:
        df = dfs["Teams"].copy()
        df = normalize_email(df)
        
        # Handle Column Aliases for Number
        cols = df.columns
        actual_number_col = next((c for c in ["Number formated for Country", "Number", "전화번호", "LineURI"] if c in cols), None)
        
        if actual_number_col:
            df = df.rename(columns={actual_number_col: "Number"})
            
            target_cols = ["Number", "email", "할당일"]
            df = clean_dataframe(df, target_cols)
            # Filter null PK
            if "Number" in df.columns:
                df = df[df["Number"].notna()]

                records = df.to_dict(orient="records")
                try:
                    supabase.table("assets_teams").upsert(records).execute()
                    print(f"✅ Teams assets migrated: {len(records)} rows")
                except Exception as e:
                    print(f"❌ Teams migration failed: {e}")
            else:
                 print("❌ Teams migration skipped: 'Number' column missing after rename.")
        else:
            print("❌ Teams migration skipped: Could not find Number column.")
            
    # 5. Assets (Monitor)
    if "Monitor" in dfs and not dfs["Monitor"].empty:
        df = dfs["Monitor"].copy()
        df = normalize_email(df)
        
        target_cols = ["email", "Model", "할당일"]
        df = clean_dataframe(df, target_cols)
        
        records = df.to_dict(orient="records")
        try:
            supabase.table("assets_monitor").insert(records).execute()
            print(f"✅ Monitor assets migrated: {len(records)} rows")
        except Exception as e:
            print(f"❌ Monitor migration failed: {e}")

    # 6. Assets (Printer)
    if "Printer" in dfs and not dfs["Printer"].empty:
        df = dfs["Printer"].copy()
        df = normalize_email(df)
        
        target_cols = ["email", "Model", "할당일"]
        df = clean_dataframe(df, target_cols)
        
        records = df.to_dict(orient="records")
        try:
            supabase.table("assets_printer").insert(records).execute()
            print(f"✅ Printer assets migrated: {len(records)} rows")
        except Exception as e:
            print(f"❌ Printer migration failed: {e}")

    # 7. Resign
    if "Resign" in dfs and not dfs["Resign"].empty:
        df = dfs["Resign"].copy()
        df = normalize_email(df)
        
        # Ensure columns match schema
        target_cols = [
            "email", "F", "월", "날짜", "NAME", "설명", "BU", 
            "노트북", "아이패드", "모니터", "복합기", "Teams", "추가사항"
        ]
        df = clean_dataframe(df, target_cols)
        
        records = df.to_dict(orient="records")
        try:
            supabase.table("Resign").upsert(records).execute()
            print(f"✅ Resign data migrated: {len(records)} rows")
        except Exception as e:
            print(f"❌ Resign migration failed: {e}")


def migrate_consumables(supabase: Client):
    print("Loading data from Consumables DB...")
    db_path = "consumables.db"
    if not os.path.exists(db_path):
        print("⚠️ Consumables DB not found, skipping.")
        return

    conn = sqlite3.connect(db_path)
    
    # 1. Items
    try:
        df_items = pd.read_sql("SELECT * FROM items", conn)
        if not df_items.empty:
            target_cols = ["year", "month", "category", "item_name", "unit_price", "current_qty", "fixed_qty", "is_essential"]
            df_items = clean_dataframe(df_items, target_cols)
            
            # Strict Integer Casting
            int_cols = ["year", "month", "unit_price", "current_qty", "fixed_qty"]
            for col in int_cols:
                df_items[col] = pd.to_numeric(df_items[col], errors='coerce').fillna(0).astype(int)
            
            records = df_items.to_dict(orient="records")
            try:
                supabase.table("items").upsert(records).execute()
                print(f"✅ Consumable Items migrated: {len(records)} rows")
            except Exception as e:
                print(f"❌ Consumable Items migration failed: {e}")
    except Exception as e:
        print(f"Error reading items: {e}")

    # 2. Outbound
    try:
        df_out = pd.read_sql("SELECT * FROM outbound", conn)
        if not df_out.empty:
            target_cols = ["date", "year", "month", "item_name", "quantity", "unit_price", "total_price", "user_name", "department", "estimate_year", "estimate_month"]
            df_out = clean_dataframe(df_out, target_cols)
            records = df_out.to_dict(orient="records")
            try:
                supabase.table("outbound").upsert(records).execute()
                print(f"✅ Consumable Outbound migrated: {len(records)} rows")
            except Exception as e:
                print(f"❌ Consumable Outbound migration failed: {e}")
    except Exception as e:
        print(f"Error reading outbound: {e}")

    conn.close()

if __name__ == "__main__":
    try:
        supabase = get_supabase_client()
        create_tables(supabase)
        
    # Removed interactive check for automation
    # confirm = input("Have you created the tables in Supabase SQL Editor? (y/n): ")
    # if confirm.lower() == 'y':
        print("Starting migration...")
        migrate_assets(supabase)
        migrate_consumables(supabase)
        print("Migration completed.")
            
    except Exception as e:
        print(f"Migration script error: {e}")
