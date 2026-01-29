import streamlit as st
import pandas as pd
import sqlite3
import io
import os
from supabase import create_client, Client
from config import (
    DB_FILE,
    SHEET_MAPPING,
    COLUMN_MAPPING,
    RESIGNED_KEYWORD,
    ASSET_TYPES,
    RESIGNED_ROW_STYLE,
)

# Import Supabase client helper from database.py to avoid duplication
# But for now, let's keep it self-contained or import if possible.
# Ideally we should move get_supabase_client to config or a shared place.
# Let's import it from database to avoid circular imports? database imports pandas, sqlite3, os.
# utils imports config. database imports? database doesn't import utils.
from common.database import get_supabase_client

def get_connection():
    return sqlite3.connect(DB_FILE)

def get_bu_role_mapping(dfs):
    """Dept_Config에서 BU와 ROLE의 매핑을 생성합니다."""
    dept_config_df = dfs.get("Dept_Config", pd.DataFrame())

    bu_role_map = {}
    if not dept_config_df.empty:
        if "BU" in dept_config_df.columns and "ROLE" in dept_config_df.columns:
            for _, row in dept_config_df.iterrows():
                bu = str(row["BU"]).strip()
                role = str(row["ROLE"]).strip()
                if bu and bu != "nan":
                    if bu not in bu_role_map:
                        bu_role_map[bu] = []
                    if role and role != "nan" and role not in bu_role_map[bu]:
                        bu_role_map[bu].append(role)

    return bu_role_map


def normalize_email(df):
    if "email" in df.columns:
        df["email"] = df["email"].astype(str).str.strip().str.lower()
        df["email"] = df["email"].replace(
            ["nan", "none", "null", "nan"], "", regex=True
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


def save_excel_to_db(uploaded_file):
    # This function is used for INITIALIZING the DB from Excel.
    # If using Supabase, we might want to run the migration script logic here?
    # Or just warn that they should use the migration script?
    # For now, let's keep it updating the LOCAL SQLite as a fallback/cache?
    # Or simpler: if Supabase is active, upsert to Supabase.
    
    supabase = get_supabase_client()
    if supabase:
        st.info("☁️ Supabase에 데이터 업로드 중...")
        # Reuse migration logic here would be best. 
        # For this turn, I will just keep local DB update to avoid breaking flow 
        # until migration script is fully tested.
        # But eventually this should call a supabase-aware save function.
    
    try:
        conn = get_connection()
        xls = pd.ExcelFile(uploaded_file)
        for key, sheet_name in SHEET_MAPPING.items():
            try:
                if sheet_name in xls.sheet_names:
                    df = pd.read_excel(xls, sheet_name=sheet_name)
                    df.columns = df.columns.str.strip()
                    df = deduplicate_columns(df)
                    df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)
                    df = normalize_email(df)
                    df.to_sql(key, conn, if_exists="replace", index=False)
                else:
                    st.warning(f"⚠️ 엑셀 시트 '{sheet_name}'(키: {key})을 찾을 수 없습니다.")
            except Exception as e:
                st.error(f"❌ {key} 테이블 처리 중 오류: {str(e)}")
        conn.close()
        st.success("✅ 초기 데이터가 DB에 생성되었습니다! (Local)")
        
        if supabase:
            st.warning("⚠️ Supabase가 설정되어 있습니다. 데이터 동기화를 위해 마이그레이션 스크립트를 실행해주세요.")
            
    except Exception as e:
        st.error(f"❌ 파일 로드 중 오류 발생: {str(e)}")


