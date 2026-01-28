import streamlit as st
import pandas as pd
from common.utils import (
    update_db,
    load_from_db,
    get_unassigned_assets,
    sync_new_hire_list_to_all_user_smart,
    render_file_uploader,
    get_bu_role_mapping,
)
def render_new_hire_page(dfs):
    st.title("👋 신규 입사자 관리")
    st.info("신규 입사자 정보를 등록하고 보유 자산을 할당합니다.")

    data_key = "NewHire"
    df = dfs[data_key]

    tab1, tab2, tab3 = st.tabs(
        ["📝 신규 입사자 추가", "📋 기존 입사자 관리", "📂 파일 등록"]
    )

    # ========== TAB 1: 신규 입사자 추가 ==========
    with tab1:
        st.subheader("➕ 새로운 입사자 추가")

        # BU/ROLE 매핑 로드
        bu_role_map = get_bu_role_mapping(dfs)
        bu_list = sorted(list(bu_role_map.keys())) if bu_role_map else []
        
        # BU 목록이 없으면 경고 표시
        if not bu_list:
            st.warning("⚠️ Dept_Config에 BU 정보가 없습니다. 빈 값으로 진행하거나 대시보드에서 먼저 설정해주세요.")
            bu_list = [""]  # 빈 선택지 제공

        # 1단계: 기본 정보 입력
        st.write("**1단계: 기본 정보 입력**")
        col1, col2 = st.columns(2)
        with col1:
            new_name_ko = st.text_input("한글명 (필수)", key="new_name_ko")
        with col2:
            new_name_en = st.text_input("영문명 (선택)", key="new_name_en")

        new_email = st.text_input(
            "이메일 (필수, 예: name@company.com)", key="new_email"
        )

        st.write("---")

        # 2단계: BU/ROLE 선택
        st.write("**2단계: BU / ROLE 선택**")
        col1, col2 = st.columns(2)
        with col1:
            selected_bu = st.selectbox("BU 선택", options=bu_list, key="new_bu")
        with col2:
            if selected_bu and selected_bu != "":
                role_list = sorted(bu_role_map.get(selected_bu, []))
                if not role_list:
                    st.warning("선택한 BU에 ROLE이 없습니다.")
                    role_list = [""]
            else:
                role_list = [""]
            selected_role = st.selectbox("ROLE 선택", options=role_list, key="new_role")

        st.write("---")

        # 3단계: 자산 선택
        st.write("**3단계: 자산 할당**")
        st.info("할당되지 않은 자산들을 선택하여 이 입사자에게 할당합니다.")

        unassigned_assets = get_unassigned_assets()

        selected_assets = {}

        # 노트북, 아이패드, Teams는 기존 방식(할당되지 않은 항목에서 선택)
        if "노트북" in unassigned_assets:
            st.subheader("🏷️ 노트북")
            render_laptop_selection(
                unassigned_assets["노트북"].copy(), selected_assets, "노트북"
            )
        if "아이패드" in unassigned_assets:
            st.subheader("🏷️ 아이패드")
            render_ipad_selection(
                unassigned_assets["아이패드"].copy(), selected_assets, "아이패드"
            )
        if "Teams" in unassigned_assets:
            st.subheader("🏷️ Teams")
            render_teams_selection(
                unassigned_assets["Teams"].copy(), selected_assets, "Teams"
            )

        # 모니터와 복합기는 직접 입력하도록 변경
        st.subheader("🏷️ 모니터 (직접 입력)")
        monitor_input = st.text_input(
            "모니터 정보 (Model 또는 S/N 입력)", key="input_monitor"
        )

        st.subheader("🏷️ 복합기 (직접 입력)")
        printer_input = st.text_input(
            "복합기 정보 (Model 또는 추가정보 입력)", key="input_printer"
        )

        st.write("---")

        # 저장 버튼
        if st.button("✅ 신입사자 등록 및 자산 할당", key="save_new_hire"):
            # 유효성 검사
            if not new_name_ko or not new_email:
                st.error("❌ 한글명과 이메일은 필수입니다.")
            else:
                try:
                    # 신규 입사자 데이터 생성
                    new_hire_row = {
                        "NAME": new_name_en or new_name_ko,
                        "이름": new_name_ko,
                        "email": new_email.strip().lower(),
                        "ROLE": selected_role if selected_role else "",
                        "BU": selected_bu if selected_bu else "",
                        "모니터": monitor_input if monitor_input else "",
                        "복합기": printer_input if printer_input else "",
                    }

                    # 기존 NewHire 테이블에 신규 행 추가
                    new_df = pd.concat(
                        [df, pd.DataFrame([new_hire_row])], ignore_index=True
                    )
                    update_db(data_key, new_df)

                    # 신규 입사자를 대시보드(All_User)에 즉시 등록
                    try:
                        with st.spinner("대시보드에 등록 중..."):
                            added, updated_list, resigned_list = (
                                sync_new_hire_list_to_all_user_smart(
                                    pd.DataFrame([new_hire_row])
                                )
                            )
                        if added:
                            st.success(f"🔁 대시보드에 등록됨: {added}명")
                        if updated_list:
                            st.info(f"🔁 기존 항목 업데이트: {len(updated_list)}")
                        if resigned_list:
                            st.warning(f"⛔ 퇴사자로 차단된 항목: {len(resigned_list)}")
                    except Exception:
                        # 실패해도 프로세스는 계속
                        st.warning(
                            "대시보드 등록 중 일부 문제가 발생했습니다. 수동 동기화를 사용하세요."
                        )

                    # 선택된 자산들에 이메일 할당
                    if selected_assets:
                        asset_map = {
                            "노트북": "Lease",
                            "아이패드": "iPad",
                            "Teams": "Teams",
                        }

                        for asset_type, asset_idx in selected_assets.items():
                            table_key = asset_map.get(asset_type)
                            if not table_key:
                                continue
                            if table_key in dfs:
                                asset_table = dfs[table_key].copy()
                                if asset_idx in asset_table.index:
                                    asset_table.at[asset_idx, "email"] = (
                                        new_email.strip().lower()
                                    )
                                    update_db(table_key, asset_table)

                    st.success(
                        f"✅ {new_name_ko} 입사자가 등록되었습니다! ({len(selected_assets)}개 자산 할당)"
                    )
                    st.balloons()
                    st.rerun()

                except Exception as e:
                    st.error(f"❌ 오류 발생: {str(e)}")

    # ========== TAB 2: 기존 입사자 관리 ==========
    with tab2:
        st.subheader("📋 기존 입사자 목록")

        if df.empty:
            st.info("등록된 신규입사자가 없습니다.")
        else:
            # 전체 신입 목록 표시
            st.write(f"**총 {len(df)}명**")
            edited_df = st.data_editor(
                df, num_rows="dynamic", use_container_width=True, key="newhire_editor"
            )

            if st.button("💾 변경사항 저장", key="save_edit"):
                update_db(data_key, edited_df)
                st.success("✅ 저장 완료")
                st.rerun()

        st.divider()
        st.subheader("🔄 All_User로 동기화")
        if st.button("📤 선택된 입사자를 대시보드에 등록", key="sync_to_all_user"):
            with st.spinner("동기화 중..."):
                add, dup, res = sync_new_hire_list_to_all_user_smart(df)

            st.divider()
            c1, c2, c3 = st.columns(3)
            with c1:
                st.success(f"✅ 신규 등록: {add}명")
            with c2:
                if dup:
                    st.warning(f"⚠️ 중복 제외: {len(dup)}명")
                    for item in dup:
                        st.write(f"  • {item}")
                else:
                    st.info("중복 없음")
            with c3:
                if res:
                    st.error(f"⛔ 퇴사자 차단: {len(res)}명")
                    for item in res:
                        st.write(f"  • {item}")
                else:
                    st.info("퇴사자 없음")

    # ========== TAB 3: 파일 등록 ==========
    with tab3:
        render_file_uploader(data_key, df)


