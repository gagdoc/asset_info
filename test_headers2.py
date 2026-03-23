import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from backend.services.sheets_service import _get_client, SHEET_MAPPING

def main():
    _, ss = _get_client()
    for key in ["Dept_Config", "NewHire"]:
        sheet_name = SHEET_MAPPING.get(key)
        if sheet_name:
            try:
                ws = ss.worksheet(sheet_name)
                header = ws.row_values(1)
                print(f"[{key}] ({sheet_name}): {header}")
            except Exception as e:
                print(f"Error {key}: {e}")

if __name__ == "__main__":
    main()
