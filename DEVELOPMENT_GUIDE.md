# 📦 사내 자산 & 소모품 관리 시스템 — 종합 개발 가이드

> **최종 업데이트**: 2026-04-06
> **버전**: 2.0
> **대상**: 이 프로젝트를 개발·유지보수하는 모든 개발자 및 AI 어시스턴트

---

## 📋 목차

1. [프로젝트 개요 및 목적](#1-프로젝트-개요-및-목적)
2. [기술 스택](#2-기술-스택)
3. [전체 아키텍처 구조](#3-전체-아키텍처-구조)
4. [프로젝트 디렉토리 구조](#4-프로젝트-디렉토리-구조)
5. [로컬 개발 환경 설정](#5-로컬-개발-환경-설정)
6. [백엔드 개발 가이드](#6-백엔드-개발-가이드)
7. [프론트엔드 개발 가이드](#7-프론트엔드-개발-가이드)
8. [데이터베이스 설계](#8-데이터베이스-설계)
9. [데이터 흐름 (Data Flow)](#9-데이터-흐름-data-flow)
10. [API 레퍼런스](#10-api-레퍼런스)
11. [환경 변수 / 설정 관리](#11-환경-변수--설정-관리)
12. [GitHub 업로드 가이드](#12-github-업로드-가이드)
13. [Google Cloud Run 배포 가이드](#13-google-cloud-run-배포-가이드)
14. [기능별 개발 방향 로드맵](#14-기능별-개발-방향-로드맵)
15. [개발 팁 & 주의사항](#15-개발-팁--주의사항)
16. [AI 협업 가이드](#16-ai-협업-가이드)
17. [자주 묻는 질문 (FAQ)](#17-자주-묻는-질문-faq)

---

## 1. 프로젝트 개요 및 목적

### 🎯 앱의 목적

이 애플리케이션은 **중소규모 IT 조직의 사내 자산과 소모품을 효율적으로 통합 관리**하기 위해 구축된 내부용 웹 시스템입니다.

기존에는 Excel 파일을 공유 드라이브에 올려 여러 명이 수동으로 수정하는 방식이었으나, 이로 인한 **데이터 충돌, 판본 불일치, 미반납 자산 누락** 문제가 발생했습니다. 이 앱은 이러한 문제를 해결하기 위해 개발되었습니다.

### 📌 핵심 기능 요약

| 기능 | 설명 | 주요 페이지 |
|------|------|------------|
| **대시보드** | 전체 자산 현황 요약 카드 + 전 임직원 통합 뷰 | `Dashboard.jsx` |
| **자산 관리** | 노트북·아이패드·모니터·프린터·Teams 번호 CRUD | `AssetList.jsx` |
| **신규 입사자** | 입사자 등록 + All_User 마스터 자동 동기화 | `NewHire.jsx` |
| **퇴사자 관리** | 퇴사 등록, 자산별 반납 처리, 마스터 삭제 | `Resign.jsx` |
| **소모품 관리** | 재고 추적, 입출고 내역, 재고 부족 알림 | `Consumables.jsx` |
| **Excel 업로드** | 기존 Excel 파일로 전체 데이터 일괄 갱신 | `ExcelUpload.jsx` |
| **부서 설정** | BU/ROLE 코드 추가·삭제 | `DeptConfig.jsx` |
| **자가 출고** | 부서별 소모품 자가 출고 등록 (외부 공개 URL) | `SelfOutbound.jsx` |

### 🔗 서비스 URL

| 환경 | URL |
|------|-----|
| **로컬 프론트엔드** | `http://localhost:5173` |
| **로컬 API 문서** | `http://localhost:8000/docs` |
| **운영 (Cloud Run)** | `https://asset-info-1015498761413.asia-northeast3.run.app/dashboard` |

---

## 2. 기술 스택

### 백엔드

| 항목 | 기술 | 비고 |
|------|------|------|
| 웹 프레임워크 | **FastAPI** | Python 기반 고성능 비동기 REST API |
| 언어 | Python 3.11+ | |
| 데이터 처리 | pandas | DataFrame 기반 테이블 처리 |
| 주 DB | **Google Sheets** | 실시간 동기화, 운영 데이터 원본 |
| 보조 DB | **SQLite** (`asset_database.db`) | Google Sheets 폴백 + 로컬 개발용 |
| 소모품 DB | **SQLite** (`consumables.db`) | 소모품 전용 분리 DB |
| Sheets 인증 | gspread + google-auth | 서비스 계정 키 JSON |
| 서버 | uvicorn | ASGI 서버 |

### 프론트엔드

| 항목 | 기술 | 비고 |
|------|------|------|
| UI 프레임워크 | **React 19** | |
| 빌드 툴 | **Vite 7** | 번들링 및 개발 서버 |
| 라우팅 | react-router-dom v7 | SPA 라우팅 |
| HTTP 클라이언트 | axios | API 통신 |
| 서버 상태 관리 | @tanstack/react-query v5 | 캐싱 및 자동 리페치 |
| 아이콘 | react-icons | |
| 날짜 처리 | date-fns | |
| 스타일 | **Vanilla CSS** (`index.css`) | 별도 CSS 프레임워크 없음 |

### 인프라 & 배포

| 항목 | 기술 | 비고 |
|------|------|------|
| 컨테이너 | **Docker** (multi-stage build) | Frontend Build → FastAPI Serve |
| 클라우드 | **Google Cloud Run** | 서버리스, 자동 스케일링 |
| 리전 | `asia-northeast3` (Seoul) | |
| 이미지 레지스트리 | Artifact Registry (자동) | `gcloud run deploy --source` 이용 |
| 소스 제어 | **GitHub** | `main` 브랜치가 운영 기준 |
| 데이터 연동 | **Google Sheets API** | 실시간 양방향 동기화 |

---

## 3. 전체 아키텍처 구조

```
┌──────────────────────────────────────────────────┐
│                  사용자 브라우저                    │
│         React SPA (Vite 번들 / Port 5173)         │
└──────────────────┬───────────────────────────────┘
                   │ HTTP / REST API (axios)
                   ▼
┌──────────────────────────────────────────────────┐
│              FastAPI 백엔드 (Port 8000)            │
│   ┌────────────┐  ┌────────────────────────────┐ │
│   │ assets.py  │  │    consumables.py           │ │
│   │ (자산 API) │  │    (소모품 API)              │ │
│   └─────┬──────┘  └──────────┬─────────────────┘ │
│         │                    │                    │
│   ┌─────▼────────────────────▼──────────────────┐│
│   │       backend/services/                      ││
│   │  ┌──────────────┐  ┌─────────────────────┐  ││
│   │  │ database.py  │  │ sheets_service.py    │  ││
│   │  │ (SQLite CRUD)│  │ (Google Sheets I/O)  │  ││
│   │  └──────────────┘  └─────────────────────┘  ││
│   └─────────────────────────────────────────────┘│
└──────────────────┬───────────────────────────────┘
                   │
       ┌───────────┴────────────┐
       │                        │
       ▼                        ▼
┌─────────────┐       ┌──────────────────┐
│ SQLite DB   │       │  Google Sheets   │
│ (로컬 폴백)  │       │  (운영 데이터)    │
│ asset_      │       │  - 자산 마스터   │
│ database.db │       │  - 소모품 마스터 │
│ consumables │       │  - 출고 내역     │
│ .db         │       └──────────────────┘
└─────────────┘
```

### 데이터 저장 우선순위

```
읽기:  Google Sheets (1순위) → SQLite (폴백)
쓰기:  Google Sheets + SQLite (동시 저장, Sheets 실패 시 SQLite만)
```

---

## 4. 프로젝트 디렉토리 구조

```
ASSET_INFO/
│
├── backend/                         # FastAPI 백엔드
│   ├── main.py                      # 앱 진입점, CORS, 라우터 등록, React 정적 파일 서빙
│   ├── routers/
│   │   ├── assets.py                # 자산·신규입사·퇴사·부서설정 API (모든 REST 엔드포인트)
│   │   └── consumables.py           # 소모품 API
│   └── services/
│       ├── database.py              # DB 연결, 로드/저장 (Sheets → SQLite 폴백 로직)
│       ├── sheets_service.py        # Google Sheets API 연동 (Batch Get, 타임아웃 처리)
│       └── consumables_service.py   # 소모품 전용 DB 비즈니스 로직
│
├── frontend/                        # React 프론트엔드
│   ├── src/
│   │   ├── main.jsx                 # React 앱 마운트 진입점
│   │   ├── App.jsx                  # 라우팅 설정 (Routes / Route 정의)
│   │   ├── index.css                # 전역 디자인 시스템 (CSS 변수, 컴포넌트 스타일)
│   │   ├── components/
│   │   │   ├── Sidebar.jsx          # 네비게이션 사이드바
│   │   │   ├── Toast.jsx            # 토스트 알림 (Context + Hook)
│   │   │   ├── ConfirmModal.jsx     # 삭제/확인 모달
│   │   │   ├── LoadingModal.jsx     # 로딩 오버레이
│   │   │   └── SearchableSelect.jsx # 드롭다운 검색 선택 컴포넌트
│   │   └── pages/
│   │       ├── Dashboard.jsx        # 대시보드 (요약 카드 + 통합 임직원 뷰)
│   │       ├── AssetList.jsx        # 자산 목록 (URL param으로 타입 구분)
│   │       ├── NewHire.jsx          # 신규 입사자 등록
│   │       ├── Resign.jsx           # 퇴사자 관리
│   │       ├── Consumables.jsx      # 소모품 재고 관리 & 출고 내역
│   │       ├── DeptConfig.jsx       # BU/ROLE 코드 관리
│   │       ├── ExcelUpload.jsx      # Excel 파일 일괄 업로드
│   │       └── SelfOutbound.jsx     # 부서별 소모품 자가 출고 (공개 URL)
│   ├── package.json
│   └── vite.config.js
│
├── config.py                        # ★ 전역 설정값 (DB 경로, Sheet ID, 자산 타입 등)
├── Dockerfile                       # Docker 멀티스테이지 빌드 정의
├── deploy.sh                        # GCP Cloud Run 자동 배포 스크립트
├── deployment_config.json           # 배포 대상 프로젝트/서비스 설정
├── requirements.txt                 # Python 의존성 목록
├── .env.example                     # 환경 변수 템플릿
├── .gitignore                       # Git 제외 파일 목록
│
├── data/                            # 🔒 로컬 전용 (Git 제외)
│   └── st-asset-project-*.json      # Google 서비스 계정 키 (비공개!)
│
├── asset_database.db                # SQLite 메인 DB (로컬 개발/폴백용)
├── consumables.db                   # SQLite 소모품 DB
│
└── DEVELOPMENT_GUIDE.md             # ★ 이 문서 (개발 기준 문서)
```

> **⚠️ 중요**: `data/` 폴더의 서비스 계정 키 JSON과 `.db` 파일은 절대 GitHub에 업로드하지 마십시오.

---

## 5. 로컬 개발 환경 설정

### 사전 요구사항

| 도구 | 버전 | 확인 명령 |
|------|------|-----------|
| Python | 3.11 이상 | `python3 --version` |
| Node.js | 18 이상 (LTS 권장) | `node --version` |
| npm | 9 이상 | `npm --version` |
| gcloud CLI | 최신 | `gcloud --version` |

---

### 5-1. 백엔드 실행

```bash
# 프로젝트 루트에서 실행

# 1. 가상환경 생성 및 활성화
python3 -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows

# 2. 의존성 설치
pip install -r requirements.txt

# 3. FastAPI 개발 서버 시작 (코드 변경 시 자동 재시작)
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

✅ `http://localhost:8000/docs` → Swagger UI로 모든 API 확인 가능

---

### 5-2. 프론트엔드 실행

```bash
cd frontend

# 의존성 설치 (최초 1회)
npm install

# Vite 개발 서버 시작
npm run dev
```

✅ `http://localhost:5173` 에서 React 앱 확인

---

### 5-3. Google Sheets 연동 (로컬)

```bash
# 1. data/ 폴더에 서비스 계정 키 JSON 파일 배치
#    (config.py의 GOOGLE_CREDENTIALS_FILE 경로와 일치해야 함)

# 2. config.py 파일에서 스프레드시트 ID 확인
SPREADSHEET_ID = "1__8NXfK6ruhlQtnomhIi_sjdkHgLD0C2N1Mw4P3GW7g"

# Sheets 인증 없이 실행하면 자동으로 로컬 SQLite 사용
```

---

### 5-4. 두 서버 동시 실행 (권장 개발 방법)

터미널 탭을 2개 열어 각각 실행합니다.

```
터미널 1: uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
터미널 2: cd frontend && npm run dev
```

- 프론트엔드에서 API 요청 시 `baseURL: http://localhost:8000` 으로 직접 통신합니다.
- Vite 프록시 설정 없이 axios `baseURL`을 직접 지정하는 방식입니다.

---

## 6. 백엔드 개발 가이드

### 6-1. 새 API 엔드포인트 추가

**① 기존 라우터에 추가** (권장 방식)

```python
# backend/routers/assets.py 하단에 추가
@router.get("/api/assets/custom-endpoint")
async def my_new_endpoint():
    dfs = load_from_db()
    # 비즈니스 로직 처리
    return {"data": result}
```

**② 새 라우터 파일 생성**

```python
# backend/routers/reports.py
from fastapi import APIRouter
router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/summary")
async def get_summary():
    return {"data": "..."}
```

```python
# backend/main.py 에 등록
from backend.routers import assets, consumables, reports  # 추가
app.include_router(reports.router)                         # 추가
```

---

### 6-2. DB 접근 패턴

모든 자산 DB 접근은 `database.py` 의 두 함수를 통합니다.

```python
from backend.services.database import load_from_db, update_db

# 전체 데이터 로드 (dict[str, DataFrame] 반환)
# 내부적으로 Google Sheets 먼저 시도 → 실패 시 SQLite 폴백
dfs = load_from_db()
df_lease = dfs["Lease"]           # 노트북 자산 DataFrame
df_all_user = dfs["All_User"]     # 전체 임직원 마스터

# DataFrame 수정 후 저장 (Sheets + SQLite 동시 저장)
update_db("Lease", df_lease)
```

> **⚠️ 주의**: `load_from_db()`는 호출 시마다 **전체 데이터를 메모리에 로드**합니다.
> 빠른 처리가 필요한 경우 캐싱 레이어 추가를 고려하세요.

---

### 6-3. Pydantic 모델 (요청 Body 정의)

POST/PUT 요청이 있는 엔드포인트는 반드시 Pydantic 모델을 정의합니다.

```python
from pydantic import BaseModel
from typing import Optional

class AssetUpdateRequest(BaseModel):
    email: str
    asset_type: str          # "Lease", "iPad", "Monitor" 등
    column: str              # 수정할 컬럼명
    value: Optional[str] = None

@router.put("/api/assets/row/update")
async def update_row(req: AssetUpdateRequest):
    ...
```

---

### 6-4. 에러 처리

```python
from fastapi import HTTPException

# 404 - 리소스 없음
if asset_type not in dfs:
    raise HTTPException(status_code=404, detail=f"'{asset_type}' 자산 타입 없음")

# 400 - 잘못된 요청
if not email or "@" not in email:
    raise HTTPException(status_code=400, detail="유효하지 않은 이메일입니다.")

# 500 - 서버 오류 (일반적으로 try/except로 처리)
try:
    update_db("Lease", df)
except Exception as e:
    raise HTTPException(status_code=500, detail=f"저장 실패: {str(e)}")
```

---

### 6-5. 소모품 서비스 패턴

소모품은 별도 `consumables.db`를 사용합니다.

```python
from backend.services.consumables_service import (
    get_all_consumables,
    update_consumable_stock,
    add_outbound_record,
)
```

---

## 7. 프론트엔드 개발 가이드

### 7-1. 라우팅 구조

`App.jsx` 에서 모든 라우트를 정의합니다.

| URL 패턴 | 컴포넌트 | 설명 |
|----------|----------|------|
| `/` | `→ /dashboard` | 리다이렉트 |
| `/dashboard` | `Dashboard` | 대시보드 |
| `/assets/:type` | `AssetList` | type = Lease / iPad / Monitor / Printer / Teams |
| `/consumables` | `Consumables` | 소모품 관리 |
| `/newhire` | `NewHire` | 신규 입사자 |
| `/resign` | `Resign` | 퇴사자 관리 |
| `/config` | `DeptConfig` | BU/ROLE 설정 |
| `/upload` | `ExcelUpload` | Excel 업로드 |
| `/register` | `SelfOutbound` | 소모품 자가 출고 (공개) |

**새 페이지 추가 순서:**
1. `frontend/src/pages/MyNewPage.jsx` 생성
2. `App.jsx`에 `<Route path="/mynewpage" element={<MyNewPage />} />` 추가
3. `Sidebar.jsx`에 네비게이션 링크 추가

---

### 7-2. API 호출 패턴

```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api'

// 데이터 조회 (자동 캐싱)
const { data, isLoading, error } = useQuery({
  queryKey: ['assets', 'Lease'],
  queryFn: () => axios.get(`${API_BASE}/assets/Lease`).then(r => r.data)
})

// 데이터 변경 (뮤테이션)
const queryClient = useQueryClient()
const mutation = useMutation({
  mutationFn: (payload) => axios.put(`${API_BASE}/assets/row/update`, payload),
  onSuccess: () => {
    queryClient.invalidateQueries(['assets', 'Lease'])  // 캐시 무효화 → 자동 리페치
    showToast('저장 완료!', 'success')
  },
  onError: (err) => {
    showToast(`오류: ${err.response?.data?.detail || err.message}`, 'error')
  }
})
```

---

### 7-3. Toast 알림 사용

```jsx
import { useToast } from '../components/Toast'

const { showToast } = useToast()

showToast('저장 완료!', 'success')    // 초록색 성공
showToast('오류 발생!', 'error')      // 빨간색 에러
showToast('처리 중...', 'info')       // 파란색 정보
```

---

### 7-4. 컴포넌트 작성 규칙

- 파일명: **PascalCase** (예: `MyNewPage.jsx`)
- 스타일: `index.css`의 기존 CSS 클래스 재사용 우선
- 인라인 스타일: 최소화 (동적 값에만 사용)
- API 호출: `useQuery` / `useMutation` 훅으로 분리 (컴포넌트 내 `axios.get()` 직접 호출 지양)
- 공통 컴포넌트: `components/` 폴더에 분리 (`ConfirmModal`, `SearchableSelect` 등 재사용)

---

### 7-5. 환경별 API Base URL

```javascript
// vite.config.js 또는 .env 파일로 관리
// 로컬: http://localhost:8000
// 운영: 같은 도메인 (FastAPI가 React 정적 파일 서빙)
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api'
```

운영 환경에서는 Docker 빌드 시 FastAPI가 빌드된 React 파일(`frontend/dist`)을 정적 파일로 서빙하므로 **같은 origin**에서 동작합니다.

---

## 8. 데이터베이스 설계

### 8-1. 테이블 목록 (Google Sheets 탭 = SQLite 테이블)

| 내부 키 | Google Sheets 탭명 | SQLite 테이블명 | 설명 |
|---------|--------------------|-----------------|------|
| `All_User` | `All_User` | `All_User` | 전체 임직원 마스터 |
| `Lease` | `Lease_List` | `Lease` | 노트북 자산 |
| `iPad` | `Ipad_List` | `iPad` | 아이패드 자산 |
| `Teams` | `TeamsNumber` | `Teams` | Teams 전화번호 |
| `Printer` | `Printer` | `Printer` | 프린터/복합기 |
| `Monitor` | `Monitor` | `Monitor` | 모니터 |
| `Resign` | `퇴사자` | `Resign` | 퇴사자 기록 |
| `NewHire` | `신규입사자` | `NewHire` | 신규 입사자 기록 |
| `Dept_Config` | `Dept_Config` | `Dept_Config` | BU/ROLE 코드 |

**소모품 DB** (`consumables.db`) — 별도 관리

| 테이블 | 설명 |
|--------|------|
| `consumables_master` | 소모품 품목 마스터 (재고, 단가) |
| `consumables_outbound` | 출고 내역 (월별) |

---

### 8-2. 핵심 컬럼 설명

#### All_User (임직원 마스터)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| NO | int | 순번 |
| NAME | str | 영문 이름 |
| 이름 | str | 한글 이름 |
| email | str | **PK 역할** (소문자, 공백 제거) |
| ROLE | str | 직책 |
| BU | str | 부서 코드 |
| SKL분류 | str | 고용 형태 분류 |

#### 자산 테이블 공통 규칙

| 컬럼 | 설명 |
|------|------|
| `email` | 할당된 사용자. 빈 문자열(`""`)이면 **미할당 자산** |
| `S/N` 또는 `Model` | 자산 식별자 (자산 타입에 따라 다름) |
| `Additional Information` | 추가 메모 (반납 시 사용) |

#### Resign (퇴사자)

| 컬럼 | 설명 |
|------|------|
| `F` (또는 `년`) | 퇴사 연도 |
| `월` | 퇴사 월 |
| `날짜` | 퇴사 일 |
| `email` | 퇴사자 이메일 |
| `노트북` / `아이패드` / ... | 반납 자산 시리얼 or 정보 |
| `추가사항` | 기타 메모 |

---

### 8-3. 이메일 정규화 규칙

> **모든 이메일은 소문자 변환 + 앞뒤 공백 제거 후 저장합니다.**

```python
# database.py의 normalize_email() 자동 처리
df["email"] = df["email"].astype(str).str.strip().str.lower()
df["email"] = df["email"].replace(["nan", "none", "null"], "", regex=True)
```

- `NaN`, `None`, `"nan"` → 빈 문자열 `""`로 치환
- 미할당 자산의 email = 빈 문자열

---

## 9. 데이터 흐름 (Data Flow)

### Excel 업로드 흐름

```
사용자 Excel 파일 업로드
        ↓
ExcelUpload.jsx → POST /api/assets/upload
        ↓
backend/routers/assets.py → save_excel_to_db_service()
        ↓
config.py의 SHEET_MAPPING에 따라 시트명 → 내부 키 매핑
        ↓
normalize_email() + deduplicate_columns() 전처리
        ↓
update_db(key, df)
  ├── Google Sheets 저장 (update_sheet)
  └── SQLite 백업 저장 (to_sql replace)
```

### 자산 조회 흐름

```
사용자 → GET /api/assets/Lease
        ↓
load_from_db()
  ├── Google Sheets Batch Get (9개 시트 1회 API 호출)
  │     └── 성공 → DataFrame 반환
  └── 실패/타임아웃(30초) → SQLite 폴백
        ↓
_post_process() → 이메일 정규화, 정렬
        ↓
JSON 응답 → React Query 캐시 → 화면 렌더링
```

---

## 10. API 레퍼런스

> 전체 목록은 서버 실행 후 `http://localhost:8000/docs` 에서 확인하세요.

### 자산 관련 (`/api/assets`)

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/assets/dashboard` | 대시보드 요약 수치 |
| GET | `/api/assets/dashboard/integrated` | 전체 임직원 통합 뷰 |
| GET | `/api/assets/{asset_type}` | 자산 목록 조회 (Lease/iPad/Teams/Monitor/Printer) |
| POST | `/api/assets/upload` | Excel 파일 전체 업로드 (multipart/form-data) |
| GET | `/api/assets/{asset_type}/download` | CSV 다운로드 |
| PUT | `/api/assets/row/update` | 특정 행 인라인 수정 |
| DELETE | `/api/assets/row/delete` | 특정 행 삭제 |
| POST | `/api/assets/{asset_type}/save` | 테이블 전체 저장 |
| GET | `/api/assets/unassigned/list` | 미할당 자산 목록 |
| GET | `/api/assets/{asset_type}/integrity` | 이메일 정합성 체크 |

### 신규 입사자 (`/api/assets/newhire`)

| Method | URL | 설명 |
|--------|-----|------|
| POST | `/api/assets/newhire/register` | 신규 입사자 등록 |
| POST | `/api/assets/newhire/sync` | NewHire → All_User 동기화 |

### 퇴사자 (`/api/assets/resign`)

| Method | URL | 설명 |
|--------|-----|------|
| POST | `/api/assets/resign/register` | 퇴사자 등록 + 보유 자산 정보 연동 |
| POST | `/api/assets/resign/return` | 개별 자산 반납 처리 (email 초기화) |
| POST | `/api/assets/resign/delete-master` | All_User 에서 퇴사자 삭제 |

### 부서 설정 (`/api/assets/config`)

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/assets/config/dept` | BU/ROLE 목록 조회 |
| POST | `/api/assets/config/dept/add` | BU 또는 ROLE 추가 |
| POST | `/api/assets/config/dept/delete` | BU 또는 ROLE 삭제 |

### 소모품 (`/api/consumables`)

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/consumables/` | 소모품 전체 목록 |
| POST | `/api/consumables/outbound` | 출고 등록 |
| GET | `/api/consumables/outbound/history` | 출고 내역 조회 |
| PUT | `/api/consumables/{id}` | 소모품 정보 수정 |

---

## 11. 환경 변수 / 설정 관리

### 11-1. `config.py` — 앱 전역 상수

프로젝트 루트의 `config.py`에서 핵심 상수를 관리합니다.
**코드를 변경하지 않고 설정만 바꾸려면 이 파일만 수정하면 됩니다.**

```python
# ── 핵심 설정값 ──
DB_FILE = "asset_database.db"
CONSUMABLES_DB_FILE = "consumables.db"

# ── Google Sheets ID ──
SPREADSHEET_ID = "1__8NXfK6ruhlQtnomhIi_sjdkHgLD0C2N1Mw4P3GW7g"           # 자산 마스터
CONSUMABLES_MASTER_SPREADSHEET_ID = "1A4RvrDn_I3wev6UaqEGBRoADYRYwtQty0TPo-x6ehtw"  # 소모품 마스터
CONSUMABLES_OUTBOUND_SPREADSHEET_ID = "1MgYUINr7T1t80MUlv-RRaL7GkK7NSNxuKmAzvqNGe-M"  # 출고 내역

# ── 인증 ──
GOOGLE_CREDENTIALS_FILE = "data/st-asset-project-8000c6bb9905.json"  # 로컬용
GOOGLE_CREDENTIALS_JSON = os.environ.get("GOOGLE_CREDENTIALS_JSON")   # 클라우드용

# ── Excel → Sheets 탭명 매핑 ──
SHEET_MAPPING = { "All_User": "All_User", "Lease": "Lease_List", ... }

# ── 자산 타입 한글명 ──
ASSET_TYPES = { "Lease": "노트북", "iPad": "아이패드", ... }
```

---

### 11-2. `.env.example` — 환경 변수 템플릿

```env
# Google Sheets 인증 (클라우드 배포 시 필수)
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}

# CORS (배포 도메인을 허용할 때)
ALLOWED_ORIGIN=https://your-app-url.run.app
```

> 로컬에서는 `GOOGLE_CREDENTIALS_JSON` 없이 `data/` 폴더의 JSON 파일을 자동으로 사용합니다.

---

### 11-3. `deployment_config.json`

```json
{
  "project_id": "st-asset-project",
  "service_name": "asset-info",
  "service_account_key": "data/st-asset-project-8000c6bb9905.json",
  "region": "asia-northeast3"
}
```

---

## 12. GitHub 업로드 가이드

### 12-1. `.gitignore` 확인 사항

다음 항목들이 반드시 `.gitignore`에 포함되어 있어야 합니다.

```gitignore
# 서비스 계정 키 (절대 업로드 금지!)
data/
*.json.key

# SQLite DB 파일 (사내 데이터 포함)
*.db
*.db-shm
*.db-wal

# Python 가상환경
.venv/
__pycache__/
*.pyc

# Node.js
node_modules/
frontend/dist/

# macOS
.DS_Store

# 로그 파일
*.log
uvicorn*.log

# 임시 파일
*.xlsx
~$*.xlsx
```

---

### 12-2. 코드 변경 → 커밋 → 푸시 절차

```bash
# 1. 현재 변경사항 확인
git status

# 2. 스테이징 (변경된 파일 추가)
git add .

# 또는 특정 파일만:
# git add backend/routers/assets.py frontend/src/pages/NewHire.jsx

# 3. 커밋 (의미 있는 메시지 작성)
git commit -m "feat: 퇴사자 자산 반납 처리 개별 클릭 기능 추가"

# 4. main 브랜치에 푸시
git push origin main
```

---

### 12-3. 커밋 메시지 컨벤션

일관된 히스토리 관리를 위해 다음 prefix를 사용합니다.

| Prefix | 용도 | 예시 |
|--------|------|------|
| `feat:` | 새 기능 추가 | `feat: 소모품 검색 필터 추가` |
| `fix:` | 버그 수정 | `fix: 이메일 정규화 오류 수정` |
| `refactor:` | 코드 리팩토링 | `refactor: database.py 폴백 로직 정리` |
| `style:` | UI/CSS 변경 | `style: 대시보드 카드 레이아웃 개선` |
| `docs:` | 문서 수정 | `docs: DEVELOPMENT_GUIDE 업데이트` |
| `chore:` | 설정/의존성 변경 | `chore: requirements.txt gspread 버전 업` |
| `hotfix:` | 긴급 운영 버그 수정 | `hotfix: 시트 쓰기 타임아웃 버그 수정` |

---

### 12-4. 브랜치 전략

```
main         ← 운영 배포 기준 브랜치 (항상 안정 상태 유지)
  └── feature/[기능명]  ← 새 기능 개발 시 분기
  └── fix/[버그명]      ← 버그 수정 시 분기
```

> 현재는 소규모 개발팀이므로 `main`에 직접 커밋하는 방식으로 운영해도 무방합니다.
> 팀이 확장되면 PR(Pull Request) 기반 워크플로우로 전환을 권장합니다.

---

### 12-5. 민감 정보 유출 방지 체크리스트

커밋 전 반드시 확인합니다.

- [ ] `data/*.json` (서비스 계정 키) 포함 여부 확인
- [ ] `*.db` 파일 포함 여부 확인 (임직원 개인정보 포함)
- [ ] `GOOGLE_CREDENTIALS_JSON` 하드코딩 여부 확인
- [ ] Excel 파일 (`*.xlsx`) 포함 여부 확인
- [ ] `.env` 실제 환경 변수 파일 포함 여부 확인

```bash
# 커밋 전 스테이징된 파일 확인
git diff --cached --name-only
```

---

## 13. Google Cloud Run 배포 가이드

### 13-1. 배포 구조 개요

```
로컬 소스코드
     │
     ▼  gcloud run deploy --source .
Cloud Build (자동 빌드)
     │
     │  Dockerfile 실행:
     │  1) Node.js → React 빌드 (frontend/dist 생성)
     │  2) Python 3.11 → FastAPI 설치
     │  3) 빌드된 React 파일을 FastAPI가 정적 서빙
     ▼
Artifact Registry (컨테이너 이미지 저장)
     │
     ▼
Cloud Run 서비스 (asia-northeast3)
     │
     ├── 환경변수: GOOGLE_CREDENTIALS_JSON (Sheets 인증)
     ├── 포트: 8080
     └── URL: https://asset-info-1015498761413.asia-northeast3.run.app
```

---

### 13-2. 배포 절차 (표준 워크플로우)

**Step 1: 코드 변경 후 GitHub 동기화**

```bash
git add .
git commit -m "feat: [변경 내용 설명]"
git push origin main
```

**Step 2: Cloud Run 배포 실행**

```bash
# 프로젝트 루트에서 실행
./deploy.sh
```

`deploy.sh`가 자동으로 수행하는 작업:
1. 서비스 계정 인증 (`gcloud auth activate-service-account`)
2. GCP 프로젝트 설정
3. 소스 코드 기반 빌드 및 배포 (`gcloud run deploy --source .`)
4. `GOOGLE_CREDENTIALS_JSON` 환경 변수 주입

**Step 3: 배포 완료 확인**

```bash
# 운영 URL 확인
echo "배포 완료: https://asset-info-1015498761413.asia-northeast3.run.app/dashboard"

# 또는 gcloud로 URL 확인
gcloud run services describe asset-info --region asia-northeast3 --format 'value(status.url)'
```

---

### 13-3. Dockerfile 빌드 구조

```dockerfile
# Stage 1: React 빌드
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build          # → frontend/dist/ 생성

# Stage 2: FastAPI + 빌드된 React 서빙
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ backend/
COPY config.py .
COPY --from=frontend-build /app/frontend/dist frontend/dist

ENV PORT=8080
CMD uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

> React 빌드 결과물(`frontend/dist`)을 FastAPI가 정적 파일로 서빙하므로 단일 컨테이너로 운영됩니다.

---

### 13-4. 필수 GCP IAM 권한

서비스 계정 `asset-manager@st-asset-project.iam.gserviceaccount.com`에 필요한 역할:

| 역할 | 용도 |
|------|------|
| **Cloud Run 관리자** | 서비스 배포 및 설정 변경 |
| **Cloud Build 편집자** | 소스 코드 빌드 실행 |
| **Artifact Registry 관리자** | 컨테이너 이미지 저장 관리 |
| **스토리지 관리자** | 빌드 중 임시 파일 버킷 접근 |
| **서비스 사용량 소비자** | API 호출 권한 |

---

### 13-5. 배포 문제 해결

**문제: "Permission denied on Artifact Registry"**
```bash
gcloud projects add-iam-policy-binding st-asset-project \
  --member="serviceAccount:asset-manager@st-asset-project.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.admin"
```

**문제: Google Sheets 연결 실패 (운영 환경)**
- `GOOGLE_CREDENTIALS_JSON` 환경 변수가 제대로 설정되었는지 확인
- Cloud Run Console → 환경 변수 탭에서 직접 확인

**문제: CORS 오류**
- `backend/main.py`의 `origins` 리스트에 실제 운영 도메인 추가

**문제: "/" 경로 접속 시 404**
- `frontend/dist/` 폴더가 Docker 이미지에 포함되어 있는지 확인
- `npm run build` 정상 실행 여부 확인

---

## 14. 기능별 개발 방향 로드맵

### ✅ 완료된 기능

- [x] 자산 CRUD (노트북, 아이패드, 모니터, 프린터, Teams)
- [x] 신규 입사자 등록 및 All_User 마스터 동기화
- [x] 퇴사자 관리 및 개별 자산 반납 처리
- [x] 소모품 재고 관리 (입출고, 재고 현황)
- [x] 소모품 자가 출고 (외부 공개 URL `/register`)
- [x] Excel 일괄 업로드
- [x] Google Sheets 실시간 양방향 동기화
- [x] SQLite 폴백 구조
- [x] Google Cloud Run 배포 자동화
- [x] 모바일 반응형 UI

### 🔄 개선 예정 항목

- [ ] Google Sheets 쓰기 재시도 로직 (Exponential Backoff)
- [ ] 자산 변경 이력 (History) 추적 테이블 추가
- [ ] 대시보드 차트 (Chart.js 또는 Recharts 연동)
- [ ] 소모품 재고 부족 알림 (이메일 또는 Slack Webhook)
- [ ] CSV/Excel 내보내기 기능 강화
- [ ] 사용자 인증 (Google OAuth 또는 사내 SSO 연동)
- [ ] 자산 QR코드 생성 및 스캔 기능

### 🆕 신규 기능 추가 시 체크리스트

새 자산 타입(예: 키보드) 추가 시:
1. `config.py` → `SHEET_MAPPING`, `ASSET_TYPES`, `COLUMN_MAPPING`, `DEFAULT_SCHEMAS` 업데이트
2. Google Sheets에 해당 탭 생성
3. Excel 파일에 해당 시트 추가 후 업로드
4. 필요 시 `AssetList.jsx`에 타입별 UI 분기 추가

---

## 15. 개발 팁 & 주의사항

### ✅ 권장사항

| 상황 | 권장 방법 |
|------|-----------|
| 새 자산 타입 추가 | `config.py`의 4개 매핑 동시 업데이트 |
| API 추가 | Pydantic 모델 + HTTPException 필수 |
| React 상태 갱신 | `invalidateQueries()`로 캐시 무효화 |
| DB 스키마 변경 | Excel 재업로드로 테이블 재생성 |
| 민감 설정 변경 | `config.py` 또는 환경 변수, 코드에 하드코딩 금지 |

### ⚠️ 주의사항

1. **`load_from_db()`는 전체 데이터 메모리 로드** — 수만 행 이상 시 캐싱 필요
2. **`update_db()`는 테이블 전체 replace** — 동시 편집 시 충돌 위험
3. **Google Sheets API 할당량** — 분당 60회 제한, Batch Get으로 최적화되어 있음
4. **CORS 도메인** — 배포 후 실제 도메인을 `main.py`의 `origins`에 추가
5. **서비스 계정 키** — 절대 Git에 포함하지 말 것, Cloud Run 환경변수로 주입
6. **SQLite DB 파일** — 임직원 개인정보 포함, `.gitignore` 확인 필수

---

## 16. AI 협업 가이드

AI 어시스턴트(Antigravity 등)와 협업 시 효율적인 방법입니다.

### 효율적인 요청 방법

| ❌ 비효율적 | ✅ 효율적 |
|-----------|-----------|
| "코드 전체 고쳐줘" | "`backend/routers/assets.py`의 `resign/return` 엔드포인트에서 Teams 반납 처리 추가" |
| "UI 좀 바꿔줘" | "`Resign.jsx` 145번째 줄의 반납 버튼 색상을 빨간색으로, 클릭 시 `ConfirmModal` 표시" |
| "버그 있어" | "스크린샷 첨부 + 'X 버튼 클릭 시 Y 동작이 일어나야 하는데 Z가 나옴'" |

### 작업 요청 순서 (토큰 절약)

1. **파일 경로 명시** → 관련 파일 이름(경로)을 구체적으로 언급
2. **단계적 요청** → 한 번에 하나의 기능씩 구현하고 확인
3. **스크린샷 활용** → UI 버그는 텍스트보다 스크린샷이 훨씬 효율적
4. **Artifacts 확인** → `task.md`, `implementation_plan.md`를 먼저 확인

### 핵심 파일 위치 요약

| 역할 | 파일 경로 |
|------|-----------|
| 전역 설정 | `config.py` |
| 백엔드 API | `backend/routers/assets.py` |
| 소모품 API | `backend/routers/consumables.py` |
| DB 로드/저장 | `backend/services/database.py` |
| Sheets 연동 | `backend/services/sheets_service.py` |
| 라우팅 | `frontend/src/App.jsx` |
| 전역 스타일 | `frontend/src/index.css` |
| 네비게이션 | `frontend/src/components/Sidebar.jsx` |
| 배포 설정 | `deployment_config.json`, `deploy.sh` |

---

## 17. 자주 묻는 질문 (FAQ)

**Q. 프론트엔드에서 API 요청이 실패합니다.**

A. 다음 순서로 확인하세요:
1. 백엔드 서버가 실행 중인지 확인 (`http://localhost:8000/health`)
2. 프론트엔드 `API_BASE`가 `http://localhost:8000`인지 확인
3. `main.py`의 `origins`에 `http://localhost:5173`이 포함되어 있는지 확인

---

**Q. Excel 업로드 후 데이터가 반영되지 않습니다.**

A. Excel 시트명이 `config.py`의 `SHEET_MAPPING` 값과 정확히 일치하는지 확인하세요. (예: `Lease_List`, `Ipad_List`, `TeamsNumber` 등 대소문자, 공백 주의)

---

**Q. Google Sheets 없이 로컬에서만 실행하려면?**

A. `GOOGLE_CREDENTIALS_JSON` 환경 변수와 `data/*.json` 파일이 없으면 자동으로 SQLite만 사용합니다. 별도 설정 불필요.

---

**Q. 운영 배포 후 데이터가 안 나옵니다 (빈 화면).**

A. Cloud Run 환경 변수에서 `GOOGLE_CREDENTIALS_JSON`이 올바르게 설정되어 있는지 확인하세요. Google Cloud Console → Cloud Run → 서비스 선택 → 환경 변수 탭.

---

**Q. 새로운 자산 타입(예: 키보드)을 추가하려면?**

A. `config.py`에서 `SHEET_MAPPING`, `ASSET_TYPES`, `COLUMN_MAPPING`, `DEFAULT_SCHEMAS`에 새 항목을 추가하고, Excel 파일에 해당 시트를 추가 후 업로드합니다.

---

**Q. 퇴사자 처리 시 자산이 자동 반납되지 않습니다.**

A. `/api/assets/resign/register` 호출 후 `/api/assets/resign/return`을 자산별로 호출해야 합니다. 두 단계가 모두 필요합니다.

---

**Q. `deploy.sh` 실행 시 "gcloud: command not found" 오류**

A. Google Cloud CLI가 설치되어 있지 않습니다. [https://cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install) 에서 설치 후 `gcloud init`을 실행하세요.

---

**Q. `git push` 시 서비스 계정 키가 포함되어 있다고 경고가 나옵니다.**

A. `data/` 폴더 전체를 `.gitignore`에 추가하고 `git rm --cached data/ -r` 로 Git 추적에서 제거하세요.

---

*이 문서는 이 앱의 공식 개발 기준 문서입니다. 기능 추가/변경 시 반드시 이 문서를 함께 업데이트하세요.*
*문의사항: 개발팀에게 연락하세요.*
