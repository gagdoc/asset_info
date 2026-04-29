#!/usr/bin/env python3
"""
download_to_local.py
====================
운영 Google Sheets 데이터를 로컬 JSON 파일로 다운로드합니다.

  data/local/{spreadsheet_id}.json

로컬 서버는 이 파일을 읽고 씁니다. Google Sheets API 호출 없이 동작합니다.

실행:
    python scripts/download_to_local.py
또는 앱 개발 배너의 "📥 실제 데이터 가져오기" 버튼
"""

import os
import sys
import json
import time
import logging

logger = logging.getLogger(__name__)

# 프로젝트 루트 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# .env.development 는 필요 없음 — PROD ID를 직접 씀
try:
    import gspread
    from google.oauth2.service_account import Credentials
except ImportError:
    print("❌ pip install gspread google-auth")
    sys.exit(1)

from config import (
    GOOGLE_CREDENTIALS_FILE, GOOGLE_CREDENTIALS_JSON,
    IS_PRODUCTION,
    _PROD_SPREADSHEET_ID,
    _PROD_CONSUMABLES_MASTER_ID,
    _PROD_CONSUMABLES_OUTBOUND_ID,
    _PROD_TONER_ID,
)
from backend.services.local_sheets import LOCAL_DATA_DIR

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# 로컬 파일에 저장하지 않을 시스템 탭 (스냅샷·마감 기록은 초기화)
EXCLUDE_TABS = {"월별스냅샷", "월별마감"}


def _auth():
    if GOOGLE_CREDENTIALS_JSON:
        creds = Credentials.from_service_account_info(
            json.loads(GOOGLE_CREDENTIALS_JSON), scopes=SCOPES
        )
    elif os.path.exists(GOOGLE_CREDENTIALS_FILE):
        creds = Credentials.from_service_account_file(GOOGLE_CREDENTIALS_FILE, scopes=SCOPES)
    else:
        raise RuntimeError(f"Google 인증 정보 없음: {GOOGLE_CREDENTIALS_FILE}")
    return gspread.authorize(creds)


def _download_spreadsheet(client, sheet_id: str, label: str, log_fn) -> dict:
    """지정된 스프레드시트의 모든 탭 데이터를 dict로 반환.
    '__gid_map__' 키에 {탭명: GID} 매핑을 함께 저장합니다."""
    log_fn(f"\n📥 [{label}] 다운로드 중...")
    try:
        ss = client.open_by_key(sheet_id)
    except Exception as e:
        log_fn(f"   ❌ 시트 열기 실패: {e}")
        return {}

    data = {}
    gid_map = {}
    for ws in ss.worksheets():
        title = ws.title
        if title in EXCLUDE_TABS:
            log_fn(f"   ⏭  [{title}] 건너뜀 (시스템 탭)")
            continue
        try:
            rows = ws.get_all_values()
            data[title] = rows
            gid_map[str(ws.id)] = title   # GID → 탭명 매핑 저장
            log_fn(f"   ✅ [{title}] {len(rows)}행 (GID={ws.id})")
        except Exception as e:
            log_fn(f"   ⚠️  [{title}] 오류: {e}")
        time.sleep(0.3)  # API 레이트 리밋 방지

    # 메타데이터로 GID 맵 저장 (탭 데이터와 구분하기 위해 __ 접두사)
    data["__gid_map__"] = gid_map
    return data


def _save_local(sheet_id: str, data: dict):
    os.makedirs(LOCAL_DATA_DIR, exist_ok=True)
    path = os.path.join(LOCAL_DATA_DIR, f"{sheet_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


def run_download(log_fn=print) -> dict:
    """
    4개 운영 시트를 로컬 JSON으로 저장합니다.
    반환: {"success": bool, "summary": {...}}
    """
    if IS_PRODUCTION:
        return {"success": False, "error": "운영 환경에서는 로컬 다운로드를 실행할 수 없습니다."}

    log_fn("🔑 Google 인증 중...")
    try:
        client = _auth()
    except Exception as e:
        return {"success": False, "error": str(e)}
    log_fn("✅ 인증 성공")

    sheets = [
        (_PROD_SPREADSHEET_ID,            "자산 관리 시트"),
        (_PROD_CONSUMABLES_MASTER_ID,     "소모품 마스터 시트"),
        (_PROD_CONSUMABLES_OUTBOUND_ID,   "소모품 출고 내역 시트"),
        (_PROD_TONER_ID,                  "토너 재고 시트"),
    ]

    total_tabs = 0
    total_rows = 0
    saved_paths = []

    for sheet_id, label in sheets:
        data = _download_spreadsheet(client, sheet_id, label, log_fn)
        if data:
            path = _save_local(sheet_id, data)
            saved_paths.append(path)
            tabs = len(data)
            rows = sum(len(v) for v in data.values())
            total_tabs += tabs
            total_rows += rows
            log_fn(f"   💾 저장: {os.path.basename(path)} ({tabs}탭, {rows}행)")

    # 로컬 클라이언트 캐시 초기화 (재시작 없이 즉시 반영)
    try:
        from backend.services import local_sheets as _ls
        _ls._client = None
    except Exception:
        pass

    log_fn(f"\n{'='*50}")
    log_fn(f"✅ 다운로드 완료: {total_tabs}탭, {total_rows:,}행 → data/local/")
    log_fn(f"{'='*50}")

    return {
        "success": True,
        "summary": {
            "total_tabs": total_tabs,
            "total_rows": total_rows,
            "files": [os.path.basename(p) for p in saved_paths],
        },
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    print("=" * 60)
    print("  📥  운영 데이터 → 로컬 JSON 다운로드")
    print("=" * 60)

    if IS_PRODUCTION:
        print("❌ 운영 환경에서는 실행할 수 없습니다.")
        sys.exit(1)

    result = run_download()
    if not result.get("success"):
        print(f"\n❌ 실패: {result.get('error')}")
        sys.exit(1)
