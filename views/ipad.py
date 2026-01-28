import streamlit as st
import pandas as pd
from common.utils import update_db, render_file_uploader, normalize_email


def render_ipad_page(dfs):
    st.title("📱 아이패드 (iPad) 관리")
    data_key = "iPad"
    df = dfs[data_key]
    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")

    # 통계
    total = len(df)
    in_use = (
        df["email"].astype(str).str.contains("@", na=False).sum()
        if "email" in df.columns
        else 0
    )
    st.markdown("### 📈 자산 현황")
    c1, c2, c3 = st.columns(3)
    c1.metric("총 iPad", f"{total}대")
    c2.metric("사용 중", f"{in_use}대")
    c3.metric("미사용", f"{total-in_use}대")
    st.divider()

    # 검증
    with st.expander("🔍 데이터 정합성 검증", expanded=False):
        if st.button("검증 시작", key="check_ipad"):
            emails = df["email"].dropna().str.strip().str.lower()
            emails = emails[emails != ""]
            dash_emails = set(dfs["All_User"]["email"].dropna().str.strip().str.lower())
            missing = set(emails) - dash_emails
            dups = emails.value_counts()
            dups = dups[dups > 1]
            sn_col = "S/N" if "S/N" in df.columns else df.columns[2]
            missing_sn = df[
                df[sn_col].isna() | (df[sn_col].astype(str).str.strip() == "")
            ]

            st.divider()
            c1, c2, c3 = st.columns(3)
            if not missing:
                c1.success("✅ 유령 계정 없음")
            else:
                c1.error(f"⚠️ 불일치: {len(missing)}명")
                tmp = df.copy()
                tmp["_n"] = tmp["email"].astype(str).str.strip().str.lower()
                with c1.expander("보기"):
                    st.dataframe(tmp[tmp["_n"].isin(missing)].drop(columns=["_n"]))

            if dups.empty:
                c2.success("✅ 중복 지급 없음")
            else:
                c2.warning(f"⚠️ 다중 보유: {len(dups)}명")
                tmp = df.copy()
                tmp["_n"] = tmp["email"].astype(str).str.strip().str.lower()
                with c2.expander("보기"):
                    st.dataframe(
                        tmp[tmp["_n"].isin(dups.index)]
                        .sort_values("email")
                        .drop(columns=["_n"])
                    )

            if missing_sn.empty:
                c3.success("✅ S/N 누락 없음")
            else:
                c3.error(f"⚠️ S/N 누락: {len(missing_sn)}건")
                with c3.expander("보기"):
                    st.dataframe(missing_sn)

    # 만기
    with st.expander("📅 만기 기기 검색 (3년)", expanded=False):
        if st.button("조회"):
            target = df[
                df["Date"] <= (pd.Timestamp.now() - pd.DateOffset(years=3))
            ].copy()
            target["Date"] = target["Date"].dt.strftime("%Y-%m-%d")
            if not target.empty:
                st.error(f"만기 기기: {len(target)}대")
                st.dataframe(target)
            else:
                st.success("만기 기기 없음")

    # 편집
    disp = df.copy()
    if "Date" in disp.columns:
        disp["Date"] = disp["Date"].dt.strftime("%Y-%m-%d")

    tab1, tab2 = st.tabs(["📝 리스트 편집", "📂 파일 등록"])
    with tab1:
        ed = st.data_editor(
            disp, num_rows="dynamic", use_container_width=True, key=f"edit_{data_key}"
        )

        if st.button("💾 저장", key=f"save_{data_key}"):
            update_db(data_key, ed)
            st.rerun()
    with tab2:
        st.download_button(
            "📥 다운로드",
            disp.to_csv(index=False).encode("utf-8-sig"),
            f"{data_key}.csv",
        )
        up = st.file_uploader("파일 업로드", type=["csv", "xlsx"], key="up_ipad")
        if up and st.button("교체하기", key="btn_up_ipad"):
            new = pd.read_csv(up) if up.name.endswith(".csv") else pd.read_excel(up)
            new = normalize_email(new)
            update_db(data_key, new)
            st.rerun()
