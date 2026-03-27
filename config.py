# =====================================================
# 앱 전역 설정 (Asset Management System Config)
# =====================================================

import os

# 데이터베이스 설정
DB_FILE = "asset_database.db"
CONSUMABLES_DB_FILE = "consumables.db"

# ── Google Sheets 설정 ──────────────────────────────
# Google Sheets Spreadsheet ID (URL에서 /d/ 뒤 부분)
SPREADSHEET_ID = "1__8NXfK6ruhlQtnomhIi_sjdkHgLD0C2N1Mw4P3GW7g"

# 소모품 관리 시트 (마스터 리스트 & 재고 요약)
CONSUMABLES_MASTER_SPREADSHEET_ID = "1A4RvrDn_I3wev6UaqEGBRoADYRYwtQty0TPo-x6ehtw"
# 소모품 출고 내역 시트 (월별 탭)
CONSUMABLES_OUTBOUND_SPREADSHEET_ID = "1MgYUINr7T1t80MUlv-RRaL7GkK7NSNxuKmAzvqNGe-M"

# Service Account JSON 키 파일 (로컬용)
GOOGLE_CREDENTIALS_FILE = "data/st-asset-project-8000c6bb9905.json"
# Cloud Run 등 클라우드 배포용 환경 변수 (JSON 문자열)
GOOGLE_CREDENTIALS_JSON = os.environ.get("GOOGLE_CREDENTIALS_JSON")

# Excel 시트 매핑 (Excel 파일의 실제 시트명)
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

# 자산 테이블별 주요 컬럼 매핑
# (Excel 파일에서 변하기 쉬운 컬럼명들을 여러 옵션으로 정의)
COLUMN_MAPPING = {
    "Lease": {
        "sn_options": ["S/N", "일련번호", "Serial"],
        "model_options": ["Model", "모델", "노트북모델"],
        "email_col": "email",
    },
    "iPad": {
        "sn_options": ["S/N", "일련번호", "Serial"],
        "model_options": ["Model", "모델", "아이패드모델"],
        "email_col": "email",
    },
    "Teams": {
        "phone_options": [
            "Number formated for Country",
            "Number",
            "전화번호",
            "LineURI",
        ],
        "email_col": "email",
    },
    "Printer": {
        "model_options": [
            "Model",
            "Additional Information 2",
            "프린터정보",
        ],
        "email_col": "email",
    },
    "Monitor": {
        "model_options": ["Model", "모니터모델"],
        "email_col": "email",
    },
}

# 자산 유형별 한글명
ASSET_TYPES = {
    "Lease": "노트북",
    "iPad": "아이패드",
    "Teams": "Teams",
    "Monitor": "모니터",
    "Printer": "복합기",
}

# 퇴사자 판별 키워드
RESIGNED_KEYWORD = "퇴사"

# 퇴사자 강조 스타일
RESIGNED_ROW_STYLE = "background-color: #FFD580; color: black; font-weight: bold;"

# 기본 테이블 스키마 (테이블이 없을 때 사용)
DEFAULT_SCHEMAS = {
    "All_User": ["NO", "NAME", "이름", "email", "ROLE", "BU", "SKL분류"],
    "Lease": ["NO", "email", "S/N", "Model", "할당일"],
    "iPad": ["NO", "email", "S/N", "Model", "할당일"],
    "Teams": ["NO", "email", "Number", "할당일"],
    "Printer": ["NO", "email", "Model", "할당일"],
    "Monitor": ["NO", "email", "Model", "할당일"],
    "Resign": ["F", "월", "날짜", "NAME", "email", "설명", "BU", "노트북", "아이패드", "모니터", "복합기", "Teams", "추가사항"],
    "NewHire": ["NO", "이름", "NAME", "email", "BU", "ROLE", "노트북", "아이패드", "모니터", "Teams", "복합기"],
    "Dept_Config": ["BU", "ROLE"],
}

# Streamlit 페이지 설정
PAGE_TITLE = "사내 자산 & 소모품 관리 시스템"
LAYOUT = "wide"

# 소모품 필수 품목 재고 임계값 (fixed_qty)
CONSUMABLES_DEFAULT_THRESHOLD = 5

# 로깅 설정
LOG_LEVEL = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL
