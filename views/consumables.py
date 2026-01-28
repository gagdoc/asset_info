# views/consumables.py
import streamlit as st
import pandas as pd
from datetime import datetime
from common.utils import update_db, render_file_uploader


def render_consumables_page(dfs):
    st.title("📦 소모품 입출고/결산 관리")

    # 데이터 로드
    log_key = "Consumables_Log"
    list_key = "Consumables_List"

    df_log = dfs.get(
        log_key,
        pd.DataFrame(
            columns=[
                "Date",
                "Type",
                "User_Name",
                "User_Email",
                "Category",
                "Item",
                "Qty",
                "Price",
                "Total_Cost",
                "Note",
            ]
        ),
    )
    df_list = dfs.get(list_key, pd.DataFrame(columns=["분류", "품목", "가격"]))

    # 탭 구성
    tab1, tab2, tab3 = st.tabs(
        ["📝 입출고 등록", "📊 월별/누적 결산", "🛠 품목 리스트 관리"]
    )

    # ---------------------------------------------------------
    # TAB 1: 입출고 등록
    # ---------------------------------------------------------
    with tab1:
        st.subheader("신규 내역 등록")

        col1, col2 = st.columns(2)
        with col1:
            input_date = st.date_input("날짜", datetime.now())
            input_type = st.radio("구분", ["출고(지급)", "입고(구매)"], horizontal=True)

        with col2:
            # 사용자 선택 (DB 연동 + 직접 입력)
            user_options = (
                ["직접 입력"] + dfs["All_User"]["email"].tolist()
                if "email" in dfs["All_User"].columns
                else ["직접 입력"]
            )
            selected_user_email = st.selectbox("사용자 선택 (Email)", user_options)

            input_user_name = ""
            input_user_email = ""

            if selected_user_email == "직접 입력":
                input_user_name = st.text_input("사용자 이름 (직접 입력)")
                input_user_email = st.text_input("이메일 (직접 입력, 선택사항)")
            else:
                input_user_email = selected_user_email
                # 이름 찾기
                user_row = dfs["All_User"][
                    dfs["All_User"]["email"] == selected_user_email
                ]
                if not user_row.empty:
                    # NAME 혹은 이름 컬럼 찾기
                    name_col = (
                        "NAME"
                        if "NAME" in user_row.columns
                        else ("이름" if "이름" in user_row.columns else None)
                    )
                    if name_col:
                        input_user_name = user_row.iloc[0][name_col]
                st.info(f"선택된 사용자: {input_user_name}")

        st.divider()

        # 품목 선택
        if df_list.empty:
            st.warning(
                "품목 리스트가 없습니다. '품목 리스트 관리' 탭에서 엑셀을 업로드하거나 데이터를 추가해주세요."
            )
        else:
            # 분류 선택
            categories = df_list["분류"].unique().tolist()
            selected_category = st.selectbox("분류 선택", categories)

            # 품목 선택 (분류에 맞는 것만)
            items_in_cat = df_list[df_list["분류"] == selected_category]
            item_options = items_in_cat["품목"].unique().tolist()
            selected_item = st.selectbox("품목 선택", item_options)

            # 가격 자동 가져오기
            current_price = 0
            if selected_item:
                price_row = items_in_cat[items_in_cat["품목"] == selected_item]
                if not price_row.empty:
                    current_price = price_row.iloc[0]["가격"]

            c1, c2, c3 = st.columns(3)
            input_qty = c1.number_input("수량", min_value=1, value=1)
            input_price = c2.number_input("단가 (자동 입력)", value=int(current_price))
            total_cost = input_qty * input_price
            c3.metric("총 금액", f"{total_cost:,} 원")

            input_note = st.text_input("비고")

            if st.button("등록하기", type="primary"):
                new_row = {
                    "Date": input_date,
                    "Type": input_type,
                    "User_Name": input_user_name,
                    "User_Email": input_user_email,
                    "Category": selected_category,
                    "Item": selected_item,
                    "Qty": input_qty,
                    "Price": input_price,
                    "Total_Cost": total_cost,
                    "Note": input_note,
                }
                # 날짜 형식 통일
                df_log = pd.concat([df_log, pd.DataFrame([new_row])], ignore_index=True)
                # Date 컬럼 datetime으로 변환
                df_log["Date"] = pd.to_datetime(df_log["Date"])

                update_db(log_key, df_log)
                st.success("등록되었습니다!")
                st.rerun()

    # ---------------------------------------------------------
    # TAB 2: 월별/누적 결산
    # ---------------------------------------------------------
    with tab2:
        st.subheader("📊 소모품 결산 리포트")

        if df_log.empty:
            st.info("데이터가 없습니다.")
        else:
            # 날짜 처리
            df_log["Date"] = pd.to_datetime(df_log["Date"])
            df_log["Year"] = df_log["Date"].dt.year
            df_log["Month"] = df_log["Date"].dt.month

            # 필터
            col1, col2 = st.columns(2)
            years = sorted(df_log["Year"].unique())
            selected_year = col1.selectbox("년도 선택", years, index=len(years) - 1)

            months_in_year = sorted(
                df_log[df_log["Year"] == selected_year]["Month"].unique()
            )
            selected_month = col2.selectbox(
                "월 선택 (전체 보기는 선택 안함)", ["전체"] + months_in_year
            )

            # 데이터 필터링
            filtered_df = df_log[df_log["Year"] == selected_year]
            if selected_month != "전체":
                filtered_df = filtered_df[filtered_df["Month"] == selected_month]

            # 통계 표시
            st.divider()
            total_sum = filtered_df[filtered_df["Type"] == "출고(지급)"][
                "Total_Cost"
            ].sum()
            purchase_sum = filtered_df[filtered_df["Type"] == "입고(구매)"][
                "Total_Cost"
            ].sum()

            m1, m2, m3 = st.columns(3)
            m1.metric("총 출고(사용) 금액", f"{total_sum:,} 원")
            m2.metric("총 입고(구매) 금액", f"{purchase_sum:,} 원")
            m3.metric("내역 건수", f"{len(filtered_df)} 건")

            # 상세 표
            st.write("### 상세 내역")
            # 보기 좋게 컬럼 정리
            display_cols = [
                "Date",
                "Type",
                "Category",
                "Item",
                "User_Name",
                "Qty",
                "Price",
                "Total_Cost",
                "Note",
            ]
            # 날짜 포맷
            filtered_show = filtered_df.copy()
            filtered_show["Date"] = filtered_show["Date"].dt.strftime("%Y-%m-%d")
            st.dataframe(filtered_show[display_cols], use_container_width=True)

            # 다운로드
            st.download_button(
                "📥 현재 조회 내역 다운로드 (CSV)",
                filtered_show.to_csv(index=False).encode("utf-8-sig"),
                f"consumable_report_{selected_year}_{selected_month}.csv",
            )

    # ---------------------------------------------------------
    # TAB 3: 품목 리스트 관리
    # ---------------------------------------------------------
    with tab3:
        st.subheader("🛠 품목 기초 데이터 관리")
        st.info("여기서 등록한 품목과 가격이 '입출고 등록' 탭의 선택지에 나타납니다.")

        # 편집기
        edited_list = st.data_editor(
            df_list,
            num_rows="dynamic",
            use_container_width=True,
            key="consumable_list_editor",
        )

        if st.button("💾 품목 리스트 저장", key="save_consumable_list"):
            update_db(list_key, edited_list)
            st.success("저장 완료!")
            st.rerun()

        st.divider()
        st.markdown("#### 📂 엑셀 일괄 업로드")
        st.caption(
            "컬럼명: '분류', '품목', '가격' 이 포함된 CSV/Excel 파일을 업로드하세요."
        )
        render_file_uploader(list_key, df_list)