def render_laptop_selection(asset_df, selected_assets, asset_type):
    """노트북 선택: 모델별 그룹화 → 모델 선택 → 시리얼 & 정보 표시"""
    if asset_df.empty:
        st.info("할당 가능한 노트북이 없습니다.")
        return

    # 모델별로 그룹화
    model_groups = {}
    for asset_idx, row in asset_df.iterrows():
        model = str(row.get("Model", "Unknown"))
        if model not in model_groups:
            model_groups[model] = []
        model_groups[model].append((asset_idx, row))

    # 모델 선택
    models = sorted(list(model_groups.keys()))
    selected_model = st.selectbox(
        f"모델 선택", options=models, key=f"model_{asset_type}"
    )

    if selected_model:
        items = model_groups[selected_model]

        # 선택된 모델의 노트북 목록 표시
        st.write(f"**{selected_model}의 사용 가능한 노트북:**")

        option_list = []
        for asset_idx, row in items:
            sn = str(row.get("S/N", "N/A"))
            additional = str(row.get("Additional Information", ""))

            # 표시 텍스트
            display_text = f"S/N: {sn}"
            if additional and additional != "nan":
                display_text += f" | {additional}"

            option_list.append((display_text, asset_idx))

        option_texts = [text for text, _ in option_list]
        option_indices = [idx for _, idx in option_list]

        selected_laptop = st.radio(
            "노트북 선택",
            options=option_texts,
            key=f"radio_{asset_type}_{selected_model}",
        )

        if selected_laptop:
            selected_idx = option_indices[option_texts.index(selected_laptop)]
            selected_assets[asset_type] = selected_idx


