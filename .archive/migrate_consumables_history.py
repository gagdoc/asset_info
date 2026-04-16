import os
import sys
import argparse

# 프로젝트 루트를 sys.path에 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import (
    CONSUMABLES_MASTER_SPREADSHEET_ID, 
    CONSUMABLES_OUTBOUND_SPREADSHEET_ID,
    GOOGLE_CREDENTIALS_FILE,
    GOOGLE_CREDENTIALS_JSON
)
from backend.services.consumables_service import _get_consumables_client

def migrate_history():
    if CONSUMABLES_MASTER_SPREADSHEET_ID == CONSUMABLES_OUTBOUND_SPREADSHEET_ID:
        print("❌ 마스터 시트와 출고 내역 시트 ID가 동일합니다. 먼저 config.py에서 다른 ID를 설정해주세요.")
        return

    print(f"🚀 마이그레이션 시작...")
    print(f"소스 (Master): {CONSUMABLES_MASTER_SPREADSHEET_ID}")
    print(f"대상 (Outbound): {CONSUMABLES_OUTBOUND_SPREADSHEET_ID}")

    _, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    _, ss_outbound = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)

    if not ss_master or not ss_outbound:
        print("❌ 시트 연결 실패. 권한 설정을 확인하세요.")
        return

    # 마스터 시트에서 "월"이 포함된 시트 찾기
    worksheets = ss_master.worksheets()
    month_sheets = [ws for ws in worksheets if "월" in ws.title and ws.title != "품목리스트" and ws.title != "재고리스트"]

    if not month_sheets:
        print("✨ 마스터 시트에 옮길 출고 내역(월별 시트)이 없습니다.")
        return

    print(f"Found {len(month_sheets)} sheets to migrate: {[ws.title for ws in month_sheets]}")

    for ws in month_sheets:
        title = ws.title
        print(f"📦 '{title}' 시트 복사 중...")
        
        try:
            # 1. 대상 시트에 이미 있는지 확인
            try:
                target_ws = ss_outbound.worksheet(title)
                print(f"   ⚠️ 대상 시트에 '{title}'이 이미 존재합니다. 건너뜁니다.")
                continue
            except:
                pass

            # 2. 데이터 가져오기
            data = ws.get_all_values()
            
            # 3. 대상 시트에 새 워크시트 생성
            new_ws = ss_outbound.add_worksheet(title=title, rows=len(data)+100, cols=10)
            
            # 4. 데이터 쓰기
            if data:
                new_ws.update('A1', data)
            
            print(f"   ✅ '{title}' 복사 완료.")
            
            # 5. 원본 삭제 (선택 사항 - 여기서는 안전을 위해 안내만 함)
            # ss_master.del_worksheet(ws)
            # print(f"   🗑️ 원본 '{title}' 삭제 완료.")
            
        except Exception as e:
            print(f"   ❌ '{title}' 처리 중 오류 발생: {e}")

    print("\n🎉 모든 마이그레이션 작업이 완료되었습니다.")
    print("💡 이제 마스터 시트에서 복사된 월별 탭들을 수동으로 삭제하셔도 됩니다.")

if __name__ == "__main__":
    migrate_history()