def load_from_db():
    supabase = get_supabase_client()
    data = {}
    
    # 1. Try Supabase
    if supabase:
        try:
            # Map SHEET_KEYS to Supabase Tables
            # "All_User": "users",
            # "Lease": "assets_lease",
            # "iPad": "assets_ipad",
            # "Teams": "assets_teams",
            # "Monitor": "assets_monitor",
            # "Printer": "assets_printer",
            
            # Simple mapping
            supa_map = {
                "All_User": "users",
                "Lease": "assets_lease",
                "iPad": "assets_ipad",
                "Teams": "assets_teams",
                "Monitor": "assets_monitor",
                "Printer": "assets_printer",
                "Resign": "Resign",
                # Dept_Config? We didn't create a table for it yet in migrate script. 
                # If missing, it will be empty.
            }
            
            for key in SHEET_MAPPING.keys():
                table_name = supa_map.get(key)
                if table_name:
                    try:
                        res = supabase.table(table_name).select("*").execute()
                        if res.data:
                            df = pd.DataFrame(res.data)
                        else:
                            df = pd.DataFrame()
                        
                        # Fix column names if they differ?
                        # Our migration script kept them mostly same (quoted).
                        # Expect complications with "이름" -> "KorName" if we renamed it.
                        # For All_User, we renamed 이름 -> KorName in migration.
                        if key == "All_User":
                             df.rename(columns={"KorName": "이름"}, inplace=True)

                        if key != "Dept_Config":
                            df = normalize_email(df)
                        data[key] = df
                    except Exception as e:
                         # Table might not exist or empty
                        data[key] = pd.DataFrame()
                else:
                    data[key] = pd.DataFrame() # Dept_Config etc

            return data
        except Exception as e:
            st.error(f"Supabase load error: {e}")
            # Fallback to local
            pass

    # 2. Fallback to Local SQLite
    try:
        conn = get_connection()
        for key in SHEET_MAPPING.keys():
            try:
                df = pd.read_sql(f"SELECT * FROM {key}", conn)
                if key != "Dept_Config":
                    df = normalize_email(df)
                data[key] = df
            except Exception as e:
                import logging
                logging.debug(f"테이블 '{key}'을(를) 찾을 수 없음 (첫 로드 시 정상): {str(e)}")
                data[key] = pd.DataFrame()
        conn.close()
        return data
    except Exception as e:
        import logging
        logging.error(f"DB 연결 오류: {str(e)}")
        return {key: pd.DataFrame() for key in SHEET_MAPPING.keys()}


def update_db(key, df):
    # This handles SINGLE table updates (e.g. from file uploader)
    supabase = get_supabase_client()
    
    try:
        # Local Update
        conn = get_connection()
        if key != "Dept_Config":
            df = normalize_email(df)
        df = deduplicate_columns(df)
        df.to_sql(key, conn, if_exists="replace", index=False)
        conn.close()
        
        # Supabase Update
        if supabase:
             st.warning("☁️ Supabase 업데이트는 아직 구현되지 않았습니다. (마이그레이션 스크립트 사용 권장)")
             # TODO: Implement upsert logic here for specific tables
        
        if "dfs" in st.session_state:
            st.session_state["dfs"][key] = df
            
    except Exception as e:
        st.error(f"❌ DB 저장 오류 ({key} 테이블): {str(e)}")
        raise


def render_file_uploader(key, df):
    st.download_button(
        "📥 다운로드", df.to_csv(index=False).encode("utf-8-sig"), f"{key}.csv"
    )
    up = st.file_uploader(f"파일 업로드", type=["csv", "xlsx"], key=f"up_{key}")
    if up and st.button("교체하기", key=f"btn_{key}"):
        try:
            new = pd.read_csv(up) if up.name.endswith(".csv") else pd.read_excel(up)
            new = normalize_email(new)
            update_db(key, new)
            st.success(f"✅ {key} 테이블이 업데이트되었습니다.")
            st.rerun()
        except Exception as e:
            st.error(f"❌ 파일 처리 중 오류: {str(e)}")


def style_resigned_rows(row):
    is_resigned = RESIGNED_KEYWORD in str(row.get("퇴사정보", ""))
    styles = [""] * len(row)
    if is_resigned:
        try:
            if "NO" in row.index:
                no_idx = row.index.get_loc("NO")
                if isinstance(no_idx, int):
                    styles[no_idx] = RESIGNED_ROW_STYLE
                else:
                    styles[no_idx.start] = RESIGNED_ROW_STYLE
        except:
            pass
    return styles