def render_ipad_selection(asset_df, selected_assets, asset_type):
    """아이패드 선택: S/N, Model, Date 정보 표시"""
    if asset_df.empty:
        st.info("할당 가능한 아이패드가 없습니다.")
        return

    if len(asset_df) == 1:
        asset_idx = asset_df.index[0]
        row = asset_df.iloc[0]
        sn = str(row.get("S/N", "N/A"))
        model = str(row.get("Model", "N/A"))
        date = str(row.get("date", ""))

        display_text = f"S/N: {sn} | Model: {model}"
        if date and date != "nan":
            display_text += f" | Date: {date}"

        st.info(f"✅ 자동으로 선택됨: {display_text}")
        selected_assets[asset_type] = asset_idx
    else:
        option_list = []
        for asset_idx, row in asset_df.iterrows():
            sn = str(row.get("S/N", "N/A"))
            model = str(row.get("Model", "N/A"))
            date = str(row.get("date", ""))

            display_text = f"S/N: {sn} | Model: {model}"
            if date and date != "nan":
                display_text += f" | Date: {date}"

            option_list.append((display_text, asset_idx))

        option_texts = [text for text, _ in option_list]
        option_indices = [idx for _, idx in option_list]

        selected_ipad = st.radio(
            "아이패드 선택", options=option_texts, key=f"radio_{asset_type}"
        )

        if selected_ipad:
            selected_idx = option_indices[option_texts.index(selected_ipad)]
            selected_assets[asset_type] = selected_idx


