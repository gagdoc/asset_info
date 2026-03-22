import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from google.oauth2.service_account import Credentials
import gspread

CREDS_FILE = "data/st-asset-project-8000c6bb9905.json"
SPREADSHEET_ID = "1A4RvrDn_I3wev6UaqEGBRoADYRYwtQty0TPo-x6ehtw"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]

def main():
    creds = Credentials.from_service_account_file(CREDS_FILE, scopes=SCOPES)
    client = gspread.authorize(creds)
    spreadsheet = client.open_by_key(SPREADSHEET_ID)
    
    # 3월 시트 확인
    ws_mar = spreadsheet.worksheet("3월")
    rows = ws_mar.get_values("A1:K15")
    print("--- 3월 시트 상위 15행 ---")
    for row in rows:
        print(row)
        
    print("\n--- 품목리스트 시트 상위 10행 ---")
    ws_items = spreadsheet.worksheet("품목리스트")
    rows_items = ws_items.get_values("A1:H10")
    for row in rows_items:
        print(row)

if __name__ == "__main__":
    main()
