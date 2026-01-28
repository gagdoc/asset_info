import streamlit as st
import pandas as pd
from common.utils import (
    update_db,
    enrich_data_with_assets,
    render_file_uploader,
    normalize_email,
)


def render_resign_page(dfs):
    st.title("👋 퇴사자 관리")
    st.info(
        "이메일을 입력하고 저장하면 **보유 중인 모든 자산 정보가 자동으로 채워집니다.**"
    )
    data_key = "Resign"
    df = dfs[data_key]

    tab1, tab2 = st.tabs(["📝 리스트 편집", "📂 대량 업데이트"])
    with tab1:
        edited_df = st.data_editor(
            df, num_rows="dynamic", use_container_width=True, key="resign_edit"
        )

        if st.button("💾 저장 및 자산정보 채우기", key="save_resign"):
            enriched = enrich_data_with_assets(edited_df)
            update_db(data_key, enriched)
            st.success("✅ 저장 완료!")
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
