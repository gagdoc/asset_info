#!/usr/bin/env python3
"""
create_test_sheets.py
=====================
실제 운영 구글 시트 4개를 복사해서 테스트용 복사본을 만들고
.env.development 파일에 자동으로 ID를 기록합니다.

실행 방법 (ASSET_INFO 프로젝트 루트에서):
    python scripts/create_test_sheets.py

필요 패키지:
    pip install google-auth google-api-python-client gspread python-dotenv
"""

import os
import sys
import json
import time

# 프로젝트 루트를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from googleapiclient.discovery import build
    from google.oauth2.service_account import Credentials
except ImportError:
    print("❌ 패키지 누락: pip install google-api-python-client google-auth")
    sys.exit(1)

from config import (
    GOOGLE_CREDENTIALS_FILE, GOOGLE_CREDENTIALS_JSON,
    PROD_SHEET_IDS,
)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

ENV_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env.development")

# 복사할 시트 목록: (config key, 표시 이름, env 변수명)
SHEETS_TO_COPY = [
    ("assets",               "자산 관리 시트",         "TEST_SPREADSHEET_ID"),
    ("consumables_master",   "소모품 마스터 시트",      "TEST_CONSUMABLES_MASTER_ID"),
    ("consumables_outbound", "소모품 출고 내역 시트",   "TEST_CONSUMABLES_OUTBOUND_ID"),
    ("toner",                "토너 재고 시트",          "TEST_TONER_ID"),
]


def _get_credentials():
    if GOOGLE_CREDENTIALS_JSON:
        creds_dict = json.loads(GOOGLE_CREDENTIALS_JSON)
        return Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
    elif os.path.exists(GOOGLE_CREDENTIALS_FILE):
        return Credentials.from_service_account_file(GOOGLE_CREDENTIALS_FILE, scopes=SCOPES)
    else:
        print("❌ Google 인증 정보를 찾을 수 없습니다.")
        print(f"   파일 경로: {GOOGLE_CREDENTIALS_FILE}")
        sys.exit(1)


def copy_spreadsheet(drive_service, src_id: str, new_title: str) -> str:
    """Drive API로 스프레드시트를 복사하고 새 ID를 반환합니다."""
    body = {"name": new_title}
    result = drive_service.files().copy(fileId=src_id, body=body).execute()
    return result["id"]


def make_sheet_public(drive_service, file_id: str):
    """서비스 계정이 복사본을 소유하지만, 원본과 동일한 공유 설정을 유지."""
    # 서비스 계정 자신은 이미 owner이므로 추가 권한 불필요
    pass


def update_env_file(env_vars: dict):
    """
    .env.development 파일에 ID를 업데이트합니다.
    파일이 없으면 새로 생성합니다.
    """
    # 기존 파일 내용 읽기
    existing = {}
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    existing[k.strip()] = v.strip()

    # 새 값 병합
    existing.update(env_vars)

    # 파일 쓰기
    lines = [
        "# ================================================================",
        "# 로컬 개발 환경 - 테스트 시트 ID (create_test_sheets.py로 자동 생성)",
        "# 이 파일은 절대 git에 커밋하지 마세요!",
        "# ================================================================",
        "",
    ]
    for k, v in existing.items():
        lines.append(f"{k}={v}")
    lines.append("")

    with open(ENV_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    print("=" * 60)
    print("  🗂️  테스트 구글 시트 생성 스크립트")
    print("=" * 60)
    print()

    # 이미 생성된 시트가 있는지 확인
    existing_env = {}
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    existing_env[k.strip()] = v.strip()

        already_set = [k for k, v in existing_env.items() if v and k.startswith("TEST_")]
        if already_set:
            print("⚠️  .env.development 에 이미 테스트 시트 ID가 있습니다:")
            for k in already_set:
                print(f"   {k}={existing_env[k]}")
            print()
            ans = input("덮어쓰고 새로 생성하시겠습니까? (y/N): ").strip().lower()
            if ans != "y":
                print("취소되었습니다.")
                return

    print("🔑 Google 인증 중...")
    creds = _get_credentials()
    drive_service = build("drive", "v3", credentials=creds)
    print("✅ 인증 성공\n")

    new_ids = {}

    for config_key, display_name, env_key in SHEETS_TO_COPY:
        src_id = PROD_SHEET_IDS.get(config_key, "")
        if not src_id:
            print(f"⚠️  [{display_name}] PROD ID가 설정되지 않아 건너뜁니다.")
            continue

        new_title = f"[TEST] {display_name}"
        print(f"📋 복사 중: {display_name}")
        print(f"   원본 ID: {src_id}")
        print(f"   새 이름: {new_title}")

        try:
            new_id = copy_spreadsheet(drive_service, src_id, new_title)
            new_ids[env_key] = new_id
            print(f"   ✅ 완료! 새 ID: {new_id}")
            print(f"   🔗 URL: https://docs.google.com/spreadsheets/d/{new_id}")
        except Exception as e:
            print(f"   ❌ 오류: {e}")

        print()
        time.sleep(1)  # API 레이트 리밋 방지

    if not new_ids:
        print("❌ 생성된 시트가 없습니다.")
        return

    # .env.development에 저장
    update_env_file(new_ids)
    print("=" * 60)
    print("✅ .env.development 파일에 ID가 저장되었습니다!")
    print()
    print("다음 단계:")
    print("  1. 위 URL에서 테스트 시트가 제대로 복사되었는지 확인")
    print("  2. 로컬 서버 재시작 (uvicorn backend.main:app --reload)")
    print("  3. 개발 배너의 [📥 실제 데이터 가져오기] 버튼으로 최신 데이터 동기화")
    print("=" * 60)


if __name__ == "__main__":
    main()
