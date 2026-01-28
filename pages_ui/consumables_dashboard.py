import streamlit as st
import pandas as pd
from common.database import get_connection


def show_dashboard_page():
    st.header("🚨 필수 품목 재고 현황")

    conn = get_connection()

    # ---------------------------------------------------------
    # 1. 데이터 가져오기
    # ---------------------------------------------------------
    master_query = """
        SELECT id, item_name, category, current_qty, fixed_qty 
        FROM items 
        WHERE is_essential = 1
        ORDER BY category, item_name
    """
    df_essential = pd.read_sql(master_query, conn)

    # 출고량 계산
    out_query = (
        "SELECT item_name, SUM(quantity) as used_qty FROM outbound GROUP BY item_name"
    )
    df_used = pd.read_sql(out_query, conn)

    # ---------------------------------------------------------
    # 2. 데이터 병합 및 가공
    # ---------------------------------------------------------
    if not df_essential.empty:
        merged = pd.merge(df_essential, df_used, on="item_name", how="left").fillna(0)
        merged["remaining"] = merged["current_qty"] - merged["used_qty"]
        merged["delete_check"] = False

        # [수정 1] 순번(NO) 컬럼 명확하게 생성 (1부터 시작)
        merged = merged.reset_index(drop=True)  # 인덱스 초기화
        merged["NO"] = merged.index + 1  # 1부터 번호 매기기

        # 컬럼 순서 재배치 (NO를 맨 앞으로)
        cols = [
            "NO",
            "id",
            "category",
            "item_name",
            "current_qty",
            "fixed_qty",
            "used_qty",
            "remaining",
            "delete_check",
        ]
        merged = merged[cols]
    else:
        merged = pd.DataFrame()

    # ---------------------------------------------------------
    # 3. 재고 부족 알림 (상단 리스트)
    # ---------------------------------------------------------
    if not merged.empty:
        low_stock_df = merged[merged["remaining"] <= merged["fixed_qty"]].copy()

        if not low_stock_df.empty:
            st.warning(f"⚠️ 관리 품목 중 {len(low_stock_df)}개가 고정 수량 이하입니다.")

            def highlight_low_stock(row):
                return [
                    "background-color: #FFD580; color: black; font-weight: bold;"
                ] * len(row)

            st.markdown("##### 🔸 재고 부족 품목 리스트")
            st.dataframe(
                low_stock_df[
                    ["category", "item_name", "remaining", "fixed_qty"]
                ].style.apply(highlight_low_stock, axis=1),
                column_config={
                    "category": "분류",
                    "item_name": "품목명",
                    "remaining": st.column_config.NumberColumn(
                        "현재 잔여", format="%d"
                    ),
                    "fixed_qty": st.column_config.NumberColumn(
                        "고정 수량", format="%d"
                    ),
                },
                use_container_width=True,
                hide_index=True,
            )
        else:
            st.success("✅ 관리 중인 모든 품목의 재고가 충분합니다.")
    else:
        st.info(
            "현재 관리 중인 품목이 없습니다. 아래 '품목별 수량 간편 설정'에서 관리할 품목을 등록해주세요."
        )

    st.divider()

    # ---------------------------------------------------------
    # 4. 재고 관리 품목 (메인 리스트)
    # ---------------------------------------------------------
    # [수정 2] 제목 옆에 총 수량 표시 (f-string 사용)
    total_count = len(merged)
    st.subheader(f"📋 재고 관리 품목 (총 {total_count}개)")
    st.caption(
        "수량을 수정하거나, **'삭제'**를 체크하고 저장하면 관리 목록에서 제외됩니다."
    )

    if not merged.empty:
        edited_df = st.data_editor(
            merged,
            column_config={
                "NO": st.column_config.NumberColumn(
                    "No.", disabled=True, format="%d", width="small"
                ),  # [수정 1] 순번 표시
                "id": None,  # ID 숨김
                "category": st.column_config.TextColumn("분류", disabled=True),
                "item_name": st.column_config.TextColumn("품목명", disabled=True),
                "current_qty": st.column_config.NumberColumn(
                    "재고 수량", min_value=0, format="%d", required=True
                ),
                "fixed_qty": st.column_config.NumberColumn(
                    "고정 수량", min_value=0, format="%d", required=True
                ),
                "used_qty": st.column_config.NumberColumn(
                    "총 출고량", disabled=True, format="%d"
                ),
                "remaining": st.column_config.NumberColumn(
                    "계산된 잔여량", disabled=True, format="%d"
                ),
                "delete_check": st.column_config.CheckboxColumn(
                    "삭제", help="체크 시 관리 목록에서 제외됩니다."
                ),
            },
            use_container_width=True,
            hide_index=True,
            num_rows="dynamic",
            key="dashboard_editor",
        )

        if st.button("💾 변경사항 저장 (수정 및 삭제 실행)"):
            try:
                cur = conn.cursor()
                removed_count = 0
                updated_count = 0

                for _, row in edited_df.iterrows():
                    if pd.notna(row["id"]):
                        if row["delete_check"] is True:
                            cur.execute(
                                "UPDATE items SET is_essential=0 WHERE id=?",
                                (row["id"],),
                            )
                            removed_count += 1
                        else:
                            cur.execute(
                                "UPDATE items SET current_qty=?, fixed_qty=? WHERE id=?",
                                (row["current_qty"], row["fixed_qty"], row["id"]),
                            )
                            updated_count += 1

                conn.commit()

                msg = []
                if updated_count > 0:
                    msg.append(f"{updated_count}건 수정")
                if removed_count > 0:
                    msg.append(f"{removed_count}건 관리 해제")

                st.success(f"✅ 처리 완료: {', '.join(msg)}")
                st.rerun()
            except Exception as e:
                st.error(f"저장 중 오류 발생: {e}")
    else:
        st.write("관리 목록이 비어있습니다.")

    # ---------------------------------------------------------
    # 5. 하단: 관리 품목 등록 (간편 설정)
    # ---------------------------------------------------------
    st.divider()
    with st.expander("➕ 품목별 수량 간편 설정 (관리 품목 등록)", expanded=True):
        df_all = pd.read_sql(
            "SELECT DISTINCT item_name FROM items ORDER BY item_name", conn
        )

        with st.form("quick_setup"):
            st.info(
                "전체 DB 품목 중 관리할 품목을 선택하고 수량을 입력하면 위 리스트에 등록됩니다."
            )
            c1, c2, c3 = st.columns(3)
            with c1:
                target_item = st.selectbox(
                    "품목 검색 (전체 DB)", df_all["item_name"].tolist()
                )
            with c2:
                val_curr = st.number_input("재고 수량 설정", min_value=0, value=0)
            with c3:
                val_fix = st.number_input("고정 수량 설정", min_value=0, value=5)

            if st.form_submit_button("설정 및 등록"):
                cur = conn.cursor()
                cur.execute(
                    "UPDATE items SET current_qty=?, fixed_qty=?, is_essential=1 WHERE item_name=?",
                    (val_curr, val_fix, target_item),
                )
                conn.commit()
                st.success(f"✅ [{target_item}] 관리 품목으로 등록되었습니다.")
                st.rerun()

    conn.close()
