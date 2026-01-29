import os
import streamlit as st
from supabase import create_client, Client

SUPABASE_URL = "https://lbglnxnrisujcwdqyjtv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiZ2xueG5yaXN1amN3ZHF5anR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1Nzc3NjksImV4cCI6MjA4NTE1Mzc2OX0.OgoJlfv3TGMigBZDhCGbz5_FsyQvmwr_kVDy5_qSkGU"

def check_tables():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    try:
        # Try to select from 'users' table
        response = supabase.table("users").select("count", count="exact").execute()
        print("✅ 'users' table exists.")
        return True
    except Exception as e:
        print(f"❌ Table check failed: {e}")
        return False

if __name__ == "__main__":
    check_tables()