def enrich_data_with_assets(target_df):
    # Load from whatever the source is (Cached in session_state usually, or fresh load)
    # The original code called load_from_db() inside here which is expensive if called often.
    # But for now, we follow the pattern.
    dfs = load_from_db() 
    
    target_df = normalize_email(target_df)
    asset_map = {"노트북": {}, "아이패드": {}, "모니터": {}, "Teams": {}, "복합기": {}}

    # ... (Rest of logic is logic-only, no DB calls) ...
    # We copy the existing logic below
    
    if not dfs["Lease"].empty and "email" in dfs["Lease"].columns:
        target_col = "S/N" if "S/N" in dfs["Lease"].columns else dfs["Lease"].columns[3]
        asset_map["노트북"] = (
            dfs["Lease"][["email", target_col]]
            .dropna()
            .set_index("email")[target_col]
            .to_dict()
        )

    if not dfs["iPad"].empty and "email" in dfs["iPad"].columns:
        target_col = "S/N" if "S/N" in dfs["iPad"].columns else "Model"
        asset_map["아이패드"] = (
            dfs["iPad"][["email", target_col]]
            .dropna()
            .set_index("email")[target_col]
            .to_dict()
        )

    if not dfs["Monitor"].empty and "email" in dfs["Monitor"].columns:
        asset_map["모니터"] = (
            dfs["Monitor"][["email", "Model"]]
            .dropna()
            .set_index("email")["Model"]
            .to_dict()
        )

    if not dfs["Teams"].empty and "email" in dfs["Teams"].columns:
        cols = dfs["Teams"].columns
        target_col = next(
            (
                c
                for c in [
                    "Number formated for Country",
                    "Number",
                    "전화번호",
                    "LineURI",
                ]
                if c in cols
            ),
            None,
        )
        if target_col:
            asset_map["Teams"] = (
                dfs["Teams"][["email", target_col]]
                .dropna()
                .set_index("email")[target_col]
                .to_dict()
            )

    if not dfs["Printer"].empty and "email" in dfs["Printer"].columns:
        cols = dfs["Printer"].columns
        target_col = (
            "Model"
            if "Model" in cols
            else (
                "Additional Information 2"
                if "Additional Information 2" in cols
                else ("프린터정보" if "프린터정보" in cols else None)
            )
        )
        if target_col:
            asset_map["복합기"] = (
                dfs["Printer"][["email", target_col]]
                .dropna()
                .set_index("email")[target_col]
                .to_dict()
            )

    for col in ["노트북", "아이패드", "모니터", "Teams", "복합기"]:
        if col not in target_df.columns:
            target_df[col] = None

    for idx, row in target_df.iterrows():
        email = str(row.get("email", "")).strip().lower()
        if not email:
            continue

        def is_empty(val):
            return pd.isna(val) or str(val).strip() == "" or str(val).lower() == "nan"

        if is_empty(target_df.at[idx, "노트북"]):
            target_df.at[idx, "노트북"] = asset_map["노트북"].get(email, "-")
        if is_empty(target_df.at[idx, "아이패드"]):
            target_df.at[idx, "아이패드"] = asset_map["아이패드"].get(email, "-")
        if is_empty(target_df.at[idx, "모니터"]):
            target_df.at[idx, "모니터"] = asset_map["모니터"].get(email, "-")
        if is_empty(target_df.at[idx, "Teams"]):
            target_df.at[idx, "Teams"] = asset_map["Teams"].get(email, "-")
        if is_empty(target_df.at[idx, "복합기"]):
            target_df.at[idx, "복합기"] = asset_map["복합기"].get(email, "-")
    return target_df


def get_unassigned_assets():
    """
    할당되지 않은 자산(이메일이 없는)들의 목록을 반환
    """
    dfs = load_from_db()
    unassigned_assets = {}

    # 노트북 (Lease)
    if not dfs["Lease"].empty and "email" in dfs["Lease"].columns:
        unassigned_lease = dfs["Lease"][
            (dfs["Lease"]["email"].isna()) | (dfs["Lease"]["email"] == "")
        ].copy()
        if not unassigned_lease.empty:
            unassigned_assets["노트북"] = unassigned_lease

    # 아이패드 (iPad)
    if not dfs["iPad"].empty and "email" in dfs["iPad"].columns:
        unassigned_ipad = dfs["iPad"][
            (dfs["iPad"]["email"].isna()) | (dfs["iPad"]["email"] == "")
        ].copy()
        if not unassigned_ipad.empty:
            unassigned_assets["아이패드"] = unassigned_ipad

    # 모니터 (Monitor)
    if not dfs["Monitor"].empty and "email" in dfs["Monitor"].columns:
        unassigned_monitor = dfs["Monitor"][
            (dfs["Monitor"]["email"].isna()) | (dfs["Monitor"]["email"] == "")
        ].copy()
        if not unassigned_monitor.empty:
            unassigned_assets["모니터"] = unassigned_monitor

    # Teams
    if not dfs["Teams"].empty and "email" in dfs["Teams"].columns:
        unassigned_teams = dfs["Teams"][
            (dfs["Teams"]["email"].isna()) | (dfs["Teams"]["email"] == "")
        ].copy()
        if not unassigned_teams.empty:
            unassigned_assets["Teams"] = unassigned_teams

    # 프린터 (Printer)
    if not dfs["Printer"].empty and "email" in dfs["Printer"].columns:
        unassigned_printer = dfs["Printer"][
            (dfs["Printer"]["email"].isna()) | (dfs["Printer"]["email"] == "")
        ].copy()
        if not unassigned_printer.empty:
            unassigned_assets["복합기"] = unassigned_printer

    return unassigned_assets


