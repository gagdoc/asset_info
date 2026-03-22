import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from backend.services.sheets_service import _get_client, SHEET_MAPPING

def main():
    _, ss = _get_client()
    keys = list(SHEET_MAPPING.keys())
    ranges = [f"{name}!A:Z" for name in SHEET_MAPPING.values()]
    print("Fetching ranges:", ranges)
    try:
        results = ss.values_batch_get(ranges)
        valueRanges = results.get('valueRanges', [])
        for idx, res in enumerate(valueRanges):
            print(f"Sheet '{keys[idx]}':")
            values = res.get('values', [])
            print(f"  Rows count: {len(values)}")
            if values:
                print(f"  Header: {values[0]}")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
