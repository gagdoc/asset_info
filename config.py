# =====================================================
# 앱 전역 설정 (Asset Management System Config)
# =====================================================

import os

# ── 실행 환경 ────────────────────────────────────────────────────
# APP_ENV=development  → 로컬 개발 모드 (테스트 시트 사용, 쓰기 안전 모드)
# APP_ENV=staging      → 테스트 서버 환경 (테스트 시트 사용, 구글 시트 직접 반영)
# APP_ENV=production   → 실제 운영 환경 (실제 구글 시트에 반영)
APP_ENV = os.environ.get("APP_ENV", "development")  # 기본값: 개발 모드
IS_PRODUCTION = APP_ENV == "production"
IS_STAGING = APP_ENV == "staging"
IS_DEVELOPMENT = APP_ENV == "development"
if APP_ENV not in {"development", "staging", "production"}:
    raise ValueError("APP_ENV must be development, staging, or production")

# ── .env.development 자동 로드 (로컬 개발 모드에서만) ─────────────────
# python-dotenv가 있으면 .env.development 파일에서 환경 변수를 불러옴
if APP_ENV == "development":
    try:
        from dotenv import load_dotenv
        _env_file = os.path.join(os.path.dirname(__file__), ".env.development")
        if os.path.exists(_env_file):
            load_dotenv(_env_file, override=False)  # 이미 설정된 env var는 유지
    except ImportError:
        pass  # python-dotenv 미설치 시 무시

# 데이터베이스 설정
DB_FILE = "asset_database.db"
CONSUMABLES_DB_FILE = "consumables.db"

# ══════════════════════════════════════════════════════
# Google Sheets ID 설정
# 운영(PROD) ID는 코드에 직접 기재
# 테스트(TEST) ID는 .env.development 파일에 기재
# ══════════════════════════════════════════════════════

# Known production documents remain blocked even when PROD_* env values change.
CANONICAL_PRODUCTION_SHEET_IDS = frozenset({
    "1__8NXfK6ruhlQtnomhIi_sjdkHgLD0C2N1Mw4P3GW7g",
    "1A4RvrDn_I3wev6UaqEGBRoADYRYwtQty0TPo-x6ehtw",
    "1MgYUINr7T1t80MUlv-RRaL7GkK7NSNxuKmAzvqNGe-M",
    "19AMXwNtrF8BcA_BqXpBcy-vWKX8Wu2IkbFTYNPZORc0",
})

# ── 운영(PROD) 시트 ID ──────────────────────────────
_PROD_SPREADSHEET_ID                  = os.environ.get("PROD_SPREADSHEET_ID", "1__8NXfK6ruhlQtnomhIi_sjdkHgLD0C2N1Mw4P3GW7g")
_PROD_CONSUMABLES_MASTER_ID           = os.environ.get("PROD_CONSUMABLES_MASTER_ID", "1A4RvrDn_I3wev6UaqEGBRoADYRYwtQty0TPo-x6ehtw")
_PROD_CONSUMABLES_OUTBOUND_ID         = os.environ.get("PROD_CONSUMABLES_OUTBOUND_ID", "1MgYUINr7T1t80MUlv-RRaL7GkK7NSNxuKmAzvqNGe-M")
_PROD_TONER_ID                        = os.environ.get("PROD_TONER_ID", "19AMXwNtrF8BcA_BqXpBcy-vWKX8Wu2IkbFTYNPZORc0")

# ── 테스트(TEST) 시트 ID (.env.development 또는 환경 변수에서 로드) ──
# create_test_sheets.py를 실행하면 출력된 ID를 .env.development에 채워넣으세요.
_TEST_SPREADSHEET_ID                  = os.environ.get("TEST_SPREADSHEET_ID", "")
_TEST_CONSUMABLES_MASTER_ID           = os.environ.get("TEST_CONSUMABLES_MASTER_ID", "")
_TEST_CONSUMABLES_OUTBOUND_ID         = os.environ.get("TEST_CONSUMABLES_OUTBOUND_ID", "")
_TEST_TONER_ID                        = os.environ.get("TEST_TONER_ID", "")

# ── 활성 시트 ID (환경에 따라 자동 선택) ────────────────────────
if IS_PRODUCTION:
    SPREADSHEET_ID = _PROD_SPREADSHEET_ID
    CONSUMABLES_MASTER_SPREADSHEET_ID = _PROD_CONSUMABLES_MASTER_ID
    CONSUMABLES_OUTBOUND_SPREADSHEET_ID = _PROD_CONSUMABLES_OUTBOUND_ID
    TONER_SPREADSHEET_ID = _PROD_TONER_ID
