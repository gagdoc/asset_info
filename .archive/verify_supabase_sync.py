import os
import pandas as pd
import sqlite3
from supabase import create_client, Client

# Configuration (from migrate_to_supabase.py)
SUPABASE_URL = "https://lbglnxnrisujcwdqyjtv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiZ2xueG5yaXN1amN3ZHF5anR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1Nzc3NjksImV4cCI6MjA4NTE1Mzc2OX0.OgoJlfv3TGMigBZDhCGbz5_FsyQvmwr_kVDy5_qSkGU"

DB_FILE = "asset_database.db"
CONSUMABLES_DB = "consumables.db"

def get_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def get_local_connection(db_path):
    if not os.path.exists(db_path):
        return None
    return sqlite3.connect(db_path)

def verify_sync():
    supabase = get_supabase_client()
    
    print("\n🔎 Verifying Data Synchronization...\n")
    
    # 1. Assets Verification
    verify_assets(supabase)
    
    # 2. Consumables Verification
    verify_consumables(supabase)

def verify_assets(supabase):
    print("--- 1. Assets Check ---")
    conn = get_local_connection(DB_FILE)
    if not conn:
        print(f"❌ Local DB '{DB_FILE}' not found.")
        return

    # Mappings locally to Supabase
    mappings = {
        "All_User": "users",
        "Lease": "assets_lease",
        "iPad": "assets_ipad",
        "Teams": "assets_teams",
        "Monitor": "assets_monitor",
        "Printer": "assets_printer"
    }

    for local_table, remote_table in mappings.items():
        try:
            # Local Count
            local_df = pd.read_sql(f"SELECT * FROM '{local_table}'", conn)
            local_count = len(local_df)
            
            # Remote Count
            res = supabase.table(remote_table).select("count", count="exact").execute()
            remote_count = res.count
            
            # Comparison
            status = "✅ MATCH" if local_count == remote_count else "⚠️ DIFF"
            diff = remote_count - local_count
            diff_str = f"({diff:+})" if diff != 0 else ""
            
            print(f"{status:8} | {local_table:15} -> {remote_table:15} | Local: {local_count:4} | Remote: {remote_count:4} {diff_str}")
            
            if diff != 0:
                print(f"   👉 Tip: Run 'migrate_to_supabase.py' to sync.")
                
        except Exception as e:
            print(f"❌ ERROR  | {local_table:15} -> {remote_table:15} | {str(e)}")

    conn.close()

def verify_consumables(supabase):
    print("\n--- 2. Consumables Check ---")
    conn = get_local_connection(CONSUMABLES_DB)
    if not conn:
        print(f"❌ Local DB '{CONSUMABLES_DB}' not found.")
        return

    mappings = {
        "items": "items",
        "outbound": "outbound"
    }

    for local_table, remote_table in mappings.items():
        try:
            # Local Count
            local_df = pd.read_sql(f"SELECT * FROM {local_table}", conn)
            local_count = len(local_df)
            
            # Remote Count
            res = supabase.table(remote_table).select("count", count="exact").execute()
            remote_count = res.count
            
            # Comparison
            status = "✅ MATCH" if local_count == remote_count else "⚠️ DIFF"
            diff = remote_count - local_count
            diff_str = f"({diff:+})" if diff != 0 else ""
            
            print(f"{status:8} | {local_table:15} -> {remote_table:15} | Local: {local_count:4} | Remote: {remote_count:4} {diff_str}")
            
        except Exception as e:
            print(f"❌ ERROR  | {local_table:15} -> {remote_table:15} | {str(e)}")
            
    conn.close()

if __name__ == "__main__":
    verify_sync()
