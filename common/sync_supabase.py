import pandas as pd
import numpy as np
import streamlit as st
from supabase import create_client, Client
from common.database import get_supabase_client

# Explicitly import normalize_email if needed, or define it here if not available cleanly
# Since utils imports sync_supabase (planned), we avoid circular import by passing DF or small helpers
# But utils imports config. Let's rely on passed dataframes mostly.

def clean_dataframe(df, target_columns):
    """
    Cleans dataframe for Supabase upsert:
    1. Selects only target columns
    2. Replaces NaN with None (for JSON null)
    """
    # Filter columns that exist in df and are in target
    existing_cols = [c for c in target_columns if c in df.columns]
    
    # Check if critical columns missing? For now just take intersection
    df_clean = df[existing_cols].copy()
    
    # Replace NaN with None
    df_clean = df_clean.replace({np.nan: None})
    return df_clean

def normalize_email_local(df):
    """Local helper if not imported"""
    if "email" in df.columns:
        df["email"] = df["email"].astype(str).str.strip().str.lower()
        df["email"] = df["email"].replace(
            ["nan", "none", "null"], "", regex=True
        )
    return df

def sync_all_from_dataframe(dfs):
    """
    Takes a dict of DataFrames (keys matching SHEET_MAPPING keys) 
    and upserts them to Supabase tables.
    """
    supabase = get_supabase_client()
    if not supabase:
        st.error("Supabase client not initialized.")
        return

    st.toast("☁️ Syncing data to Supabase...", icon="🔄")
    
    # 1. Users (All_User)
    if "All_User" in dfs and not dfs["All_User"].empty:
        try:
            df = dfs["All_User"].copy()
            df = normalize_email_local(df)
            df = df.rename(columns={"이름": "KorName"})
            
            target_cols = ["email", "NO", "NAME", "KorName", "ROLE", "BU", "SKL분류"]
            df = clean_dataframe(df, target_cols)
            # Remove rows without email if PK is email? 
            # Schema says email PK.
            df = df[df["email"] != ""]
            
            records = df.to_dict(orient="records")
            if records:
                supabase.table("users").upsert(records).execute()
                # st.toast(f"✅ Users synced: {len(records)}")
        except Exception as e:
            st.error(f"Failed to sync Users: {e}")

    # 2. Assets (Lease)
    if "Lease" in dfs and not dfs["Lease"].empty:
        try:
            df = dfs["Lease"].copy()
            df = normalize_email_local(df)
            # Rename if needed
            if "lease Date" in df.columns:
                df = df.rename(columns={"lease Date": "Lease Date"})
                
            target_cols = [
                "Model", "종류", "SNOW Tag", "S/N", "Lease Date", 
                "BU", "User", "email", "Additional Information"
            ]
            df = clean_dataframe(df, target_cols)
            df = df[df["S/N"].notna() & (df["S/N"] != "")]
            
            records = df.to_dict(orient="records")
            if records:
                supabase.table("assets_lease").upsert(records).execute()
        except Exception as e:
            st.error(f"Failed to sync Lease: {e}")
            
    # 3. Assets (iPad)
    if "iPad" in dfs and not dfs["iPad"].empty:
        try:
            df = dfs["iPad"].copy()
            df = normalize_email_local(df)
            target_cols = ["S/N", "email", "Model", "할당일"]
            df = clean_dataframe(df, target_cols)
            df = df[df["S/N"].notna() & (df["S/N"] != "")]
            
            records = df.to_dict(orient="records")
            if records:
                supabase.table("assets_ipad").upsert(records).execute()
        except Exception as e:
            st.error(f"Failed to sync iPad: {e}")

    # 4. Assets (Teams)
    if "Teams" in dfs and not dfs["Teams"].empty:
        try:
            df = dfs["Teams"].copy()
            df = normalize_email_local(df)
            
            # Handle aliases
            cols = df.columns
            actual_number_col = next((c for c in ["Number formated for Country", "Number", "전화번호", "LineURI"] if c in cols), None)
            
            if actual_number_col:
                df = df.rename(columns={actual_number_col: "Number"})
                target_cols = ["Number", "email", "할당일"]
                df = clean_dataframe(df, target_cols)
                df = df[df["Number"].notna() & (df["Number"] != "")]
                
                records = df.to_dict(orient="records")
                if records:
                    supabase.table("assets_teams").upsert(records).execute()
        except Exception as e:
            st.error(f"Failed to sync Teams: {e}")

    # 5. Assets (Monitor)
    if "Monitor" in dfs and not dfs["Monitor"].empty:
        try:
            df = dfs["Monitor"].copy()
            df = normalize_email_local(df)
            target_cols = ["email", "Model", "할당일"]
            df = clean_dataframe(df, target_cols)
            
            # For SERIAL PK, we insert? upsert might duplicate if NO PK provided in record.
            # Monitor table has id SERIAL PK.
            # Ideally we should truncate and re-insert if we want "Sync".
            # Or match by some other unique key.
            # For now, let's keep logic simple: maybe just insert?
            # But duplicate inserts will happen if we don't have ID.
            # Warning: This is tricky without unique constraints on other cols.
            # Currently migration script just does insert. 
            pass 
        except Exception as e:
             st.error(f"Failed to sync Monitor: {e}")

    # 6. Assets (Printer) - Same issue as Monitor
    
    # 7. Resign
    if "Resign" in dfs and not dfs["Resign"].empty:
        try:
            df = dfs["Resign"].copy()
            df = normalize_email_local(df)
            target_cols = [
                "email", "F", "월", "날짜", "NAME", "설명", "BU", 
                "노트북", "아이패드", "모니터", "복합기", "Teams", "추가사항"
            ]
            df = clean_dataframe(df, target_cols)
            df = df[df["email"] != ""] # PK
            
            records = df.to_dict(orient="records")
            if records:
                supabase.table("Resign").upsert(records).execute()
        except Exception as e:
            st.error(f"Failed to sync Resign: {e}")

    st.toast("✅ Cloud DB Sync Completed!", icon="☁️")
