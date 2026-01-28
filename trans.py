import pandas as pd
import zipfile
import os

# 1. 정리할 파일 목록 정의 (앱에서 사용하는 파일들)
target_files = {
    "All_User": "ASSET_INFO.xlsx - All_User.csv",
    "Lease_List": "ASSET_INFO.xlsx - Lease_List.csv",
    "Ipad_List": "ASSET_INFO.xlsx - Ipad_List.csv",
    "TeamsNumber": "ASSET_INFO.xlsx - TeamsNumber.csv",
    "Printer": "ASSET_INFO.xlsx - Printer.csv",
    "퇴사자": "ASSET_INFO.xlsx - 퇴사자.csv",
    "신규입사자": "ASSET_INFO.xlsx - 신규입사자.csv",
}

cleaned_files = []

# 2. 각 파일을 불러와서 청소(Cleaning)하고 저장
for key, filename in target_files.items():
    try:
        # 파일 읽기
        df = pd.read_csv(filename)

        # 컬럼 이름의 공백 제거
        df.columns = df.columns.str.strip()

        # 모든 텍스트 데이터의 앞뒤 공백 제거
        df = df.applymap(lambda x: x.strip() if isinstance(x, str) else x)

        # 저장할 파일명 (앱 코드와 동일하게 유지)
        save_name = f"clean_{filename}"

        # UTF-8-SIG (한글 깨짐 방지)로 저장
        df.to_csv(save_name, index=False, encoding="utf-8-sig")
        cleaned_files.append(save_name)

    except Exception as e:
        print(f"{filename} 처리 중 오류: {e}")

# 3. 정리된 파일들을 압축해서 내보내기
zip_filename = "asset_app_files.zip"
with zipfile.ZipFile(zip_filename, "w") as zipf:
    for file in cleaned_files:
        # 압축 파일 내에는 원래 이름으로 저장 (앱 코드 수정 없이 쓰시도록)
        original_name = file.replace("clean_", "")
        zipf.write(file, arcname=original_name)

print(f"변환 완료: {zip_filename}")
