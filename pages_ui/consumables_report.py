import streamlit as st
import pandas as pd
import datetime
from common.database import get_connection
from common.utils import generate_internal_excel


def show_report_page():
    st.header("🧾 견적 및 내역 조회/출력")
    st.markdown(
        "견적 기준 월 또는 특정 날짜 기간으로 데이터를 검색하여 내역서를 생성합니다."
    )

    search_type = st.radio(
        "검색 기준 선택",
        ["📅 견적 기준 연/월 검색", "📆 날짜 기간(Range) 검색"],
        horizontal=True,
    )
    conn = get_connection()
    df_out = pd.DataFrame()
    today = datetime.date.today()

    if search_type == "📅 견적 기준 연/월 검색":
        c1, c2 = st.columns(2)
        with c1:
            s_year = st.number_input("조회 연도", 2020, 2030, today.year)
        with c2:
            s_month = st.number_input("조회 월", 1, 12, today.month)

        query = "SELECT * FROM outbound WHERE estimate_year=? AND estimate_month=?"
        df_out = pd.read_sql(query, conn, params=(s_year, s_month))
        search_info_text = f"{s_year}년 {s_month}월 견적분"
    else:
        c1, c2 = st.columns(2)
        with c1:
            start_date = st.date_input(
                "시작일", datetime.date(today.year, today.month, 1)
            )
        with c2:
            end_date = st.date_input("종료일", today)

        if start_date > end_date:
            st.error("시작일 오류")
        else:
            query = "SELECT * FROM outbound WHERE date >= ? AND date <= ?"
            df_out = pd.read_sql(query, conn, params=(start_date, end_date))
        search_info_text = f"{start_date} ~ {end_date} 기간 내역"

    if df_out.empty:
        st.warning(f"⚠️ {search_info_text}에 해당하는 내역이 없습니다.")
    else:
        # 데이터 집계 로직
        df_items = pd.read_sql("SELECT item_name, category FROM items", conn)
        df_items = df_items.drop_duplicates(subset=["item_name"], keep="last")

        grouped_rows = []
        for item_name, group in df_out.groupby("item_name"):
            total_qty = group["quantity"].sum()
            total_price = group["total_price"].sum()
            unit_price = group["unit_price"].max()

            # 사용자별 수량 집계 (이름(수량) 로직)
            user_qty_map = group.groupby("user_name")["quantity"].sum()
            user_strings = []
            for user, qty in user_qty_map.items():
                if not user:
                    continue
                # 수량이 2개 이상이면 (N) 표기
                txt = f"{user}({qty})" if qty > 1 else f"{user}"
                user_strings.append(txt)

            user_list_str = ", ".join(sorted(user_strings))

            grouped_rows.append(
                {
                    "item_name": item_name,
                    "quantity": total_qty,
                    "unit_price": unit_price,
                    "total_price": total_price,
                    "user_list": user_list_str,
                }
            )

        final_df = pd.DataFrame(grouped_rows)
        final_df = pd.merge(final_df, df_items, on="item_name", how="left")
        final_df["category"] = final_df["category"].fillna("기타")

        # NO 컬럼 추가 (1부터 시작)
        final_df.reset_index(drop=True, inplace=True)
        final_df.index = final_df.index + 1
        final_df.insert(0, "NO", final_df.index)

        # 컬럼 순서
        final_df = final_df[
            [
                "NO",
                "category",
                "item_name",
                "quantity",
                "unit_price",
                "total_price",
                "user_list",
            ]
        ]

        st.divider()

        # 상단 정보 (견적번호, 총액 등)
        est_no = f"No : {today.strftime('%Y%m%d')}-51"
        total_amt = int(final_df["total_price"].sum())
        total_qty = int(final_df["quantity"].sum())

        h_col1, h_col2 = st.columns([2, 1])
        with h_col1:
            st.subheader(f"📊 검색 결과: {search_info_text}")
        with h_col2:
            st.markdown(
                f"""
                <div style="text-align: right; font-size: 15px; line-height: 1.6; padding: 10px; background-color: #f0f2f6; border-radius: 8px;">
                    <span style="color: #666; font-weight: bold;">{est_no}</span><br>
                    <span style="color: #333; font-weight: bold;">수량 : {total_qty:,} EA</span><br>
                    <span style="color: #d63384; font-weight: bold; font-size: 18px;">견적총액 : {total_amt:,} 원</span>
                </div>
            """,
                unsafe_allow_html=True,
            )

        st.dataframe(final_df, use_container_width=True, hide_index=True)

        # 엑셀 다운로드 (내부용만 유지)
        excel_data = generate_internal_excel(
            final_df, df_out, search_info_text, est_no, total_qty, total_amt
        )
        st.download_button(
            label="📊 내부용 상세 내역 다운로드 (Excel)",
            data=excel_data,
            file_name=f"상세내역_{today.strftime('%Y%m%d')}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    conn.close()
