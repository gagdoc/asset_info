# ARCHITECTURE.md — 시스템 아키텍처

> 모듈 구조, 의존성 방향, 레이어 경계를 정의합니다.
> 기능 스펙은 `docs/product-specs/`, 실행 계획은 `docs/exec-plans/`를 참조하세요.

---

## 전체 구조 다이어그램

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React SPA)                   │
│  pages/        components/        utils/                 │
│  Dashboard     Sidebar            exportUtils.jsx        │
│  AssetList     ConfirmModal                              │
│  Consumables   LoadingModal                              │
│  NewHire       SearchableSelect                          │
│  Resign        Toast                                     │
│  BulkSearch    ErrorBoundary                             │
│  SelfOutbound                                            │
│  DeptConfig                                              │
│  ExcelUpload                                             │
└──────────────────────┬──────────────────────────────────┘
                       │  HTTP/JSON (Axios)
                       │  /api/assets/...
                       │  /api/consumables/...
┌──────────────────────▼──────────────────────────────────┐
│                  FastAPI (backend/)                      │
│                                                          │
│  main.py                                                 │
│  ├── CORS Middleware                                     │
│  ├── No-Cache Middleware (API 응답)                      │
│  ├── routers/assets.py      → prefix: /api/assets       │
│  └── routers/consumables.py → prefix: /api/consumables  │
│                                                          │
│  services/                                               │
│  ├── assets_service.py    (자산 비즈니스 로직)            │
│  ├── consumables_service.py (소모품 비즈니스 로직)        │
│  ├── sheets_service.py    (Google Sheets 공통 클라이언트) │
│  └── database.py          (레거시 SQLite — 신규 미사용)   │
└──────────────────────┬──────────────────────────────────┘
                       │  gspread (Google Sheets API)
┌──────────────────────▼──────────────────────────────────┐
│               Google Sheets (데이터 저장소)               │
│                                                          │
│  [자산 시트]          [소모품 마스터]    [출고 내역]       │
│  All_User             마스터리스트       2026년1월         │
│  Lease_List           재고리스트         2026년2월 ...    │
│  Ipad_List                                               │
│  Monitor              [토너 재고]       [입고이력]        │
│  Printer              토너재고시트       입고이력 탭       │
│  TeamsNumber                                             │
│  신규입사자                                               │
│  퇴사자                                                  │
│  Dept_Config                                             │
└─────────────────────────────────────────────────────────┘
```

---

## 레이어 의존성 규칙

```
pages/components  →  (Axios)  →  routers  →  services  →  sheets_service
                                                        →  (config.py)
