#!/usr/bin/env python3
"""
sync_prod_to_test.py
====================
운영(PROD) 구글 시트의 모든 데이터를 테스트(TEST) 시트로 복사합니다.
시트 구조(탭)는 유지하고 데이터만 덮어씁니다.

실행 방법 (ASSET_INFO 프로젝트 루트에서):
    python scripts/sync_prod_to_test.py

또는 API로 트리거:
    POST /api/admin/sync-prod-to-test  (개발 모드에서만 동작)
"""

import os
import sys
import json
import time
import logging

logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# .env.development 로드 (스크립트 직접 실행 시)
try:
    from dotenv import load_dotenv
    _env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env.development")
    if os.path.exists(_env_file):
        load_dotenv(_env_file, override=True)
except ImportError:
    pass

try:
    import gspread
    from google.oauth2.service_account import Credentials
except ImportError:
    print("❌ pip install gspread google-auth")
    sys.exit(1)

from config import (
    GOOGLE_CREDENTIALS_FILE, GOOGLE_CREDENTIALS_JSON,
    PROD_SHEET_IDS, TEST_SHEET_IDS, IS_PRODUCTION,
)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# 제외할 시트 탭 (시스템 탭 등)
EXCLUDE_SHEETS = {"월별스냅샷", "월별마감", "재고리스트"}


def _get_client():
    creds = None
    if GOOGLE_CREDENTIALS_JSON:
        creds = Credentials.from_service_account_info(
            json.loads(GOOGLE_CREDENTIALS_JSON), scopes=SCOPES
        )
    elif os.path.exists(GOOGLE_CREDENTIALS_FILE):
        creds = Credentials.from_service_account_file(GOOGLE_CREDENTIALS_FILE, scopes=SCOPES)
    else:
        raise RuntimeError(f"Google 인증 정보 없음: {GOOGLE_CREDENTIALS_FILE}")
    return gspread.authorize(creds)


def _copy_spreadsheet_data(client, prod_id: str, test_id: str, label: str) -> dict:
    """
    PROD 시트의 모든 탭 데이터를 TEST 시트에 덮어씁니다.
    탭이 없으면 새로 생성합니다. 반환: {tabs_synced, rows_copied, skipped}
    """
    if not prod_id or not test_id:
        return {"error": f"[{label}] ID 누락 (PROD={bool(prod_id)}, TEST={bool(test_id)})"}

    result = {"label": label, "tabs_synced": 0, "rows_copied": 0, "skipped": [], "errors": []}

    try:
        prod_ss = client.open_by_key(prod_id)
        test_ss = client.open_by_key(test_id)
    except Exception as e:
        result["errors"].append(f"시트 열기 실패: {e}")
        return result

    prod_worksheets = prod_ss.worksheets()
    test_worksheet_map = {ws.title: ws for ws in test_ss.worksheets()}

    for prod_ws in prod_worksheets:
        title = prod_ws.title

        # 제외 탭
        if title in EXCLUDE_SHEETS:
            result["skipped"].append(title)
            continue

        try:
            # PROD 데이터 읽기
            data = prod_ws.get_all_values()
            if not data:
                result["skipped"].append(f"{title} (빈 시트)")
                continue

            rows = len(data)
            cols = max(len(r) for r in data)

            # TEST 탭 가져오기 또는 생성
            if title in test_worksheet_map:
                test_ws = test_worksheet_map[title]
                # 크기 조정 (필요시)
                if test_ws.row_count < rows or test_ws.col_count < cols:
                    test_ws.resize(rows=max(rows + 100, 1000), cols=max(cols, 20))
                # 기존 데이터 클리어
                test_ws.clear()
            else:
                # 새 탭 생성
                test_ws = test_ss.add_worksheet(
                    title=title,
                    rows=max(rows + 100, 1000),
                    cols=max(cols, 20)
                )

            # 데이터 쓰기 (배치)
            if data:
                test_ws.update(
                    f"A1:{_col_letter(cols)}{rows}",
                    data,
                    value_input_option="USER_ENTERED"
                )

            result["tabs_synced"] += 1
            result["rows_copied"] += rows
            print(f"   ✅ [{title}] {rows}행 동기화 완료")

        except Exception as e:
            err_msg = f"[{title}] 오류: {e}"
            result["errors"].append(err_msg)
            print(f"   ❌ {err_msg}")

        time.sleep(0.5)  # API 레이트 리밋 방지

    return result


def _col_letter(n: int) -> str:
    """숫자를 구글 시트 열 문자로 변환 (1→A, 26→Z, 27→AA)"""
    result = ""
    while n > 0:
        n, remainder = divmod(n - 1, 26)
        result = chr(65 + remainder) + result
    return result


def run_sync(log_fn=print) -> dict:
    """
    동기화 실행. API 엔드포인트에서도 이 함수를 호출합니다.
    반환: {"success": bool, "results": [...], "summary": {...}}
    """
    if IS_PRODUCTION:
        return {
            "success": False,
            "error": "운영(PRODUCTION) 환경에서는 동기화를 실행할 수 없습니다."
        }

    # TEST ID 검증
    missing = [k for k, v in TEST_SHEET_IDS.items() if not v]
    if missing:
        return {
            "success": False,
            "error": f"테스트 시트 ID가 설정되지 않았습니다: {missing}\n"
                     f"먼저 scripts/create_test_sheets.py 를 실행하세요."
        }

    log_fn("🔑 Google 인증 중...")
    try:
        client = _get_client()
    except Exception as e:
        return {"success": False, "error": str(e)}
    log_fn("✅ 인증 성공\n")

    # 시트 쌍 목록
    sheet_pairs = [
        ("assets",               "자산 관리 시트"),
        ("consumables_master",   "소모품 마스터 시트"),
        ("consumables_outbound", "소모품 출고 내역 시트"),
        ("toner",                "토너 재고 시트"),
    ]

    all_results = []
    total_tabs = 0
    total_rows = 0

    for key, label in sheet_pairs:
        prod_id = PROD_SHEET_IDS.get(key, "")
        test_id = TEST_SHEET_IDS.get(key, "")

        log_fn(f"\n📋 [{label}] 동기화 중...")
        log_fn(f"   PROD → TEST")

        res = _copy_spreadsheet_data(client, prod_id, test_id, label)
        all_results.append(res)

        if "error" not in res:
            total_tabs += res.get("tabs_synced", 0)
            total_rows += res.get("rows_copied", 0)
            if res.get("errors"):
                log_fn(f"   ⚠️  오류 {len(res['errors'])}건: {res['errors']}")
        else:
            log_fn(f"   ❌ {res['error']}")

    summary = {
        "total_tabs": total_tabs,
        "total_rows": total_rows,
        "sheet_count": len(sheet_pairs),
    }

    log_fn(f"\n{'='*50}")
    log_fn(f"✅ 동기화 완료: {total_tabs}개 탭, {total_rows:,}행 복사")
    log_fn(f"{'='*50}")

    return {
        "success": True,
        "results": all_results,
        "summary": summary,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    print("=" * 60)
    print("  📥  운영 → 테스트 데이터 동기화")
    print("=" * 60)

    if IS_PRODUCTION:
        print("❌ 운영 환경에서는 실행할 수 없습니다.")
        sys.exit(1)

    result = run_sync()
    if not result.get("success"):
        print(f"\n❌ 실패: {result.get('error')}")
        sys.exit(1)
