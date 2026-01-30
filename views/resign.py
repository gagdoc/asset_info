import streamlit as st
import pandas as pd
from common.utils import (
    update_db,
    enrich_data_with_assets,
    process_asset_return,
    render_file_uploader,
    normalize_email,
)


def render_resign_page(dfs):
    st.title("👋 퇴사자 관리")
    st.info(
        "이메일을 입력하고 저장하면 **보유 중인 모든 자산 정보가 자동으로 채워집니다.**\n\n"
        "반납 처리를 하려면 해당 행을 선택하고 **[🔄 선택된 퇴사자 반납 처리]** 버튼을 클릭하세요."
    )
    data_key = "Resign"
    df = dfs[data_key]

    tab1, tab2 = st.tabs(["📝 리스트 편집", "📂 대량 업데이트"])
    with tab1:
        # Enable row selection
        edited_df = st.data_editor(
            df, 
            num_rows="dynamic", 
            use_container_width=True, 
            key="resign_edit",
            column_config={
                "email": st.column_config.TextColumn("이메일", required=True),
            },
        )

        col1, col2, col3 = st.columns(3)
        with col1:
            if st.button("💾 변경사항 저장", key="save_resign"):
                update_db(data_key, edited_df)
                st.success("✅ 저장 완료!")
                st.rerun()
        with col2:
            if st.button("🪄 자산 정보 자동 채우기", key="enrich_resign"):
                enriched = enrich_data_with_assets(edited_df)
                update_db(data_key, enriched)
                st.success("✅ 자산 정보 업데이트 완료!")
                st.rerun()
        with col3:
            # Check if any row is selected in the data editor
            # Note: st.data_editor row selection is in st.session_state["resign_edit"]["selection"]["rows"]
            selection = st.session_state.get("resign_edit", {}).get("selection", {}).get("rows", [])
            
            if st.button("🔄 선택된 퇴사자 반납 처리", key="return_assets", disabled=not selection):
                success_list = []
                for row_idx in selection:
                    # Get email from the edited_df!
                    email = edited_df.iloc[row_idx].get("email")
                    if email:
                        success, msg = process_asset_return(email)
                        if success:
                            success_list.append(f"{email} ({msg})")
                        else:
                            st.warning(f"{email}: {msg}")
                
                if success_list:
                    st.success("\n".join(success_list))
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
