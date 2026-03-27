import os
import sys

# 프로젝트 루트를 sys.path에 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import (
    CONSUMABLES_MASTER_SPREADSHEET_ID, 
    CONSUMABLES_OUTBOUND_SPREADSHEET_ID,
)
from backend.services.consumables_service import _get_consumables_client, get_available_months, get_items_list

def verify_setup():
    print("=" * 55)
    print("  Consumables Spreadsheet Separation Verification")
    print("=" * 55)
    
    # 1. 시트 ID 확인
    print(f"\n1. Spreadsheet IDs:")
    print(f"   - Master ID: {CONSUMABLES_MASTER_SPREADSHEET_ID}")
    print(f"   - Outbound ID: {CONSUMABLES_OUTBOUND_SPREADSHEET_ID}")
    
    if CONSUMABLES_MASTER_SPREADSHEET_ID == CONSUMABLES_OUTBOUND_SPREADSHEET_ID:
        print("\nℹ️  현재 두 ID가 동일합니다. (기존 데이터 유지 중)")
    else:
        print("\n✅ 두 시트가 분리되었습니다.")

    # 2. 마스터 시트 연결 확인
    print(f"\n2. Testing Master Spreadsheet connectivity...")
    client, ss_master = _get_consumables_client(CONSUMABLES_MASTER_SPREADSHEET_ID)
    if ss_master:
        print(f"   ✅ MS Title: {ss_master.title}")
        items = get_items_list()
        print(f"   ✅ MS Item count: {len(items)}")
    else:
        print(f"   ❌ MS Connection failed.")

    # 3. 출고 내역 시트 연결 확인
    print(f"\n3. Testing Outbound Spreadsheet connectivity...")
    client, ss_outbound = _get_consumables_client(CONSUMABLES_OUTBOUND_SPREADSHEET_ID)
    if ss_outbound:
        print(f"   ✅ OS Title: {ss_outbound.title}")
        months = get_available_months()
        print(f"   ✅ OS Available months: {months}")
    else:
        print(f"   ❌ OS Connection failed.")

    print("\n" + "=" * 55)
    print("  Verification Completed!")
    print("=" * 55)

if __name__ == "__main__":
    verify_setup()
