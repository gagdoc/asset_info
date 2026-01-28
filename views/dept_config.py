import streamlit as st
import pandas as pd
from common.utils import update_db


def render_dept_config_page(dfs):
    """BU/ROLE 카테고리 관리 페이지"""
    st.title("⚙️ BU/ROLE 카테고리 관리")
    st.info("1차 카테고리 BU를 생성하고, 각 BU 하위에 2차 카테고리 ROLE을 추가하세요.")

    # 세션 상태에서 바로 사용 (dfs는 이미 전달된 파라미터)
    dept_config_df = dfs.get("Dept_Config", pd.DataFrame())

    # =========== 섹션 1: BU 관리 ===========
    st.subheader("🏢 1차 카테고리 (BU) 관리")

    # 현재 BU 목록 추출
    if not dept_config_df.empty and "BU" in dept_config_df.columns:
        bu_list = sorted(dept_config_df["BU"].dropna().unique().tolist())
    else:
        bu_list = []

    col1, col2 = st.columns([3, 1])
    with col1:
        new_bu = st.text_input("새 BU 추가", placeholder="예: 개발팀, 마케팅, HR 등", key="new_bu_input")
    with col2:
        st.write("")  # 높이 맞추기
        if st.button("➕ BU 추가", key="add_bu_btn"):
            if new_bu.strip():
                new_bu = new_bu.strip()
                if new_bu not in bu_list:
                    # 새 BU에 대해 기본 ROLE 행 추가
                    new_row = pd.DataFrame([{"BU": new_bu, "ROLE": ""}])
                    if dept_config_df.empty:
                        dept_config_df = new_row
                    else:
                        dept_config_df = pd.concat([dept_config_df, new_row], ignore_index=True)
                    
                    # DB에 저장
                    update_db("Dept_Config", dept_config_df)
                    st.success(f"✅ '{new_bu}' BU가 추가되었습니다.")
                    st.rerun()
                else:
                    st.warning(f"⚠️ '{new_bu}'은(는) 이미 존재합니다.")
            else:
                st.error("❌ BU명을 입력하세요.")

    st.write("**현재 BU 목록:**")
    if bu_list:
        bu_cols = st.columns(min(4, len(bu_list)))
        for idx, bu in enumerate(bu_list):
            with bu_cols[idx % len(bu_cols)]:
                if st.button(f"🗑️ {bu}", key=f"delete_bu_{bu}"):
                    # 해당 BU의 모든 행 삭제
                    dept_config_df = dept_config_df[dept_config_df["BU"] != bu]
                    update_db("Dept_Config", dept_config_df)
                    st.success(f"✅ '{bu}'이(가) 삭제되었습니다.")
                    st.rerun()
    else:
        st.info("추가된 BU가 없습니다.")

    st.divider()

    # =========== 섹션 2: BU별 ROLE 관리 ===========
    st.subheader("📋 2차 카테고리 (ROLE) 관리")

    if bu_list:
        # 세션에 선택된 BU 저장
        if "selected_bu_config" not in st.session_state:
            st.session_state.selected_bu_config = bu_list[0] if bu_list else ""
        
        selected_bu = st.selectbox(
            "BU 선택",
            options=bu_list,
            index=bu_list.index(st.session_state.selected_bu_config) if st.session_state.selected_bu_config in bu_list else 0,
            key="select_bu_for_role"
        )
        
        # 선택된 BU를 세션에 저장
        st.session_state.selected_bu_config = selected_bu

        # 선택된 BU의 ROLE 목록 (최신 데이터로)
        if not dept_config_df.empty:
            bu_roles = dept_config_df[dept_config_df["BU"] == selected_bu].copy()
            role_list = bu_roles["ROLE"].dropna().unique().tolist()
            role_list = [r for r in role_list if r.strip()]
        else:
            role_list = []

        st.write(f"**'{selected_bu}' 하위 ROLE:**")

        # 새 ROLE 추가
        col1, col2 = st.columns([3, 1])
        with col1:
            new_role = st.text_input(
                f"새 ROLE 추가 ({selected_bu})",
                placeholder="예: 개발자, PM, 디자이너 등",
                key="new_role_input"
            )
        with col2:
            st.write("")  # 높이 맞추기
            if st.button("➕ ROLE 추가", key="add_role_btn"):
                if new_role.strip():
                    new_role = new_role.strip()
                    if new_role not in role_list:
                        # 새 ROLE 행 추가
                        new_row = pd.DataFrame([{"BU": selected_bu, "ROLE": new_role}])
                        dept_config_df = pd.concat([dept_config_df, new_row], ignore_index=True)
                        update_db("Dept_Config", dept_config_df)
                        st.success(f"✅ '{new_role}' ROLE이 추가되었습니다.")
                        st.rerun()
                    else:
                        st.warning(f"⚠️ '{new_role}'은(는) 이미 존재합니다.")
                else:
                    st.error("❌ ROLE명을 입력하세요.")

        # ROLE 목록 표시 및 삭제
        if role_list:
            role_cols = st.columns(min(4, len(role_list)))
            for idx, role in enumerate(role_list):
                with role_cols[idx % len(role_cols)]:
                    if st.button(f"🗑️ {role}", key=f"delete_role_{role}"):
                        # 해당 BU의 해당 ROLE 행 삭제
                        dept_config_df = dept_config_df[
                            ~((dept_config_df["BU"] == selected_bu) & (dept_config_df["ROLE"] == role))
                        ]
                        update_db("Dept_Config", dept_config_df)
                        st.success(f"✅ '{role}'이(가) 삭제되었습니다.")
                        st.rerun()
        else:
            st.info(f"'{selected_bu}' 하위에 ROLE이 없습니다.")
    else:
        st.warning("먼저 BU를 추가하세요.")

    st.divider()

    # =========== 섹션 3: 전체 Dept_Config 데이터 조회 ===========
    st.subheader("📊 전체 Dept_Config 데이터")

    if not dept_config_df.empty:
        # 데이터 정렬 (BU 기준, 그 후 ROLE 기준)
        display_df = dept_config_df.sort_values(by=["BU", "ROLE"]).reset_index(drop=True)
        
        # 중복 제거
        display_df = display_df.drop_duplicates(subset=["BU", "ROLE"], keep="first")
        
        st.dataframe(display_df, use_container_width=True)
        
        st.write(f"**총 {len(display_df)}개의 BU/ROLE 쌍**")
    else:
        st.info("등록된 BU/ROLE이 없습니다.")
