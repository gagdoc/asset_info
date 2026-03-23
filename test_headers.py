import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from backend.services.sheets_service import _get_client, SHEET_MAPPING

def main():
    _, ss = _get_client()
    print("Sheets available:")
    for ws in ss.worksheets():
        print(" -", ws.title)
        
    print("\nHeaders for specific sheets:")
    for key, name in SHEET_MAPPING.items():
        if key in ("All_User", "NewHire", "Resign"):
            ws = ss.worksheet(name)
            header = ws.row_values(1)
            print(f"[{key}] ({name}): {header}")

if __name__ == "__main__":
    main()
