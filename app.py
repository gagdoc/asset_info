import streamlit as st
import os
from config import DB_FILE, PAGE_TITLE, LAYOUT
from common.utils import save_excel_to_db, load_from_db
from common.database import init_db, get_users_detailed, ASSET_DB_FILE

# 자산 관리 뷰 파일 (views 패키지에서 재수출)
from views import (
    render_dashboard_page,
    render_new_hire_page,
    render_lease_page,
    render_ipad_page,
    render_resign_page,
    render_common_page,
    render_dept_config_page,
)

# 소모품 관리 페이지
from pages_ui.consumables_outbound import show_outbound_page
from pages_ui.consumables_report import show_report_page
from pages_ui.consumables_items import show_items_page
from pages_ui.consumables_dashboard import show_dashboard_page as show_consumables_dashboard

st.set_page_config(layout=LAYOUT, page_title=PAGE_TITLE)

# ==========================================
# DB 초기화
# ==========================================
init_db()

# ==========================================
# 메인 메뉴 선택 (탭 형식)
# ==========================================
st.sidebar.title("🏢 사내 관리 시스템")
main_menu = st.sidebar.radio(
    "선택",
    ["📊 자산 관리", "📦 소모품 관리"],
    horizontal=False
)

# ==========================================
# 📊 자산 관리 모듈
# ==========================================
if main_menu == "📊 자산 관리":
    st.sidebar.markdown("---")
    # ==========================================
    # System Status / Setup
    # ==========================================
    from common.database import get_supabase_client
    supabase = get_supabase_client()
    
    st.sidebar.markdown("---")
    st.sidebar.subheader("🔌 시스템 상태")
    if supabase:
        st.sidebar.success("☁️ Cloud DB (Supabase) 연결됨")
    else:
        st.sidebar.warning("💻 Local DB (파일) 사용 중")
        

    st.sidebar.subheader("⚙️ 데이터 관리")
    
    if os.path.exists(DB_FILE):
        if not supabase:
             st.sidebar.success("🟢 Local DB 연결됨")
        if "dfs" not in st.session_state:
            st.session_state["dfs"] = load_from_db()
    else:
        if not supabase:
             st.sidebar.warning("🔴 Local DB 없음")
             st.info("왼쪽 사이드바에서 엑셀 파일(ASSET_INFO.xlsx)을 업로드해주세요.")

    uploaded_file = st.sidebar.file_uploader(
        "📂 엑셀 파일 선택", type=["xlsx"], key="sidebar_uploader"
    )
    if uploaded_file and st.sidebar.button("🔄 데이터 초기화 및 업데이트", key="sidebar_btn"):
        save_excel_to_db(uploaded_file)
        st.session_state["dfs"] = load_from_db()
        st.rerun()

    if "dfs" not in st.session_state:
        st.stop()

    dfs = st.session_state["dfs"]

    st.sidebar.markdown("---")
    st.sidebar.subheader("📑 메뉴 선택")
    asset_menu = st.sidebar.radio(
        "자산 관리 메뉴",
        [
            "대시보드 (통합 조회)",
            "BU/ROLE 관리",
            "신규 입사자 관리",
            "PC/노트북 (Lease)",
            "아이패드 (iPad)",
            "팀즈 번호 (Teams)",
            "모니터 (Monitor)",
            "프린터 (Printer)",
            "퇴사자 관리 (Resign)",
        ],
        key="asset_menu"
    )

    if asset_menu == "대시보드 (통합 조회)":
        render_dashboard_page(dfs)
    elif asset_menu == "BU/ROLE 관리":
        render_dept_config_page(dfs)
    elif asset_menu == "신규 입사자 관리":
        render_new_hire_page(dfs)
    elif asset_menu == "PC/노트북 (Lease)":
        render_lease_page(dfs)
    elif asset_menu == "아이패드 (iPad)":
        render_ipad_page(dfs)
    elif asset_menu == "퇴사자 관리 (Resign)":
        render_resign_page(dfs)
    else:
        render_common_page(dfs, asset_menu)

# ==========================================
# 📦 소모품 관리 모듈
# ==========================================
else:
    st.sidebar.markdown("---")
    st.sidebar.subheader("📑 메뉴 선택")
    consumables_menu = st.sidebar.radio(
        "소모품 관리 메뉴",
        [
            "출고 내역 등록",
            "월별 견적 및 내역 관리",
            "품목 리스트 관리",
            "필수 품목 현황(대시보드)",
        ],
        key="consumables_menu"
    )

    st.sidebar.markdown("---")
    with st.sidebar.expander("🔧 시스템 상태", expanded=False):
        if os.path.exists(ASSET_DB_FILE):
            _, status = get_users_detailed()
            if status == "SUCCESS":
                st.success("사용자 DB 연결됨")
            else:
                st.error("사용자 DB 오류")
        else:
            st.error("사용자 DB 없음")

    if consumables_menu == "출고 내역 등록":
        show_outbound_page()
    elif consumables_menu == "월별 견적 및 내역 관리":
        show_report_page()
    elif consumables_menu == "품목 리스트 관리":
        show_items_page()
    elif consumables_menu == "필수 품목 현황(대시보드)":
        show_consumables_dashboard()
