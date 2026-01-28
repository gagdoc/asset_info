import streamlit as st
import pandas as pd
import datetime
from common.database import get_connection, get_users_detailed


def show_outbound_page():
    st.header("1. 신규 출고 등록")
    st.info("실제 출고일과 별개로 **견적서에 포함될 기준 연/월**을 지정할 수 있습니다.")

    with st.container(border=True):
        col_date, col_est_y, col_est_m = st.columns([2, 1, 1])
        with col_date:
            out_date = st.date_input("📅 실제 출고일", datetime.date.today())

        today = datetime.date.today()
        with col_est_y:
            est_year = st.number_input("입력용 연도", 2020, 2030, value=today.year)
        with col_est_m:
            est_month = st.number_input("입력용 월", 1, 12, value=today.month)

        st.divider()
        col1, col2 = st.columns(2)

        # 품목 선택
        with col1:
            st.subheader("📦 품목 선택")
            conn = get_connection()
            df_all = pd.read_sql(
                "SELECT * FROM items ORDER BY year DESC, month DESC", conn
            )
            conn.close()

            selected_item = None
            if not df_all.empty:
                df_unique = df_all.drop_duplicates(subset=["item_name"], keep="first")
                item_search = st.text_input(
                    "🔍 품목 검색 (Enter)", placeholder="품목명/분류 검색"
                )

                filtered_items = df_unique
                if item_search:
                    mask = df_unique["item_name"].str.contains(
                        item_search, case=False, na=False
                    ) | df_unique["category"].str.contains(
                        item_search, case=False, na=False
                    )
                    filtered_items = df_unique[mask]

                item_options = filtered_items["item_name"].tolist()
                if item_options:
                    selected_item = st.selectbox("품목 선택", item_options)
                    if selected_item:
                        info = df_unique[df_unique["item_name"] == selected_item].iloc[
                            0
                        ]
                        st.caption(
                            f"✅ 분류: {info['category']} | 단가: {info['unit_price']:,}원"
                        )
                else:
                    st.warning("검색 결과가 없습니다.")
            else:
                st.error("등록된 품목이 없습니다.")

            qty = st.number_input("수량", min_value=1, value=1)

        # 사용자 선택
        with col2:
            st.subheader("👤 사용자 선택")
            df_users, status = get_users_detailed()
            final_user_val = ""

            input_mode = st.radio(
                "입력 방식", ["DB 검색", "직접 입력"], horizontal=True
            )
            if input_mode == "DB 검색" and status == "SUCCESS":
                u_search = st.text_input("🔍 사용자 검색", placeholder="이름/이메일 등")
                if u_search:
                    mask = (
                        df_users.astype(str)
                        .apply(lambda x: x.str.contains(u_search, case=False))
                        .any(axis=1)
                    )
                    search_res = df_users[mask]
                else:
                    search_res = df_users.head(100)

                if not search_res.empty:
                    opts = {}
                    for _, r in search_res.iterrows():
                        label = f"{r['EngName']} | {r['KorName']} | {r['Email']}"
                        val = (
                            str(r["Email"]).split("@")[0].replace(".", " ")
                            if r["Email"]
                            else r["EngName"]
                        )
                        opts[label] = val

                    sel = st.selectbox("사용자 결과", list(opts.keys()))
                    if sel:
                        final_user_val = opts[sel]
                        st.caption(f"📝 저장값: **{final_user_val}**")
                else:
                    st.warning("결과 없음")
            else:
                final_user_val = st.text_input("사용자명 입력")

        st.divider()
        _, btn_col, _ = st.columns([1, 2, 1])
        with btn_col:
            if st.button(
                "🚀 출고 등록 (저장)", type="primary", use_container_width=True
            ):
                if not selected_item or not final_user_val:
                    st.error("품목과 사용자를 모두 입력해주세요.")
                else:
                    p_row = df_unique[df_unique["item_name"] == selected_item].iloc[0]
                    u_price = int(p_row["unit_price"])
                    total = u_price * qty

                    conn = get_connection()
                    cur = conn.cursor()
                    cur.execute(
                        """
                        INSERT INTO outbound (date, year, month, estimate_year, estimate_month, item_name, quantity, unit_price, total_price, user_name) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                        (
                            out_date,
                            out_date.year,
                            out_date.month,
                            est_year,
                            est_month,
                            selected_item,
                            qty,
                            u_price,
                            total,
                            final_user_val,
                        ),
                    )
                    conn.commit()
                    conn.close()
                    st.success(f"✅ 저장 완료! (견적기준: {est_year}년 {est_month}월)")

    # ---------------------------------------------------------
    # 최근 내역 편집기
    # ---------------------------------------------------------
    st.divider()
    st.header("2. 최근 출고 현황 (수정/삭제/검수)")

    conn = get_connection()
    search_text = st.text_input("🔍 현황 내 검색", placeholder="검색어 입력")
    df_history = pd.read_sql(
        "SELECT * FROM outbound ORDER BY date DESC LIMIT 100", conn
    )

    if not df_history.empty:
        df_history["date"] = pd.to_datetime(df_history["date"])
        if search_text:
            m = (
                df_history.astype(str)
                .apply(lambda x: x.str.contains(search_text, case=False))
                .any(axis=1)
            )
            df_history = df_history[m]

        all_item_names = (
            df_unique["item_name"].tolist() if "df_unique" in locals() else []
        )

        edited_df = st.data_editor(
            df_history,
            column_config={
                "id": None,  # [수정 3] ID 열 숨김
                "date": st.column_config.DateColumn("실제 출고일", format="YYYY-MM-DD"),
                "estimate_year": st.column_config.NumberColumn(
                    "견적 연도", required=True
                ),
                "estimate_month": st.column_config.NumberColumn(
                    "견적 월", required=True
                ),
                "item_name": st.column_config.SelectboxColumn(
                    "품목명", options=all_item_names, required=True
                ),
                "quantity": st.column_config.NumberColumn("수량", min_value=1),
                "unit_price": st.column_config.NumberColumn("단가", disabled=True),
                "total_price": st.column_config.NumberColumn("총액", disabled=True),
                "user_name": st.column_config.TextColumn("사용자"),
                "year": None,
                "month": None,
                "department": None,
            },
            use_container_width=True,
            num_rows="dynamic",
            key="history_editor",
        )

        if st.button("수정사항 저장하기 (DB 반영)"):
            try:
                cur = conn.cursor()
                current_ids = [
                    row["id"] for _, row in edited_df.iterrows() if row.get("id")
                ]
                original_ids = df_history["id"].tolist()

                # 삭제
                for oid in original_ids:
                    if oid not in current_ids:
                        cur.execute("DELETE FROM outbound WHERE id=?", (oid,))

                # 수정
                for _, row in edited_df.iterrows():
                    if row.get("id") in current_ids:
                        price_query = cur.execute(
                            "SELECT unit_price FROM items WHERE item_name=? LIMIT 1",
                            (row["item_name"],),
                        )
                        res = price_query.fetchone()
                        new_price = res[0] if res else row["unit_price"]
                        new_total = new_price * row["quantity"]
                        d = pd.to_datetime(row["date"])

                        cur.execute(
                            """
                            UPDATE outbound SET date=?, year=?, month=?, estimate_year=?, estimate_month=?, item_name=?, quantity=?, unit_price=?, total_price=?, user_name=?
                            WHERE id=?
                        """,
                            (
                                d.strftime("%Y-%m-%d"),
                                d.year,
                                d.month,
                                row["estimate_year"],
                                row["estimate_month"],
                                row["item_name"],
                                row["quantity"],
                                new_price,
                                new_total,
                                row["user_name"],
                                row["id"],
                            ),
                        )

                conn.commit()
                st.success("✅ 변경사항이 반영되었습니다.")
                st.rerun()
            except Exception as e:
                st.error(f"오류: {e}")
    else:
        st.info("데이터가 없습니다.")
    conn.close()