```

- **단방향**: 상위 레이어가 하위 레이어를 호출. 역방향 금지.
- **routers → services**: 라우터는 HTTP 파라미터 파싱·검증만. 비즈니스 로직은 반드시 services로 분리.
- **services → sheets_service**: 모든 Sheets 접근은 sheets_service를 거친다.
- **config.py**: 모든 레이어에서 import 가능한 전역 상수 모음.

---

## 백엔드 모듈 상세

### `backend/main.py`
- FastAPI 앱 초기화
- CORS 설정 (localhost:5173, 5174)
- API 캐시 방지 미들웨어
- React SPA 서빙 (빌드된 `frontend/dist/`)

### `backend/routers/assets.py` — `/api/assets`
| 엔드포인트 | 메서드 | 역할 |
|-----------|--------|------|
| `/dashboard` | GET | 대시보드 요약 카드 |
| `/dashboard/integrated` | GET | 전체 임직원 통합뷰 (캐시 60초) |
| `/bulk-search` | POST | 이메일/이름 대량 검색 |
| `/{asset_type}` | GET | 자산 목록 조회 |
| `/{asset_type}/download` | GET | Excel 다운로드 |
| `/row/update` | PUT | 행 수정 |
| `/row/delete` | DELETE | 행 삭제 |
| `/row/add` | POST | 행 추가 |
| `/newhire/register` | POST | 신규 입사자 등록 |
| `/resign/register` | POST | 퇴사자 등록 |
| `/resign/return` | POST | 자산 반납 처리 |
| `/config/dept` | GET/POST/DELETE | 부서 설정 |

### `backend/routers/consumables.py` — `/api/consumables`
| 엔드포인트 | 메서드 | 역할 |
|-----------|--------|------|
| `/months` | GET/POST | 월별 시트 관리 |
| `/items` | GET/POST/DELETE | 소모품 품목 관리 |
| `/outbound` | GET/POST/PUT/DELETE | 출고 내역 CRUD |
| `/estimate` | GET | 견적서 데이터 |
| `/estimate/download` | GET | 견적서 Excel 다운로드 |
| `/toner-inventory` | GET/PUT | 토너 재고 관리 |
| `/tonner-consignment` | GET | 위탁 토너 내역 |
| `/inbound` | GET/POST/PUT/DELETE | 입고 이력 CRUD |
| `/inventory-report` | GET | 입출고 현황 리포트 |

### `backend/services/sheets_service.py`
- Google 인증 처리 (로컬: JSON 파일, Cloud Run: 환경변수)
- gspread 클라이언트 싱글톤 관리
- 시트 읽기/쓰기/행추가/행삭제 공통 함수 제공

### `config.py`
- Spreadsheet ID 4개 (자산, 소모품 마스터, 출고내역, 토너)
- SHEET_MAPPING: Excel 시트명 → 내부 키 매핑
- COLUMN_MAPPING: 자산 유형별 컬럼명 옵션 (여러 명칭 허용)
- DEFAULT_SCHEMAS: 시트 초기 생성 시 헤더

---

## 프론트엔드 모듈 상세

### 라우팅 구조 (`App.jsx`)
```
/                   → redirect → /dashboard
/dashboard          → Dashboard.jsx
/assets/:type       → AssetList.jsx  (type: lease, ipad, monitor, printer, teams)
/consumables        → Consumables.jsx
/newhire            → NewHire.jsx
/resign             → Resign.jsx
/bulk-search        → BulkSearch.jsx
/config             → DeptConfig.jsx
/upload             → ExcelUpload.jsx
/register           → SelfOutbound.jsx  (사이드바 없음, 외부 공개)
```

### 공통 컴포넌트 (`components/`)
| 파일 | 역할 |
|------|------|
| `Sidebar.jsx` | 좌측 네비게이션 메뉴 |
| `Toast.jsx` | 전역 알림 (Context 기반) |
| `ConfirmModal.jsx` | 삭제 확인 다이얼로그 |
| `LoadingModal.jsx` | API 호출 중 로딩 오버레이 |
| `SearchableSelect.jsx` | 검색 가능한 드롭다운 |
| `ErrorBoundary.jsx` | React 에러 바운더리 |

### 유틸 (`utils/`)
| 파일 | 역할 |
|------|------|
| `exportUtils.jsx` | CSV / Excel 클라이언트 사이드 내보내기 |

---

## 배포 파이프라인

```
로컬 개발
    │
    ├── uvicorn backend.main:app (포트 8000)
    └── npm run dev (포트 5173, /api → 8000 프록시)
    │
    ▼ git commit & push
GitHub (origin/main)
    │
    ▼ ./deploy.sh
  1. gcloud 인증 (data/*.json 서비스 계정)
  2. GitHub clone → 임시 디렉토리
  3. gcloud run deploy --source (Cloud Build로 Docker 빌드)
  4. Cloud Run 배포 (asia-northeast3)
  5. 임시 디렉토리 정리
    │
    ▼
Cloud Run: https://asset-info-1015498761413.asia-northeast3.run.app
```

---

## 환경 변수

| 변수 | 용도 | 설정 위치 |
|------|------|-----------|
| `GOOGLE_CREDENTIALS_JSON` | 서비스 계정 키 (JSON 문자열) | Cloud Run 환경변수 |
| `ALLOWED_ORIGIN` | 추가 CORS 허용 도메인 | 선택적 |
| `PORT` | 서버 포트 (Cloud Run 자동 설정) | Cloud Run 자동 |

로컬에서는 `data/st-asset-project-*.json` 파일을 직접 사용 (`config.py`의 `GOOGLE_CREDENTIALS_FILE`).
