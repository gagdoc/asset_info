import streamlit as st
import pandas as pd
from common.utils import update_db, render_file_uploader


def render_common_page(dfs, menu_name):
    # Teams, Monitor, Printer 등 공통 로직을 처리하는 함수입니다.
    page_map = {
        "팀즈 번호 (Teams)": ("Teams", "팀즈 번호"),
        "모니터 (Monitor)": ("Monitor", "모니터"),
        "프린터 (Printer)": ("Printer", "프린터"),
    }

    # 메뉴 이름으로 데이터 키와 제목을 찾습니다.
    if menu_name in page_map:
        data_key, title = page_map[menu_name]
    else:
        st.error(f"알 수 없는 메뉴입니다: {menu_name}")
        return

    st.title(f"🛠 {title} 관리")
    df = dfs[data_key]

    tab1, tab2 = st.tabs(["📝 리스트 편집", "📂 파일 등록"])

    with tab1:
        edited_df = st.data_editor(
            df, num_rows="dynamic", use_container_width=True, key=f"edit_{data_key}"
        )

        if st.button(f"💾 {title} 저장", key=f"save_{data_key}"):
            update_db(data_key, edited_df)
            st.rerun()

    with tab2:
        render_file_uploader(data_key, df)
