# AGENTS.md — AI 에이전트 컨텍스트 가이드

> 이 파일은 Claude Code, Cowork 등 AI 에이전트가 이 프로젝트를 처음 접할 때
> 가장 먼저 읽어야 하는 핵심 문서입니다.
> 자세한 내용은 `ARCHITECTURE.md`와 `docs/` 폴더를 참조하세요.

---

## 1. 이 프로젝트가 무엇인가

**사내 IT 자산 & 소모품 통합 관리 웹 앱** (내부용, 단일 팀 운영)

- 노트북·아이패드·모니터·프린터·Teams 번호 등 자산을 추적한다
- 소모품(토너, 마우스 등) 입출고 재고를 관리한다
- 신규 입사자 등록 / 퇴사자 자산 반납 처리를 담당한다
- 실제 데이터는 **Google Sheets**에 저장된다 (DB가 아님 — 아래 핵심 제약 참고)

운영 URL: `https://asset-info-1015498761413.asia-northeast3.run.app/dashboard`

---

## 2. 기술 스택 한눈에

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | React 18 + Vite, React Router, Axios |
| 백엔드 | FastAPI (Python 3.11), uvicorn |
| 데이터 저장소 | **Google Sheets** (gspread + google-auth) |
| 배포 | Docker → Google Cloud Run (asia-northeast3) |
| CI/CD | `deploy.sh` 로컬 실행 (GitHub clone → Cloud Run 직접 배포) |

---

## 3. 절대 지켜야 할 핵심 제약

### 🔴 데이터는 Google Sheets가 진실의 원천(Source of Truth)
- SQLite(`.db`) 파일은 과거 잔재이며 현재는 사용하지 않는다
- 모든 읽기/쓰기는 `backend/services/sheets_service.py` 또는 `consumables_service.py`를 통해 Google Sheets API로 이루어진다
- `.db` 파일을 신규 기능에 사용하지 말 것

### 🔴 커밋 금지 파일
```
data/*.json     # Google 서비스 계정 키 — 절대 커밋 금지
*.db            # SQLite 데이터베이스
*.xlsx          # 엑셀 파일 (template.xlsx 제외)
```

### 🔴 배포는 반드시 GitHub 기준
- `deploy.sh`는 GitHub에서 clone 후 배포한다
- 로컬 미커밋 변경사항은 배포에 반영되지 않는다
- **반드시**: 로컬 확인 → `git commit` → `git push` → `./deploy.sh` 순서로 진행

### 🔴 Dockerfile이 복사하는 파일만 컨테이너에 포함됨
```dockerfile
COPY backend/       # Python 백엔드
COPY frontend/      # React 빌드 결과
COPY config.py      # 전역 설정
COPY requirements.txt
COPY template.xlsx  # 견적서 템플릿
```
문서(.md), 스크립트, `.agents/` 등은 컨테이너에 포함되지 않는다.

---

## 4. 프로젝트 구조 요약

```
ASSET_INFO/
├── AGENTS.md               ← 지금 이 파일
├── ARCHITECTURE.md         ← 모듈 구조 상세
├── CLAUDE.md               ← 개발 워크플로우 (Step 1~3)
├── config.py               ← 전역 설정 (Spreadsheet ID, 컬럼 매핑 등)
├── backend/
│   ├── main.py             ← FastAPI 앱 엔트리포인트
│   ├── routers/
│   │   ├── assets.py       ← 자산 관리 API (/api/assets/...)
│   │   └── consumables.py  ← 소모품 API (/api/consumables/...)
│   └── services/
│       ├── assets_service.py       ← 자산 비즈니스 로직
│       ├── consumables_service.py  ← 소모품 비즈니스 로직
│       ├── sheets_service.py       ← Google Sheets 공통 레이어
│       └── database.py             ← (레거시) SQLite 핸들러
├── frontend/src/
│   ├── App.jsx             ← 라우팅 루트
│   ├── pages/              ← 페이지별 컴포넌트 (9개)
│   ├── components/         ← 공통 컴포넌트 (5개)
│   └── utils/
│       └── exportUtils.jsx ← CSV/Excel 내보내기 유틸
├── docs/                   ← 기능 스펙 / 실행 계획 / 레퍼런스
├── Dockerfile
├── deploy.sh
└── requirements.txt
```

