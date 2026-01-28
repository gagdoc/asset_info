import streamlit as st
from common.utils import update_db, render_file_uploader


def show_editor_and_save(
    data_key,
    df,
    display_cols=None,
    column_config=None,
    editor_key=None,
    save_label="💾 저장",
):
    """공통 데이터 에디터 표시 및 저장 처리

    - data_key: DB 키
    - df: 원본 DataFrame
    - display_cols: 표시할 컬럼 리스트 (None이면 전체)
    - column_config: Streamlit column_config 사전
    - editor_key: st.data_editor 키
    - save_label: 저장 버튼 레이블
    반환: edited_df (사용자가 편집한 DataFrame)
    """
    disp_df = df if display_cols is None else df[display_cols]
    key = editor_key or f"edit_{data_key}"
    edited_df = st.data_editor(
        disp_df,
        num_rows="dynamic",
        use_container_width=True,
        column_config=column_config,
        key=key,
    )

    if st.button(save_label, key=f"save_{data_key}"):
        update_db(data_key, edited_df)
        st.rerun()

    return edited_df


def download_and_upload(data_key, df):
    """간단한 다운로드/업로드 UI 래퍼"""
    render_file_uploader(data_key, df)
