"""
migrate_to_sheets.py
====================
기존 SQLite(asset_database.db)의 모든 데이터를 Google Sheets로 한 번에 내보냅니다.
최초 1회만 실행하면 됩니다.

실행 방법:
    python migrate_to_sheets.py

실행 위치: 프로젝트 루트 (ASSET_INFO/)
"""

import sys
import os

# 프로젝트 루트를 경로에 추가
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import sqlite3
import pandas as pd
from backend.services.sheets_service import update_sheet, get_spreadsheet

try:
    from config import SHEET_MAPPING
except ImportError:
    SHEET_MAPPING = {
        "All_User": "All_User",
        "Lease": "Lease_List",
        "iPad": "Ipad_List",
        "Teams": "TeamsNumber",
        "Printer": "Printer",
        "Monitor": "Monitor",
        "Resign": "퇴사자",
        "NewHire": "신규입사자",
        "Dept_Config": "Dept_Config",
    }

ASSET_DB_FILE = "asset_database.db"


def migrate():
    print("=" * 55)
    print("  SQLite → Google Sheets 마이그레이션 시작")
    print("=" * 55)

    # Google Sheets 연결 확인
    spreadsheet = get_spreadsheet()
    if not spreadsheet:
        print("\n❌ Google Sheets 연결 실패. 아래를 확인하세요:")
        print("  1. data/ 폴더에 credentials JSON 파일이 있는지")
        print("  2. config.py의 GOOGLE_CREDENTIALS_FILE 경로가 올바른지")
        print("  3. config.py의 SPREADSHEET_ID가 올바른지")
        print("  4. 서비스 계정이 해당 Sheets 파일에 편집자로 공유되었는지")
        return

    print(f"\n✅ 연결된 스프레드시트: {spreadsheet.title}")

    # SQLite 연결
    if not os.path.exists(ASSET_DB_FILE):
        print(f"\n❌ SQLite 파일 없음: {ASSET_DB_FILE}")
        print("   데이터가 없으면 마이그레이션을 건너뜁니다.")
        return

    conn = sqlite3.connect(ASSET_DB_FILE)
    success, skip, fail = 0, 0, 0

    print(f"\n📤 총 {len(SHEET_MAPPING)}개 테이블 마이그레이션 시작...\n")

    for key, sheet_name in SHEET_MAPPING.items():
        try:
            # SQLite에서 데이터 로드
            df = pd.read_sql(f"SELECT * FROM '{key}'", conn)
            rows = len(df)

            if df.empty:
                print(f"  ⏭  [{key}] → 데이터 없음, 건너뜀")
                skip += 1
                continue

            # Google Sheets에 업로드
            ok = update_sheet(key, df)
            if ok:
                print(f"  ✅ [{key}] → '{sheet_name}' ({rows}행 업로드 완료)")
                success += 1
            else:
                print(f"  ❌ [{key}] → 업로드 실패")
                fail += 1

        except Exception as e:
            # 테이블이 SQLite에 없는 경우
            if "no such table" in str(e).lower():
                print(f"  ⏭  [{key}] → SQLite에 테이블 없음, 건너뜀")
                skip += 1
            else:
                print(f"  ❌ [{key}] → 오류: {e}")
                fail += 1

    conn.close()

    print("\n" + "=" * 55)
    print(f"  마이그레이션 완료!")
    print(f"  ✅ 성공: {success}  |  ⏭ 건너뜀: {skip}  |  ❌ 실패: {fail}")
    print("=" * 55)

    if fail == 0:
        print("\n🎉 모든 데이터가 Google Sheets에 성공적으로 이전되었습니다!")
        print(f"   확인: https://docs.google.com/spreadsheets/d/")
        print("   (config.py의 SPREADSHEET_ID로 접속하여 확인하세요)")
    else:
        print(f"\n⚠️  {fail}개 테이블 실패. 위 오류 메시지를 확인하세요.")


if __name__ == "__main__":
    migrate()