elif IS_STAGING:
    # Staging(테스트 서버)에서는 반드시 테스트 시트 ID가 지정되어야 하며, 운영 시트 ID로 fallback 하지 않음
    if not (_TEST_SPREADSHEET_ID and _TEST_CONSUMABLES_MASTER_ID and _TEST_CONSUMABLES_OUTBOUND_ID and _TEST_TONER_ID):
        raise ValueError("❌ Staging 환경 오류: 테스트용 구글 시트 ID가 모두 정의되지 않았습니다. 환경 변수를 확인하세요.")
    SPREADSHEET_ID = _TEST_SPREADSHEET_ID
    CONSUMABLES_MASTER_SPREADSHEET_ID = _TEST_CONSUMABLES_MASTER_ID
    CONSUMABLES_OUTBOUND_SPREADSHEET_ID = _TEST_CONSUMABLES_OUTBOUND_ID
    TONER_SPREADSHEET_ID = _TEST_TONER_ID
else:
    # 로컬 개발 환경 (development): 테스트 시트 ID가 있으면 쓰고, 없으면 운영 시트 ID로 fallback
    SPREADSHEET_ID = _TEST_SPREADSHEET_ID or _PROD_SPREADSHEET_ID
    CONSUMABLES_MASTER_SPREADSHEET_ID = _TEST_CONSUMABLES_MASTER_ID or _PROD_CONSUMABLES_MASTER_ID
    CONSUMABLES_OUTBOUND_SPREADSHEET_ID = _TEST_CONSUMABLES_OUTBOUND_ID or _PROD_CONSUMABLES_OUTBOUND_ID
    TONER_SPREADSHEET_ID = _TEST_TONER_ID or _PROD_TONER_ID

# TEST ID 설정 여부 (프론트엔드 상태 표시용)
TEST_SHEETS_CONFIGURED = bool(
    _TEST_SPREADSHEET_ID and
    _TEST_CONSUMABLES_MASTER_ID and
    _TEST_CONSUMABLES_OUTBOUND_ID and
    _TEST_TONER_ID
)

# 운영/테스트 ID를 명시적으로 노출 (sync 스크립트에서 사용)
PROD_SHEET_IDS = {
    "assets":               _PROD_SPREADSHEET_ID,
    "consumables_master":   _PROD_CONSUMABLES_MASTER_ID,
    "consumables_outbound": _PROD_CONSUMABLES_OUTBOUND_ID,
    "toner":                _PROD_TONER_ID,
}
TEST_SHEET_IDS = {
    "assets":               _TEST_SPREADSHEET_ID,
    "consumables_master":   _TEST_CONSUMABLES_MASTER_ID,
    "consumables_outbound": _TEST_CONSUMABLES_OUTBOUND_ID,
    "toner":                _TEST_TONER_ID,
}

# Validate before any Google client can be constructed.
_STAGING_ALLOWED_IDS = frozenset(TEST_SHEET_IDS.values())
_PROTECTED_PRODUCTION_IDS = CANONICAL_PRODUCTION_SHEET_IDS | frozenset(
    value.strip() for value in PROD_SHEET_IDS.values()
)
if IS_STAGING:
    if any(not value or value != value.strip() for value in TEST_SHEET_IDS.values()):
        raise ValueError("Staging requires four non-empty TEST sheet IDs without whitespace")
    if len(_STAGING_ALLOWED_IDS) != 4:
        raise ValueError("Staging requires four distinct TEST sheet IDs")
    if _STAGING_ALLOWED_IDS & _PROTECTED_PRODUCTION_IDS:
        raise ValueError("Staging cannot use any production spreadsheet ID")


def validate_sheet_access(spreadsheet_id):
    """Fail closed for staging: only explicitly configured copies are accessible."""
    if IS_STAGING and spreadsheet_id not in _STAGING_ALLOWED_IDS:
        raise ValueError("Staging access denied: spreadsheet is not a configured test copy")


# Service Account JSON 키 파일 (로컬용)
GOOGLE_CREDENTIALS_FILE = os.environ.get("GOOGLE_CREDENTIALS_FILE", "data/st-asset-project-8000c6bb9905.json")
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
    "Rental": "Rental_List",
}

# 자산 테이블별 주요 컬럼 매핑
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
    "Rental": ["NO", "대여자 이름", "대여자 이메일", "품목명", "대여 일자", "반납 예정일", "실제 반납일", "상태", "비고"],
}

# Streamlit 페이지 설정
PAGE_TITLE = "사내 자산 & 소모품 관리 시스템"
LAYOUT = "wide"

# 토너 시트 특정 탭 GID
TONER_SHEET_GID = 394456635

# 소모품 필수 품목 재고 임계값
CONSUMABLES_DEFAULT_THRESHOLD = 5

# 로깅 설정
LOG_LEVEL = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL
