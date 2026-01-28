import streamlit as st
import pandas as pd
from utils import style_resigned_rows


def render_dashboard_page(dfs):
    st.title("📊 통합 자산 현황")
    st.caption("퇴사자는 NO 컬럼이 **주황색**으로 표시되며, 상세 퇴사일이 표시됩니다.")

    main_df = dfs["All_User"].copy()
    cols_to_remove = [
        "Lease_List",
        "Ipad_List",
        "모니터",
        "TeamsNum",
        "Printer",
        "퇴사정보",
        "Resign",
    ]
    main_df = main_df.drop(columns=[c for c in main_df.columns if c in cols_to_remove])

    if not main_df.empty and "email" in main_df.columns:
        # --- 자산 병합 로직 (간소화) ---
        # 1. Lease
        if not dfs["Lease"].empty and "email" in dfs["Lease"].columns:
            try:
                target_col = (
                    "S/N" if "S/N" in dfs["Lease"].columns else dfs["Lease"].columns[3]
                )
                subset = (
                    dfs["Lease"][["email", target_col]]
                    .rename(columns={target_col: "Lease_List"})
                    .drop_duplicates("email")
                )
                main_df = pd.merge(main_df, subset, on="email", how="left")
            except:
                pass
        # ... (iPad, Monitor, Teams, Printer 로직은 동일하게 유지 - 생략 가능하지만 복붙 편의상 생략) ...
        # (편의를 위해 iPad, Monitor 등은 위 app.py 코드와 동일하게 병합 로직을 넣어주세요)
        # 2. iPad
        if not dfs["iPad"].empty and "email" in dfs["iPad"].columns:
            try:
                target_col = "S/N" if "S/N" in dfs["iPad"].columns else "Model"
                subset = (
                    dfs["iPad"][["email", target_col]]
                    .rename(columns={target_col: "Ipad_List"})
                    .drop_duplicates("email")
                )
                main_df = pd.merge(main_df, subset, on="email", how="left")
            except:
                pass
        # 3. Monitor
        if not dfs["Monitor"].empty and "email" in dfs["Monitor"].columns:
            try:
                subset = (
                    dfs["Monitor"][["email", "Model"]]
                    .rename(columns={"Model": "모니터"})
                    .drop_duplicates("email")
                )
                main_df = pd.merge(main_df, subset, on="email", how="left")
            except:
                pass
        # 4. Teams
        if not dfs["Teams"].empty and "email" in dfs["Teams"].columns:
            try:
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
                    subset = (
                        dfs["Teams"][["email", target_col]]
                        .rename(columns={target_col: "TeamsNum"})
                        .drop_duplicates("email")
                    )
                    main_df = pd.merge(main_df, subset, on="email", how="left")
            except:
                pass
        # 5. Printer
        if not dfs["Printer"].empty and "email" in dfs["Printer"].columns:
            try:
                cols = dfs["Printer"].columns
                target_col = (
                    "Additional Information 2"
                    if "Additional Information 2" in cols
                    else ("프린터정보" if "프린터정보" in cols else "Model")
                )
                subset = (
                    dfs["Printer"][["email", target_col]]
                    .rename(columns={target_col: "Printer"})
                    .drop_duplicates("email")
                )
                main_df = pd.merge(main_df, subset, on="email", how="left")
            except:
                pass

        # 6. Resign (퇴사자 정보 - 날짜 포함)
        if not dfs["Resign"].empty and "email" in dfs["Resign"].columns:
            try:
                r_sub = dfs["Resign"].copy()
                if all(c in r_sub.columns for c in ["년도", "월", "날짜"]):
                    r_sub["퇴사정보"] = r_sub.apply(
                        lambda x: (
                            f"{int(x['년도'])}년 {int(x['월'])}월 {int(x['날짜'])}일 퇴사"
                            if pd.notnull(x["년도"])
                            else "퇴사자"
                        ),
                        axis=1,
                    )
                elif "월" in r_sub.columns and "날짜" in r_sub.columns:
                    r_sub["퇴사정보"] = r_sub.apply(
                        lambda x: (
                            f"{int(x['월'])}월 {int(x['날짜'])}일 퇴사"
                            if pd.notnull(x["월"])
                            else "퇴사자"
                        ),
                        axis=1,
                    )
                else:
                    r_sub["퇴사정보"] = "퇴사자 목록 포함"
                r_sub = r_sub[["email", "퇴사정보"]].drop_duplicates("email")
                main_df = pd.merge(main_df, r_sub, on="email", how="left")
            except:
                pass

        main_df["퇴사정보"] = main_df.get("퇴사정보", pd.Series()).fillna("없음")

        # --- 화면 정리 ---
        if "NO" in main_df.columns:
            main_df["NO"] = main_df["NO"].apply(
                lambda x: (
                    f"{int(float(x)):03d}"
                    if pd.notnull(x) and str(x).replace(".", "").isdigit()
                    else x
                )
            )

        hide_cols = [
            "Business Title",
            "Old_List",
            "ADD_data",
            "Bu.1",
            "영업자 구분",
            "Unnadmed:16",
            "Unnamed: 16",
        ]
        main_df = main_df.drop(
            columns=[c for c in hide_cols if c in main_df.columns]
            + [c for c in main_df.columns if "Unnamed" in str(c)],
            errors="ignore",
        )
        for col in ["Lease_List", "Ipad_List", "모니터", "TeamsNum", "Printer"]:
            if col in main_df.columns:
                main_df[col] = main_df[col].fillna("-")

        # 출력
        st.dataframe(
            main_df.style.apply(style_resigned_rows, axis=1),
            use_container_width=True,
            hide_index=True,
            column_config={
                "email": st.column_config.TextColumn("Email"),
                "NO": st.column_config.TextColumn("NO"),
                "퇴사정보": st.column_config.TextColumn("⚠️ 퇴사 정보"),
            },
        )

        # 검색 및 월별 조회
        st.divider()
        search = st.text_input("🔍 통합 검색", key="search_dash")
        if search:
            st.dataframe(
                main_df[
                    main_df.astype(str)
                    .apply(lambda x: x.str.contains(search, case=False))
                    .any(axis=1)
                ],
                hide_index=True,
            )

        st.markdown("### 📅 월별 퇴사자 조회")
        if not dfs["Resign"].empty:
            if "년도" in dfs["Resign"].columns and "월" in dfs["Resign"].columns:
                c1, c2 = st.columns(2)
                with c1:
                    yr = st.selectbox(
                        "년도 선택",
                        sorted(
                            [
                                int(y)
                                for y in dfs["Resign"]["년도"].unique()
                                if pd.notnull(y)
                            ]
                        ),
                        format_func=lambda x: f"{x}년",
                    )
                with c2:
                    mn = (
                        st.selectbox(
                            "월 선택",
                            sorted(
                                [
                                    int(m)
                                    for m in dfs["Resign"][dfs["Resign"]["년도"] == yr][
                                        "월"
                                    ].unique()
                                    if pd.notnull(m)
                                ]
                            ),
                            format_func=lambda x: f"{x}월",
                        )
                        if yr
                        else None
                    )
                if yr and mn:
                    st.write(f"**{yr}년 {mn}월 퇴사자 명단**")
                    st.dataframe(
                        dfs["Resign"][
                            (dfs["Resign"]["년도"] == yr) & (dfs["Resign"]["월"] == mn)
                        ],
                        use_container_width=True,
                    )
            elif "월" in dfs["Resign"].columns:
                mn = st.selectbox(
                    "월 선택 (년도 미상)",
                    sorted(
                        [int(m) for m in dfs["Resign"]["월"].unique() if pd.notnull(m)]
                    ),
                    format_func=lambda x: f"{x}월",
                )
                if mn:
                    st.dataframe(
                        dfs["Resign"][dfs["Resign"]["월"] == mn],
                        use_container_width=True,
                    )
    else:
        st.warning("데이터가 없습니다.")