def render_teams_selection(asset_df, selected_assets, asset_type):
    """Teams 선택: Number, Business Title 정보 표시"""
    if asset_df.empty:
        st.info("할당 가능한 Teams 번호가 없습니다.")
        return

    # 컬럼명 정의
    number_col = None
    if "Number formated for Country" in asset_df.columns:
        number_col = "Number formated for Country"
    elif "Number" in asset_df.columns:
        number_col = "Number"

    business_title_col = None
    if "Business Title" in asset_df.columns:
        business_title_col = "Business Title"

    if len(asset_df) == 1:
        asset_idx = asset_df.index[0]
        row = asset_df.iloc[0]

        number = str(row.get(number_col, "N/A")) if number_col else "N/A"
        business_title = (
            str(row.get(business_title_col, "")) if business_title_col else ""
        )

        display_text = f"Number: {number}"
        if business_title and business_title != "nan":
            display_text += f" | Business Title: {business_title}"

        st.info(f"✅ 자동으로 선택됨: {display_text}")
        selected_assets[asset_type] = asset_idx
    else:
        option_list = []
        for asset_idx, row in asset_df.iterrows():
            number = str(row.get(number_col, "N/A")) if number_col else "N/A"
            business_title = (
                str(row.get(business_title_col, "")) if business_title_col else ""
            )

            display_text = f"Number: {number}"
            if business_title and business_title != "nan":
                display_text += f" | Business Title: {business_title}"

            option_list.append((display_text, asset_idx))

        option_texts = [text for text, _ in option_list]
        option_indices = [idx for _, idx in option_list]

        selected_teams = st.radio(
            "Teams 번호 선택", options=option_texts, key=f"radio_{asset_type}"
        )

        if selected_teams:
            selected_idx = option_indices[option_texts.index(selected_teams)]
            selected_assets[asset_type] = selected_idx


def render_monitor_selection(asset_df, selected_assets, asset_type):
    """모니터 선택: Model 정보 표시"""
    if asset_df.empty:
        st.info("할당 가능한 모니터가 없습니다.")
        return

    if len(asset_df) == 1:
        asset_idx = asset_df.index[0]
        row = asset_df.iloc[0]
        model = str(row.get("Model", "N/A"))

        st.info(f"✅ 자동으로 선택됨: Model: {model}")
        selected_assets[asset_type] = asset_idx
    else:
        option_list = []
        for asset_idx, row in asset_df.iterrows():
            model = str(row.get("Model", "N/A"))
            sn = str(row.get("S/N", "")) if "S/N" in row else ""

            display_text = f"Model: {model}"
            if sn and sn != "nan":
                display_text += f" | S/N: {sn}"

            option_list.append((display_text, asset_idx))

        option_texts = [text for text, _ in option_list]
        option_indices = [idx for _, idx in option_list]

        selected_monitor = st.radio(
            "모니터 선택", options=option_texts, key=f"radio_{asset_type}"
        )

        if selected_monitor:
            selected_idx = option_indices[option_texts.index(selected_monitor)]
            selected_assets[asset_type] = selected_idx


def render_printer_selection(asset_df, selected_assets, asset_type):
    """복합기 선택: Model, Additional Information 정보 표시"""
    if asset_df.empty:
        st.info("할당 가능한 복합기가 없습니다.")
        return

    if len(asset_df) == 1:
        asset_idx = asset_df.index[0]
        row = asset_df.iloc[0]
        model = str(row.get("Model", "N/A"))
        additional = str(row.get("Additional Information 2", ""))

        display_text = f"Model: {model}"
        if additional and additional != "nan":
            display_text += f" | {additional}"

        st.info(f"✅ 자동으로 선택됨: {display_text}")
        selected_assets[asset_type] = asset_idx
    else:
        option_list = []
        for asset_idx, row in asset_df.iterrows():
            model = str(row.get("Model", "N/A"))
            additional = str(row.get("Additional Information 2", ""))

            display_text = f"Model: {model}"
            if additional and additional != "nan":
                display_text += f" | {additional}"

            option_list.append((display_text, asset_idx))

        option_texts = [text for text, _ in option_list]
        option_indices = [idx for _, idx in option_list]

        selected_printer = st.radio(
            "복합기 선택", options=option_texts, key=f"radio_{asset_type}"
        )

        if selected_printer:
            selected_idx = option_indices[option_texts.index(selected_printer)]
            selected_assets[asset_type] = selected_idx