def sync_new_hire_list_to_all_user_smart(new_hire_df):
    # For sync, implementing Supabase logic is complex because it involves read/update multiple rows.
    # For Phase 1, we might recommend manual DB update or stick to local if this feature is critical.
    # Let's keep local logic for now and add a TODO warning.
    
    import logging
    conn = get_connection()
    try:
        all_user_df = pd.read_sql("SELECT * FROM 'All_User'", conn)
        all_user_df = normalize_email(all_user_df)
    except Exception as e:
        logging.warning(f"All_User 테이블 로드 실패 (초기화): {str(e)}")
        all_user_df = pd.DataFrame(
            columns=["NO", "NAME", "이름", "email", "ROLE", "BU"]
        )

    try:
        resign_df = pd.read_sql("SELECT * FROM 'Resign'", conn)
        resign_df = normalize_email(resign_df)
        resigned_emails = (
            set(resign_df["email"].dropna().unique())
            if "email" in resign_df.columns
            else set()
        )
    except Exception as e:
        logging.debug(f"Resign 테이블 로드 실패 (스킵): {str(e)}")
        resigned_emails = set()

    added_count = 0
    updated_count = 0
    updated_list = []
    res_list = []

    if "email" not in all_user_df.columns:
        all_user_df["email"] = ""

    all_user_df = all_user_df.drop_duplicates(subset=["email"])
    all_user_df.set_index("email", inplace=True, drop=False)

    try:
        max_no = pd.to_numeric(all_user_df["NO"], errors="coerce").max()
        if pd.isna(max_no):
            max_no = 0
    except:
        max_no = 0

    new_hire_df = normalize_email(new_hire_df)
    rows_to_add = []

    for _, row in new_hire_df.iterrows():
        email = str(row.get("email", "")).strip().lower()
        if not email or email == "nan" or email == "none":
            continue

        if email in resigned_emails:
            res_list.append(f"{row.get('이름', '')} ({email})")
            continue

        new_name_en = row.get("NAME", "")
        new_name_ko = row.get("이름", "")
        new_role = row.get("ROLE", "")
        new_bu = row.get("BU", "")

        if email in all_user_df.index:
            all_user_df.at[email, "ROLE"] = new_role
            all_user_df.at[email, "BU"] = new_bu
            # if new_name_en: all_user_df.at[email, 'NAME'] = new_name_en
            # if new_name_ko: all_user_df.at[email, '이름'] = new_name_ko
            updated_count += 1
            updated_list.append(f"{new_name_ko} ({email})")
        else:
            max_no += 1
            final_name = new_name_en if new_name_en else new_name_ko
            new_row_data = {
                "NO": max_no,
                "NAME": final_name,
                "이름": new_name_ko,
                "email": email,
                "ROLE": new_role,
                "BU": new_bu,
            }
            rows_to_add.append(new_row_data)
            added_count += 1

    all_user_df.reset_index(drop=True, inplace=True)
    if rows_to_add:
        add_df = pd.DataFrame(rows_to_add)
        all_user_df = pd.concat([all_user_df, add_df], ignore_index=True)

    all_user_df.to_sql("All_User", conn, if_exists="replace", index=False)
    if "dfs" in st.session_state:
        st.session_state["dfs"]["All_User"] = all_user_df

    conn.close()
    return added_count, updated_list, res_list


def generate_internal_excel(final_df, df_raw, title_text, est_no, total_qty, total_amt):
    """내부용 상세 내역 엑셀 생성 (xlsxwriter 사용)"""
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="xlsxwriter") as writer:
        # 요약 시트
        final_df.to_excel(writer, index=False, sheet_name="상세내역", startrow=3)

        workbook = writer.book
        worksheet = writer.sheets["상세내역"]

        title_fmt = workbook.add_format({"bold": True, "font_size": 14})
        meta_fmt = workbook.add_format({"bold": True, "font_size": 11})

        worksheet.write(0, 0, f"내역서 ({title_text})", title_fmt)
        worksheet.write(1, 0, est_no, meta_fmt)
        worksheet.write(1, 1, f"총 수량: {total_qty:,} EA", meta_fmt)
        worksheet.write(1, 2, f"총액: {total_amt:,} 원", meta_fmt)

        # Raw Data 시트
        df_raw.to_excel(writer, index=False, sheet_name="RawData")

    return buffer.getvalue()
