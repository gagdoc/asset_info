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
    
    ws_apr = spreadsheet.worksheet("4월")
    rows = ws_apr.get_values("A1:L10")
    print("--- 4월 시트 전체(A~L) 구조 파악 ---")
    for row in rows:
        print(row)

if __name__ == "__main__":
    main()
