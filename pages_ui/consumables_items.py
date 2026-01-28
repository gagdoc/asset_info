import streamlit as st
import pandas as pd
import datetime
import io
from common.database import get_connection


def show_items_page():
    st.header("📋 품목 리스트 관리")
    conn = get_connection()

    # 데이터 가져오기
    df_items = pd.read_sql("SELECT * FROM items ORDER BY year DESC, month DESC", conn)

    # [수정 1] 순번(NO) 컬럼 생성 및 컬럼 순서 재배치
    if not df_items.empty:
        df_items.reset_index(drop=True, inplace=True)
        df_items.index = df_items.index + 1
        df_items["NO"] = df_items.index

        # NO를 맨 앞으로 보내기 위해 컬럼 리스트 재구성
        cols = df_items.columns.tolist()
        cols = ["NO"] + [c for c in cols if c != "NO"]
        df_items = df_items[cols]
    else:
        # 데이터가 없을 경우 빈 DataFrame에 NO 컬럼 추가
        df_items["NO"] = []

    # 카테고리 설정
    default_cats = [
        "사무용품",
        "PC부품",
        "주변기기",
        "소프트웨어",
        "기타",
        "Mouse",
        "Keyboard",
        "Monitor",
        "Cable",
    ]
    db_cats = (
        df_items["category"].unique().tolist()
        if not df_items.empty and "category" in df_items.columns
        else []
    )
    final_cats = sorted(list(set(default_cats + db_cats)))

    # [수정 2] 제목 옆에 총 수량 표시
    total_count = len(df_items)
    st.markdown(
        f"##### 📌 전체 등록 품목 (재고/고정수량 관리) - <span style='color:blue'>총 {total_count}개</span>",
        unsafe_allow_html=True,
    )

    # 데이터 에디터 설정
    edited_master = st.data_editor(
        df_items,
        column_config={
            "NO": st.column_config.NumberColumn(
                "No.", width="small", disabled=True, format="%d"
            ),  # [수정 1] 순번 표시
            "id": None,  # 숨김
            "year": st.column_config.NumberColumn("연도"),
            "month": st.column_config.NumberColumn("월"),
            "category": st.column_config.SelectboxColumn(
                "분류", options=final_cats, required=True
            ),
            "item_name": st.column_config.TextColumn("품목명", required=True),
            "unit_price": st.column_config.NumberColumn("단가", format="%d원"),
            "current_qty": st.column_config.NumberColumn(
                "재고 수량(초기)", min_value=0, format="%d"
            ),
            "fixed_qty": st.column_config.NumberColumn(
                "고정 수량(알림)", min_value=0, format="%d"
            ),
            "is_essential": None,  # 숨김
        },
        use_container_width=True,
        hide_index=True,
        num_rows="dynamic",
        key="master_editor",
    )

    if st.button("리스트 수정사항 저장"):
        try:
            cur = conn.cursor()
            current_ids = [
                row["id"] for _, row in edited_master.iterrows() if pd.notna(row["id"])
            ]
            original_ids = df_items["id"].tolist() if "id" in df_items.columns else []

            # 삭제 로직
            for oid in original_ids:
                if oid not in current_ids:
                    cur.execute("DELETE FROM items WHERE id=?", (oid,))

            # 수정/추가 로직
            for _, row in edited_master.iterrows():
                if not row["item_name"]:
                    continue

                c_qty = int(row["current_qty"]) if pd.notnull(row["current_qty"]) else 0
                f_qty = int(row["fixed_qty"]) if pd.notnull(row["fixed_qty"]) else 0

                if pd.isna(row["id"]):
                    cur.execute(
                        """
                        INSERT INTO items (year, month, category, item_name, unit_price, current_qty, fixed_qty) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (
                            row["year"],
                            row["month"],
                            row["category"],
                            row["item_name"],
                            row["unit_price"],
                            c_qty,
                            f_qty,
                        ),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE items SET year=?, month=?, category=?, item_name=?, unit_price=?, current_qty=?, fixed_qty=? 
                        WHERE id=?""",
                        (
                            row["year"],
                            row["month"],
                            row["category"],
                            row["item_name"],
                            row["unit_price"],
                            c_qty,
                            f_qty,
                            row["id"],
                        ),
                    )
            conn.commit()
            st.success("✅ 저장 완료")
            st.rerun()
        except Exception as e:
            st.error(f"오류: {e}")

    st.divider()

    # 품목 개별 추가 폼
    st.subheader("➕ 품목 개별 추가")
    with st.form("add_single_item"):
        c1, c2, c3 = st.columns([1, 1, 2])
        with c1:
            in_year = st.number_input("연도", value=datetime.date.today().year)
        with c2:
            in_month = st.number_input(
                "월", value=datetime.date.today().month, min_value=1, max_value=12
            )
        with c3:
            in_cat_select = st.selectbox("분류 (기존)", final_cats)
            in_cat_manual = st.text_input("➕ 새 분류 직접 입력")

        c4, c5, c6, c7 = st.columns([2, 1, 1, 1])
        with c4:
            in_name = st.text_input("품목명")
        with c5:
            in_price = st.number_input("단가", min_value=0, step=100)
        with c6:
            in_curr_qty = st.number_input("재고 수량(초기)", min_value=0, value=0)
        with c7:
            in_fix_qty = st.number_input("고정 수량(알림)", min_value=0, value=0)

        if st.form_submit_button("추가하기"):
            if in_name:
                cat = in_cat_manual.strip() if in_cat_manual.strip() else in_cat_select
                try:
                    cur = conn.cursor()
                    cur.execute(
                        "SELECT id FROM items WHERE year=? AND month=? AND item_name=?",
                        (in_year, in_month, in_name),
                    )
                    if cur.fetchone():
                        cur.execute(
                            """
                            UPDATE items SET category=?, unit_price=?, current_qty=?, fixed_qty=? 
                            WHERE year=? AND month=? AND item_name=?""",
                            (
                                cat,
                                in_price,
                                in_curr_qty,
                                in_fix_qty,
                                in_year,
                                in_month,
                                in_name,
                            ),
                        )
                        msg = "✅ 정보가 업데이트되었습니다."
                    else:
                        cur.execute(
                            """
                            INSERT INTO items (year, month, category, item_name, unit_price, current_qty, fixed_qty) 
                            VALUES (?,?,?,?,?,?,?)""",
                            (
                                in_year,
                                in_month,
                                cat,
                                in_name,
                                in_price,
                                in_curr_qty,
                                in_fix_qty,
                            ),
                        )
                        msg = "✅ 신규 품목이 추가되었습니다."
                    conn.commit()
                    st.success(msg)
                    st.rerun()
                except Exception as e:
                    st.error(f"오류: {e}")
            else:
                st.warning("품목명을 입력하세요")

    st.divider()

    # 엑셀 파일 업로드 및 샘플 다운로드
    with st.expander("📂 엑셀 파일로 일괄 업로드", expanded=False):
        st.info("아래 샘플 양식을 다운로드하여 내용을 작성한 후 업로드해주세요.")

        # 샘플 데이터 생성
        sample_data = {
            "year": [2024, 2024],
            "month": [1, 1],
            "분류": ["Mouse", "Keyboard"],
            "품목": ["Logitech M185", "Logitech K120"],
            "가격": [15000, 12000],
            "재고수량": [10, 20],
            "고정수량": [5, 5],
        }
        df_sample = pd.DataFrame(sample_data)

        # 엑셀 변환
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine="xlsxwriter") as writer:
            df_sample.to_excel(writer, index=False)

        st.download_button(
            label="📥 업로드용 샘플 양식 다운로드",
            data=buffer.getvalue(),
            file_name="품목등록_샘플양식.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        st.markdown("---")

        uploaded_file = st.file_uploader("엑셀 파일 선택", type=["xlsx", "xls"])
        if uploaded_file and st.button("엑셀 데이터 등록하기"):
            try:
                df = pd.read_excel(uploaded_file)
                df.columns = df.columns.str.strip()

                cur = conn.cursor()
                cnt = 0
                for _, row in df.iterrows():
                    c_qty = row.get("재고수량", 0)
                    f_qty = row.get("고정수량", 0)

                    if not all(
                        k in row for k in ["year", "month", "분류", "품목", "가격"]
                    ):
                        st.error(
                            "엑셀 파일 형식이 올바르지 않습니다. 샘플 양식을 확인해주세요."
                        )
                        break

                    cur.execute(
                        "SELECT id FROM items WHERE year=? AND month=? AND item_name=?",
                        (row["year"], row["month"], row["품목"]),
                    )
                    if cur.fetchone():
                        cur.execute(
                            """
                            UPDATE items SET category=?, unit_price=?, current_qty=?, fixed_qty=? 
                            WHERE year=? AND month=? AND item_name=?""",
                            (
                                row["분류"],
                                row["가격"],
                                c_qty,
                                f_qty,
                                row["year"],
                                row["month"],
                                row["품목"],
                            ),
                        )
                    else:
                        cur.execute(
                            """
                            INSERT INTO items (year, month, category, item_name, unit_price, current_qty, fixed_qty) 
                            VALUES (?,?,?,?,?,?,?)""",
                            (
                                row["year"],
                                row["month"],
                                row["분류"],
                                row["품목"],
                                row["가격"],
                                c_qty,
                                f_qty,
                            ),
                        )
                    cnt += 1
                conn.commit()
                st.success(f"✅ {cnt}건 처리 완료")
                st.rerun()
            except Exception as e:
                st.error(f"오류: {e}")
    conn.close()
