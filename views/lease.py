import streamlit as st
import pandas as pd
from common.utils import update_db, render_file_uploader


def render_lease_page(dfs):
    st.title("💻 PC/노트북 (Lease) 관리")
    data_key = "Lease"
    df = dfs[data_key]

    with st.expander("🔍 데이터 무결성 검증 (이메일 일치 확인)", expanded=False):
        if st.button("검증 시작", key="check_lease"):
            asset_emails = set(
                df["email"].dropna().str.strip().str.lower().tolist()
            ) - {""}
            dash_emails = set(
                dfs["All_User"]["email"].dropna().str.strip().str.lower().tolist()
            )
            missing = asset_emails - dash_emails
            c1, c2, c3 = st.columns(3)
            c1.metric("총 자산(이메일)", f"{len(asset_emails)}")
            c2.metric("정상 연결", f"{len(asset_emails)-len(missing)}")
            c3.metric("⚠️ 불일치", f"{len(missing)}", delta_color="inverse")
            if missing:
                st.error("대시보드에 없는 이메일:")
                tmp = df.copy()
                tmp["_norm"] = tmp["email"].astype(str).str.strip().str.lower()
                st.dataframe(tmp[tmp["_norm"].isin(missing)].drop(columns=["_norm"]))
            else:
                st.success("🎉 완벽하게 일치합니다!")

    tab1, tab2 = st.tabs(["📝 리스트 편집", "📂 파일 등록"])
    with tab1:
        edited_df = st.data_editor(
            df, num_rows="dynamic", use_container_width=True, key=f"edit_{data_key}"
        )

        if st.button("💾 저장", key=f"save_{data_key}"):
            update_db(data_key, edited_df)
            st.rerun()
    with tab2:
        render_file_uploader(data_key, df)
