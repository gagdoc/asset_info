import streamlit as st
import pandas as pd
from common.utils import (
    update_db,
    enrich_data_with_assets,
    process_asset_return,
    delete_user_from_master,
    render_file_uploader,
    normalize_email,
)


def render_resign_page(dfs):
    st.title("👋 퇴사자 관리")

    # --- Display Messages (Persisted) ---
    if "del_msg" in st.session_state and st.session_state["del_msg"]:
        for item in st.session_state["del_msg"]:
            if item["type"] == "success":
                st.success(item["msg"])
            else:
                st.error(item["msg"])
        # Clear messages after display? 
        # Ideally we want them to disappear after the user sees them.
        # But if we clear them now, a subsequent rerun (triggered by another action) will hide them.
        # That's probably desired behavior (toast-like but persistent until action).
        # We can clear them at the end of the script run if we want, but Streamlit logic is tricky.
        # Let's keep them until explicitly cleared by the button action again (which we already added).
    
    st.info(
        "이메일을 입력하고 저장하면 **보유 중인 모든 자산 정보가 자동으로 채워집니다.**\n\n"
        "반납 처리를 하려면 해당 행을 선택하고 **[🔄 선택된 퇴사자 반납 처리]** 버튼을 클릭하세요."
    )
    data_key = "Resign"
    df = dfs[data_key]

    # Reorder columns to match Excel if they exist
    excel_order = ["F", "월", "날짜", "NAME", "email", "설명", "BU", "노트북", "아이패드", "모니터", "복합기", "Teams", "추가사항"]
    cols_to_show = [c for c in excel_order if c in df.columns]
    # Add any other columns that might be in df but not in excel_order (if any)
    other_cols = [c for c in df.columns if c not in excel_order]
    
    # Sort df_view as well to ensure consistent UI
    if all(c in df.columns for c in ["F", "월", "날짜", "NAME"]):
        df = df.sort_values(by=["F", "월", "날짜", "NAME"], ascending=[False, False, False, True], na_position='last')

    visible_cols = cols_to_show + other_cols
    df_view = df[visible_cols]

    # --- NEW: SEPARATE ENTRY FORM ---
    with st.expander("➕ 새 퇴사 예정자 등록", expanded=True):
        with st.form("new_resign_form", clear_on_submit=True):
            col_date, col_email = st.columns([1, 2])
            with col_date:
                r_date = st.date_input("퇴사 예정일")
            with col_email:
                r_email_raw = st.text_input("이메일 주소", placeholder="user@stryker.com")
            
            submitted = st.form_submit_button("🚀 등록 및 자산 자동 채우기", type="primary", use_container_width=True)
            
            if submitted:
                r_email = str(r_email_raw).strip().lower()
                if not r_email:
                    st.error("⚠️ 이메일 주소를 입력해 주세요.")
                else:
                    # Parse date
                    year, month, day = r_date.year, r_date.month, r_date.day
                    
                    # Check for duplicates based on email
                    if r_email in df["email"].values:
                        st.warning(f"💡 {r_email}님은 이미 목록에 존재합니다. 기존 정보를 업데이트합니다.")
                    
                    # Create a mini dataframe for this entry to enrich
                    new_row = {
                        "F": year,
                        "월": month,
                        "날짜": day,
                        "email": r_email,
                        "설명": "퇴사 예정"
                    }
                    # Ensure all columns exist
                    for col in df.columns:
                        if col not in new_row:
                            new_row[col] = "-"
                    
                    new_df = pd.DataFrame([new_row])
                    
                    # Enrich!
                    enriched_new = enrich_data_with_assets(new_df)
                    
                    # Merge with existing data
                    if r_email in df["email"].values:
                        # Update existing row
                        df.loc[df["email"] == r_email, enriched_new.columns] = enriched_new.iloc[0].values
                    else:
                        # Append new row
                        df = pd.concat([df, enriched_new], ignore_index=True)
                    
                    # Save!
                    update_db(data_key, df)
                    
                    # Force session state update to ensure rerun uses fresh data
                    if "dfs" in st.session_state:
                        st.session_state["dfs"][data_key] = df
                    
                    st.success(f"✅ {r_email} 등록 및 자산 정보 연동 완료!")
                    st.rerun()

    tab1, tab2 = st.tabs(["📝 리스트 편집", "📂 대량 업데이트"])
    with tab1:
        # Prepare controlled options for selectboxes to show ONLY return-related actions
        # This prevents serial numbers of other users from showing up in the dropdown.
        return_options = ["", "-", "반납", "반납완료", "없음"]

        # Add explicit selection column if not present
        if "선택" not in df_view.columns:
            df_view.insert(0, "선택", False)
        
        # Ensure we have a clean index for the editor to avoid double-index issues
        df_view = df_view.reset_index(drop=True)

        # Detect changes from previous run via session_state
        edited_df = st.data_editor(
            df_view, 
            num_rows="dynamic", 
            width="stretch", 
            hide_index=True, # Hide the index column as requested by user
            key="resign_edit",
            column_config={
                "선택": st.column_config.CheckboxColumn("선택", default=False),
                "F": st.column_config.NumberColumn("년", help="퇴사 년도", format="%d", required=False),
                "월": st.column_config.NumberColumn("월", min_value=1, max_value=12, required=False),
                "날짜": st.column_config.NumberColumn("날짜", min_value=1, max_value=31, required=False),
                "email": st.column_config.TextColumn("이메일", required=True),
                "NAME": st.column_config.TextColumn("NAME", required=False),
                "BU": st.column_config.TextColumn("BU", required=False),
                # "노트북", "아이패드" 등은 SelectboxColumn 제한 때문에 시리얼 넘버가 안 보일 수 있음.
                # 텍스트로 보여주고 자유롭게 수정 가능하게 변경
                "노트북": st.column_config.TextColumn("노트북"),
                "아이패드": st.column_config.TextColumn("아이패드"),
                "복합기": st.column_config.TextColumn("복합기"),
                "Teams": st.column_config.TextColumn("Teams"),
            },
        )

        # ---------------------------------------------------------------------
        # AUTOMATION: Auto-Enrich and Auto-Save
        # ---------------------------------------------------------------------
        state = st.session_state.get("resign_edit")
        if state:
            # Determine if we should commit to DB
            should_commit = False
            needs_enrich = False
            should_rerun = False
            
            # 1. Deletions are always commits
            if state.get("deleted_rows"):
                should_commit = True
                should_rerun = True # Refresh after deletion
            
            # 2. Edits are commits, BUT IGNORE '선택' column changes
            if state.get("edited_rows"):
                for idx_str, edits in state.get("edited_rows").items():
                    real_changes = [k for k in edits.keys() if k != "선택"]
                    if real_changes:
                        should_commit = True
                        if "email" in real_changes: 
                            needs_enrich = True
                            should_rerun = True
            
            # 3. Additions: Only commit if at least one added row has an email
            if state.get("added_rows"):
                for row_data in state.get("added_rows"):
                    if row_data.get("email"):
                        should_commit = True
                        needs_enrich = True
                        should_rerun = True
                        break

            if should_commit:
                # 1. Clean data (handle '선택' and empty emails)
                save_df = edited_df.copy()
                ignore_cols = ["선택"]
                save_df = save_df.dropna(how='all', subset=[c for c in save_df.columns if c not in ignore_cols])
                
                if save_df.empty: 
                    st.rerun()
                
                if needs_enrich:
                    save_df = enrich_data_with_assets(save_df)
                
                # Handle "반납" processing
                for idx, row in save_df.iterrows():
                    email, name, bu = row.get("email"), row.get("NAME"), row.get("BU")
                    if not email: continue
                    
                    if str(row.get("노트북")) == "반납":
                        process_asset_return(email, asset_type="Lease", name=name, bu=bu)
                        save_df.at[idx, "노트북"] = "반납완료"
                        should_rerun = True
                    if str(row.get("아이패드")) == "반납":
                        process_asset_return(email, asset_type="iPad", name=name, bu=bu)
                        save_df.at[idx, "아이패드"] = "반납완료"
                        should_rerun = True
                    if str(row.get("Teams")) == "반납":
                        process_asset_return(email, asset_type="Teams", name=name, bu=bu)
                        save_df.at[idx, "Teams"] = "반납완료"
                        should_rerun = True

                # 2. Save to DB (dropping '선택')
                db_df = save_df.copy()
                if "선택" in db_df.columns: db_df = db_df.drop(columns=["선택"])
                
                update_db(data_key, db_df)
                if should_rerun:
                    st.rerun()

        col1, col2, col3 = st.columns([1, 1, 1])
        # Note: Manual Save and Auto-fill buttons removed to favor automation.
        with col1:
             st.info("💡 변경 사항은 자동으로 저장됩니다.")
        with col2:
            selected_rows = edited_df[edited_df["선택"] == True]
            if st.button("🔄 선택된 퇴사자 반납 처리", key="return_assets", disabled=selected_rows.empty):
                success_list = []
                for idx, row in selected_rows.iterrows():
                    email, name, bu = row.get("email"), row.get("NAME"), row.get("BU")
                    if email:
                        success, msg = process_asset_return(email, name=name, bu=bu)
                        if success: success_list.append(f"{email} ({msg})")
                        else: st.warning(f"{email}: {msg}")
                if success_list:
                    st.success("\n".join(success_list))
                    st.rerun()
        with col3:
            selected_rows = edited_df[edited_df["선택"] == True]
            btn_del = st.button("🏃‍♂️ 퇴사 확정 (마스터 삭제)", key="final_delete", type="primary", disabled=selected_rows.empty, help="대시보드(Master DB)에서 해당 사용자를 영구 삭제합니다.")
            if btn_del:
                # Clear previous messages
                st.session_state["del_msg"] = []
                
                del_count = 0
                for idx, row in selected_rows.iterrows():
                    email = row.get("email")
                    name = row.get("NAME")
                    bu = row.get("BU")
                    
                    # 1. Automatically process any pending "반납" items
                    if str(row.get("노트북")) == "반납": process_asset_return(email, asset_type="Lease", name=name, bu=bu)
                    if str(row.get("아이패드")) == "반납": process_asset_return(email, asset_type="iPad", name=name, bu=bu)
                    if str(row.get("Teams")) == "반납": process_asset_return(email, asset_type="Teams", name=name, bu=bu)

                    # 2. Safety check: remaining assets
                    asset_check = {
                        "노트북": row.get("노트북"),
                        "아이패드": row.get("아이패드"),
                        "모니터": row.get("모니터"),
                        "복합기": row.get("복합기"),
                        "Teams": row.get("Teams")
                    }
                    allowed_states = ["", "-", "None", "nan", "반납완료", "없음", "STOCK", "폐기함", "반납"]
                    remaining = {k: v for k, v in asset_check.items() if v and str(v).strip() not in allowed_states}
                    
                    if remaining:
                        error_detail = ", ".join([f"{k}: {v}" for k, v in remaining.items()])
                        st.session_state["del_msg"].append({"type": "error", "msg": f"⚠️ {name}({email}) 삭제 불가: 미반납 자산 존재 ({error_detail})"})
                        continue
                    
                    success, msg = delete_user_from_master(email)
                    if success:
                        st.session_state["del_msg"].append({"type": "success", "msg": f"✅ {name}({email}) 삭제 완료: {msg}"})
                        edited_df.at[idx, "설명"] = "퇴사확인완료"
                        del_count += 1
                    else:
                         st.session_state["del_msg"].append({"type": "error", "msg": f"❌ {name}({email}) 삭제 실패: {msg}"})
                
                if del_count > 0:
                    update_db(data_key, edited_df)
                
                # Rerun to refresh list and show messages at the top
                st.rerun()

    with tab2:
        st.download_button(
            "📥 다운로드", df.to_csv(index=False).encode("utf-8-sig"), f"{data_key}.csv"
        )
        up = st.file_uploader("파일 업로드", type=["csv", "xlsx"], key="up_resign")
        if up and st.button("교체하기", key="btn_up_resign"):
            new = pd.read_csv(up) if up.name.endswith(".csv") else pd.read_excel(up)
            new = enrich_data_with_assets(new)
            update_db(data_key, new)
            st.rerun()