---

## 5. 데이터 흐름

```
사용자 브라우저
    │  HTTP (Axios)
    ▼
FastAPI (backend/main.py)
    │  router 분기
    ├─ /api/assets/...      → assets.py → assets_service.py
    └─ /api/consumables/... → consumables.py → consumables_service.py
                                    │
                                    ▼
                            sheets_service.py
                                    │  gspread API
                                    ▼
                            Google Sheets (실제 데이터)
```

---

## 6. 페이지 ↔ API ↔ Sheets 매핑

| 페이지 | 컴포넌트 | API prefix | 주요 Sheets |
|--------|----------|------------|-------------|
| 대시보드 | Dashboard.jsx | `/api/assets/dashboard` | All_User, Lease, iPad 등 |
| 자산 목록 | AssetList.jsx | `/api/assets/{type}` | Lease_List, Ipad_List 등 |
| 소모품 | Consumables.jsx | `/api/consumables/...` | 소모품 마스터, 출고내역 |
| 신규 입사자 | NewHire.jsx | `/api/assets/newhire/...` | All_User, 신규입사자 |
| 퇴사자 관리 | Resign.jsx | `/api/assets/resign/...` | 퇴사자, All_User |
| 대량 검색 | BulkSearch.jsx | `/api/assets/bulk-search` | All_User + 자산 전체 |
| 자가 출고 | SelfOutbound.jsx | `/api/consumables/...` | 소모품 출고내역 |
| Excel 업로드 | ExcelUpload.jsx | `/api/assets/upload` | 전체 Sheets |
| 부서 설정 | DeptConfig.jsx | `/api/assets/config/...` | Dept_Config |

---

## 7. Google Sheets 구성

| 용도 | Spreadsheet ID (config.py 참고) |
|------|---------------------------------|
| 자산 전체 (All_User, Lease 등) | `SPREADSHEET_ID` |
| 소모품 마스터 + 재고 요약 | `CONSUMABLES_MASTER_SPREADSHEET_ID` |
| 소모품 출고 내역 (월별 탭) | `CONSUMABLES_OUTBOUND_SPREADSHEET_ID` |
| 토너 재고 전용 | `TONER_SPREADSHEET_ID` |

---

## 8. 새 기능 추가 시 체크리스트

- [ ] `config.py`에 새 상수가 필요한가?
- [ ] 백엔드: `routers/`에 엔드포인트 추가 → `services/`에 비즈니스 로직 분리
- [ ] 프론트엔드: `pages/` 또는 `components/`에 컴포넌트 추가
- [ ] 새 Sheets 탭 필요 시 헤더 자동 생성 로직 포함할 것
- [ ] `docs/exec-plans/active/`에 스펙 문서 작성 후 작업 시작
- [ ] 완료 후 `docs/exec-plans/completed/`으로 이동

---

## 9. 자주 하는 실수 & 해결법

| 실수 | 원인 | 해결 |
|------|------|------|
| 배포 후 변경사항 미반영 | git push 안 함 | `git status` → commit → push → deploy |
| `index.lock` 오류 | 이전 git 프로세스 잔재 | `rm .git/index.lock` |
| 소모품 API 400 오류 | 수량 값이 문자열로 전달됨 | `int(str(qty).replace(",",""))` 패턴 사용 |
| 토너 재고 미차감 | name_col 매칭 실패 | `lower()` 비교, `토너_품번` 헤더 확인 |
| Cloud Run 빌드 실패 | devDependency 누락 | `npm ci --include=dev` 확인 |
