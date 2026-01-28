import streamlit as st
import pandas as pd
from common.utils import (
    style_resigned_rows,
    update_db,
)


def render_dashboard_page(dfs):
    st.title("📊 통합 자산 현황")
    st.caption("퇴사자는 NO 컬럼이 **주황색**으로 표시되며, 상세 퇴사일이 표시됩니다.")
    st.info(
        "데이터를 수정하거나 삭제하면 'All_User' 테이블(마스터 데이터)에 반영됩니다."
    )

    if "All_User" not in dfs:
        st.error("데이터베이스에 'All_User' 테이블이 없습니다.")
        return

    main_df = dfs["All_User"].copy()

    # 데이터 정제
    if "email" in main_df.columns:
        main_df["email"] = main_df["email"].astype(str).str.strip().str.lower()
        mask = (
            (main_df["email"] != "nan")
            & (main_df["email"] != "")
            & (main_df["email"] != "none")
        )
        main_df = main_df[mask]
        main_df.reset_index(drop=True, inplace=True)
        main_df["NO"] = main_df.index + 1

        if "SKL분류" not in main_df.columns:
            main_df["SKL분류"] = ""
        
        # BU/ROLE 컬럼이 없으면 추가
        if "BU" not in main_df.columns:
            main_df["BU"] = ""
        else:
            # 기존 BU 데이터 유지 (NaN을 공백으로 변환)
            main_df["BU"] = main_df["BU"].fillna("").astype(str)
        
        if "ROLE" not in main_df.columns:
            main_df["ROLE"] = ""
        else:
            # 기존 ROLE 데이터 유지 (NaN을 공백으로 변환)
            main_df["ROLE"] = main_df["ROLE"].fillna("").astype(str)
    else:
        st.error("'All_User' 테이블에 'email' 컬럼이 없습니다.")
        return

    total_count = len(main_df)
    st.metric(label="👥 총 운용 인원 (Email 기준)", value=f"{total_count} 명")

    # ---------------------------------------------------------
    # 마스터 데이터 관리 (편집)
    # ---------------------------------------------------------
    with st.expander("🛠 마스터 데이터 관리 (수정/삭제) - 모든 컬럼", expanded=False):
        st.info("📌 아래 표에서 데이터를 수정하면 실시간으로 DB에 반영됩니다.")
        
        # NO 컬럼 비활성화 설정
        col_config = {
            "NO": st.column_config.NumberColumn("No.", disabled=True, format="%d"),
        }
        
        # 데이터 에디터 표시 (모든 컬럼)
        edited_df = st.data_editor(
            main_df,
            key="dashboard_editor",
            width='stretch',
            num_rows="dynamic",
            column_config=col_config,
            use_container_width=True,
        )

        if st.button("💾 변경사항 저장", key="save_dashboard_changes"):
            if "email" in edited_df.columns:
                # edited_df를 그대로 사용 (모든 컬럼 포함)
                final_save_df = edited_df.copy()
                
                # 이메일 유효성 검사
                valid_mask = (final_save_df["email"].notna()) & (
                    final_save_df["email"].astype(str).str.strip() != ""
                )
                final_save_df = final_save_df[valid_mask].copy()
                final_save_df.reset_index(drop=True, inplace=True)
                final_save_df["NO"] = final_save_df.index + 1

                update_db("All_User", final_save_df)
                st.success("✅ 마스터 데이터가 업데이트되었습니다.")
                st.rerun()

    st.divider()

    # ---------------------------------------------------------
    # 자산 정보 병합 및 조회
    # ---------------------------------------------------------
    st.markdown("### 📋 자산 통합 상세 조회")
    view_df = main_df.copy()

    # 자산 병합 (기존 로직)
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
            view_df = pd.merge(view_df, subset, on="email", how="left")
        except:
            pass

    if not dfs["iPad"].empty and "email" in dfs["iPad"].columns:
        try:
            target_col = "S/N" if "S/N" in dfs["iPad"].columns else "Model"
            subset = (
                dfs["iPad"][["email", target_col]]
                .rename(columns={target_col: "Ipad_List"})
                .drop_duplicates("email")
            )
            view_df = pd.merge(view_df, subset, on="email", how="left")
        except:
            pass

    if not dfs["Monitor"].empty and "email" in dfs["Monitor"].columns:
        try:
            subset = (
                dfs["Monitor"][["email", "Model"]]
                .rename(columns={"Model": "모니터"})
                .drop_duplicates("email")
            )
            view_df = pd.merge(view_df, subset, on="email", how="left")
        except:
            pass

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
                view_df = pd.merge(view_df, subset, on="email", how="left")
        except:
            pass

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
            view_df = pd.merge(view_df, subset, on="email", how="left")
        except:
            pass

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
            view_df = pd.merge(view_df, r_sub, on="email", how="left")
        except:
            pass

    # 병합 과정에서 생성될 수 있는 중복 접미사('_x', '_y') 컬럼 정리
    def _consolidate_dup_cols(df):
        suffixed = [c for c in df.columns if c.endswith("_x") or c.endswith("_y")]
        bases = set([c[:-2] for c in suffixed])
        for base in bases:
            x = base + "_x"
            y = base + "_y"
            if x in df.columns and y in df.columns:
                df[base] = df[x].combine_first(df[y])
                df.drop([x, y], axis=1, inplace=True)
            elif x in df.columns:
                df[base] = df[x]
                df.drop(x, axis=1, inplace=True)
            elif y in df.columns:
                df[base] = df[y]
                df.drop(y, axis=1, inplace=True)
        return df

    view_df = _consolidate_dup_cols(view_df)

    view_df["퇴사정보"] = view_df.get("퇴사정보", pd.Series()).fillna("없음")

    # Monitor 컬럼 통합 (한국어 '모니터'가 있으면 영어 'Monitor'로 통합)
    if "모니터" in view_df.columns and "Monitor" not in view_df.columns:
        view_df["Monitor"] = view_df["모니터"]
        view_df.drop("모니터", axis=1, inplace=True)

    # 표시할 컬럼 목록 (순서 고정)
    desired_cols = [
        "NAME",
        "이름",
        "email",
        "BU",
        "ROLE",
        "Lease_List",
        "Ipad_List",
        "TeamsNum",
        "Printer",
        "Monitor",
    ]

    # 없거나 NaN인 컬럼은 생성하고 기본값 채우기
    for col in desired_cols:
        if col not in view_df.columns:
            view_df[col] = "-"
        else:
            view_df[col] = view_df[col].fillna("-")

    # 최종 표시용 DF (원하는 컬럼만 순서대로)
    display_df = view_df[desired_cols].copy()

    search = st.text_input("🔍 통합 검색 (자산 포함)", key="search_dash")
    col_cfg = {"NO": st.column_config.NumberColumn("No.", format="%d")}
    if search:
        mask = (
            display_df.astype(str)
            .apply(lambda x: x.str.contains(search, case=False))
            .any(axis=1)
        )
        filtered = display_df[mask].copy()
        # 순번 추가
        filtered.insert(0, "NO", range(1, len(filtered) + 1))
        st.dataframe(
            filtered, hide_index=True, use_container_width=True, column_config=col_cfg
        )
    else:
        full = display_df.copy()
        full.insert(0, "NO", range(1, len(full) + 1))
        st.dataframe(
            full, use_container_width=True, hide_index=True, column_config=col_cfg
        )

    st.markdown("### 📅 월별 퇴사자 조회")
    if not dfs["Resign"].empty:
        if "년도" in dfs["Resign"].columns and "월" in dfs["Resign"].columns:
            c1, c2 = st.columns(2)
            with c1:
                unique_years = sorted(
                    [int(y) for y in dfs["Resign"]["년도"].unique() if pd.notnull(y)]
                )
                yr = st.selectbox(
                    "년도 선택",
                    unique_years,
                    format_func=lambda x: f"{x}년",
                    key="resign_year",
                )
            with c2:
                if yr:
                    unique_months = sorted(
                        [
                            int(m)
                            for m in dfs["Resign"][dfs["Resign"]["년도"] == yr][
                                "월"
                            ].unique()
                            if pd.notnull(m)
                        ]
                    )
                    mn = st.selectbox(
                        "월 선택",
                        unique_months,
                        format_func=lambda x: f"{x}월",
                        key="resign_month",
                    )
                else:
                    mn = None
            if yr and mn:
                st.write(f"**{yr}년 {mn}월 퇴사자 명단**")
                st.dataframe(
                    dfs["Resign"][
                        (dfs["Resign"]["년도"] == yr) & (dfs["Resign"]["월"] == mn)
                    ],
                    use_container_width=True,
                )
        elif "월" in dfs["Resign"].columns:
            unique_months = sorted(
                [int(m) for m in dfs["Resign"]["월"].unique() if pd.notnull(m)]
            )
            mn = st.selectbox(
                "월 선택 (년도 미상)",
                unique_months,
                format_func=lambda x: f"{x}월",
                key="resign_month_only",
            )
            if mn:
                st.dataframe(
                    dfs["Resign"][dfs["Resign"]["월"] == mn], use_container_width=True
                )
