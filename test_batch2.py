import os
import sys
import pandas as pd
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from backend.services.sheets_service import _get_client, SHEET_MAPPING
from backend.routers.assets import get_dashboard_integrated

def main():
    _, ss = _get_client()
    keys = list(SHEET_MAPPING.keys())
    ranges = [f"{name}!A:Z" for name in SHEET_MAPPING.values()]
    results = ss.values_batch_get(ranges)
    valueRanges = results.get('valueRanges', [])
    for idx, res in enumerate(valueRanges):
        key = keys[idx]
        if key in ("Teams", "Printer"):
            values = res.get('values', [])
            if len(values) > 1:
                print(f"--- {key} ---")
                print("Header:", values[0])
                print("Row 1:", values[1])
                print("Row 2:", values[2] if len(values) > 2 else "")

if __name__ == "__main__":
    main()
