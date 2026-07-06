# 아키텍처 리뷰

## 리뷰 개요
- **아키텍처 건강 수준**: 🟡 개선 필요 (일부 서비스 간 결합도 상승 및 중복 구현 존재)
- **아키텍처 패턴**: Layered Architecture (FastAPI Routers -> Services -> Database/Sheets API)
- **총 발견 수**: 🔴 1 / 🟡 1 / 🟢 2

## 구조적 발견 사항

### 🔴 구조적 문제 (High)
1. **[backend/services/consumables_service.py]** — Google Sheets API 인증 로직 중복 구현 (DRY 및 단일 책임 원칙(SRP) 위반)
   - **문제**: `sheets_service.py`가 구글 시트 연동을 위한 독립 서비스 레이어로 이미 존재함에도 불구하고, `consumables_service.py` 파일 내부에 독자적인 `_get_consumables_client` 및 `SCOPES` 상수 정의 등 구글 Sheets 인증과 클라이언트 초기화 로직이 100% 동일하게 중복 구현되어 있습니다.
   - **영향**: 향후 인증 정보 주입 방식이 바뀌거나 구글 API 스코프가 변경될 때 두 파일 모두를 수정해야 하며, 한 쪽이 누락되는 경우 버그가 발생하게 됩니다.
   - **리팩토링 제안**:
     - `consumables_service.py` 내의 독자적인 `gspread` 인증 로직을 전면 제거합니다.
     - `sheets_service.py`에 스프레드시트 ID를 파라미터로 넘겨 클라이언트 또는 스프레드시트 객체를 획득하는 범용 헬퍼 함수(`get_spreadsheet_by_id(spreadsheet_id)`)를 선언하고, `consumables_service.py`는 이 함수를 임포트하여 의존하도록 단방향 결합으로 변경하십시오.
   - **단계**:
     - 1단계: `sheets_service.py` 내에 ID를 인자로 받는 공통 spreadsheet 팩토리 함수 노출.
     - 2단계: `consumables_service.py`에서 자체 인증 코드 삭제 및 `sheets_service` 함수 호출로 변경.

### 🟡 설계 개선 (Medium)
1. **[backend/services/database.py]** — 데이터 저장소 도메인 결합도 증가
   - **문제**: `database.py`는 SQLite DB 백업 및 로드를 위한 데이터 영속성 레이어여야 하지만, 구글 시트와의 하이브리드 결합으로 인해 `load_from_sheets`, `update_sheet` 등의 상위 구글 시트 비즈니스 서비스를 직접 임포트하여 호출하고 있습니다. 또한 `SHEET_MAPPING` 등 설정 관련 구조도 일부 중복 구현되어 있습니다.
   - **리팩토링 제안**: 데이터 영속 레이어를 데이터베이스(SQLite) 전용 모듈과 구글 시트 전용 모듈로 완벽히 경계를 긋고, 상위 비즈니스 서비스(예: `assets_service.py` 등)에서 이 두 레이어의 데이터 조합 및 폴백 정책을 조율(Orchestration)하도록 구조적 책임을 상위로 양도하십시오.

### 🟢 참고 및 칭찬 사항 (Good)
1. **SQLite 하이브리드 폴백 구조 칭찬 (database.py:106)**
   - **구조**: 구글 시트 로드 실패 시 무조건 에러를 뿜는 대신, 로컬 SQLite 캐시 데이터로 유연하게 복원되는 오프라인 퍼스트 디자인이 훌륭하게 설계되어 있습니다. 이 덕분에 구글 서버 장애나 API Rate Limit으로 인한 타임아웃 상황에서도 전체 관리자 웹페이지가 마비되는 현상을 효과적으로 방지할 수 있습니다.
2. **로컬 시트 에뮬레이션 아키텍처 도입 (local_sheets.py)**
   - **구조**: 개발 환경(`IS_PRODUCTION = False`)에서 불필요하게 구글 API 실서버를 찌르는 대신, 로컬 JSON 파일을 스프레드시트처럼 취급해 주는 `local_sheets.py` 에뮬레이터를 구조적으로 이격하여 활용하는 방식은 개발 생산성을 높이는 모범적인 아키텍처 설계 방식입니다.

## SOLID 원칙 평가
| 원칙 | 상태 | 주요 위반 | 비고 |
|------|------|---------|------|
| S — SRP | ⚠️ 주의 | `consumables_service` 내부에 인증 및 비즈니스 로직 동시 상주 | 시트 연동 로직 분리 필요 |
| O — OCP | ✅ 양호 | | 자산 유형 추가에 대처 가능한 매핑 설계 구조 |
| L — LSP | ✅ 양호 | | 상속 구조 미사용으로 해당 없음 |
| I — ISP | ✅ 양호 | | 비대해진 공통 인터페이스 없음 |
| D — DIP | ⚠️ 주의 | `database.py`가 하위 구글 시트 모듈에 직접 결합 | 결합도 분리 권고 |
