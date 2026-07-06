# 스타일 리뷰

## 리뷰 개요
- **스타일 수준 평가**: 🟡 보통 (컨벤션 불일치 및 중복 정의 발견)
- **총 발견 수**: Critical 0 / High 1 / Medium 2 / Low 2

## 스타일 및 컨벤션 발견 사항

### 🔴 High
1. **[config.py, sheets_service.py, database.py]** — 설정 상수 및 매핑의 중복 정의 (DRY 위반)
   - **이유**: `sheets_service.py`와 `database.py`에서 `config.py` 임포트 실패(ImportError) 시 폴백(fallback)용으로 `SHEET_MAPPING` 등을 각 파일 내부에 하드코딩으로 중복 정의하고 있습니다. 이는 코드가 변경될 때 누락을 발생시켜 가독성과 유지보수성을 크게 해칩니다.
   - **해결책**: 폴백용 중복 하드코딩 코드를 모두 제거하고, 프로젝트 루트의 `config.py`를 단일 진실 공급원(Single Source of Truth)으로 삼아 절대 경로 임포트(`from backend.config` 등)가 항상 보장되도록 `sys.path` 설정을 패키지 레벨(`__init__.py` 등)에서 공통으로 처리해야 합니다.

### 🟡 Medium
1. **[backend/services/consumables_service.py:131]** — 로컬 임포트 사용
   - **이유**: 함수 내에서 `import json as _json`과 같이 로컬 임포트를 사용하고 있습니다. 특별한 순환 참조 문제가 아니라면 Python PEP 8 규격에 따라 파일 상단에 모아 임포트하는 것이 가독성에 좋습니다.
   - **해결책**: 파일 최상단으로 임포트를 이동하십시오.

2. **[프로젝트 전반]** — 로깅 방식의 불일치 (`print` vs `logger`)
   - **이유**: `database.py`와 `consumables_service.py`에서는 에러 발생 시 `print("⚠️ ...")`를 사용하고 있고, `sheets_service.py`에서는 `logger.error("...")`를 사용하고 있어 로그 출력 방식이 통일되지 않았습니다. FastAPI 백엔드 운영 환경에서는 `print`문이 적절하게 캡처되지 않거나 포맷팅을 잃을 수 있습니다.
   - **해결책**: 모든 콘솔/로그 출력을 `logging` 모듈의 `logger` 인스턴스로 일원화하십시오.

### 🟢 Low / Informational
1. **[config.py:35-38]** — 상수 네이밍 규칙
   - **이유**: 모듈 내부용 상수를 뜻하는 접두사 언더스코어(`_`)와 대문자(`_PROD_SPREADSHEET_ID`)를 조합하여 사용하고 있습니다. Python의 표준 상수 컨벤션은 `PROD_SPREADSHEET_ID` 형태를 따릅니다.
