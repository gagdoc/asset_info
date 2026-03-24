# 📦 사내 자산 & 소모품 관리 시스템 — 개발 가이드

> **최종 업데이트**: 2026-03-22  
> **버전**: 1.0  
> **대상**: 이 프로젝트를 개발·유지보수하는 개발자

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [프로젝트 구조](#3-프로젝트-구조)
4. [로컬 개발 환경 설정](#4-로컬-개발-환경-설정)
5. [백엔드 개발 가이드](#5-백엔드-개발-가이드)
6. [프론트엔드 개발 가이드](#6-프론트엔드-개발-가이드)
7. [데이터베이스 설계](#7-데이터베이스-설계)
8. [API 레퍼런스](#8-api-레퍼런스)
9. [환경 변수 / 설정](#9-환경-변수--설정)
10. [Excel 업로드 규격](#10-excel-업로드-규격)
11. [Supabase 연동](#11-supabase-연동)
12. [개발 팁 & 주의사항](#12-개발-팁--주의사항)
13. [자주 묻는 질문 (FAQ)](#13-자주-묻는-질문-faq)
14. [AI 협업 및 토큰 최적화 가이드](#14-ai-협업-및-토큰-최적화-가이드)

---

## 1. 프로젝트 개요

이 앱은 **사내 IT 자산(노트북, 아이패드, 모니터, 프린터, Teams 번호)과 소모품을 통합 관리**하는 웹 애플리케이션입니다.

### 주요 기능

| 기능 | 설명 |
|------|------|
| 대시보드 | 자산 현황 요약 및 전체 임직원 통합 뷰 |
| 자산 관리 | 노트북·아이패드·모니터·프린터·Teams 번호 CRUD |
| 신규 입사자 관리 | 신규 입사자 등록 및 All_User 마스터 동기화 |
| 퇴사자 관리 | 퇴사자 등록, 자산 일괄 반납 처리 |
| 소모품 관리 | 소모품 재고 추적 및 부족 알림 |
| 엑셀 업로드 | Excel 파일로 전체 데이터 일괄 갱신 |
| BU/ROLE 설정 | 부서·직책 코드 관리 |

---

## 2. 기술 스택

### 백엔드

| 항목 | 기술 |
|------|------|
| 웹 프레임워크 | **FastAPI** |
| 언어 | Python 3.11+ |
| 데이터 처리 | pandas |
| 주 DB | SQLite (`asset_database.db`) |
| 클라우드 DB | Supabase (선택적) |
| 소모품 DB | SQLite (`consumables.db`) |

### 프론트엔드

| 항목 | 기술 |
|------|------|
| UI 프레임워크 | **React 19** |
| 빌드 툴 | Vite 7 |
| 라우팅 | react-router-dom v7 |
| HTTP 클라이언트 | axios |
| 서버 상태 관리 | @tanstack/react-query v5 |
| 아이콘 | react-icons |
| 날짜 처리 | date-fns |
| CSS | Vanilla CSS (index.css) |

---

## 3. 프로젝트 구조

```
ASSET_INFO/
│
├── backend/                    # FastAPI 백엔드
│   ├── main.py                 # 앱 진입점, CORS 설정, 라우터 등록
│   ├── routers/
│   │   ├── assets.py           # 자산/인사 관련 모든 REST API
│   │   └── consumables.py      # 소모품 API
│   └── services/
│       ├── database.py         # DB 연결, CRUD, Supabase 연동
│       └── consumables_service.py
│
├── frontend/                   # React 프론트엔드
│   ├── src/
│   │   ├── main.jsx            # React 앱 진입점
│   │   ├── App.jsx             # 라우팅 설정
│   │   ├── index.css           # 전역 스타일
│   │   ├── components/
│   │   │   ├── Sidebar.jsx     # 네비게이션 사이드바
│   │   │   └── Toast.jsx       # 토스트 알림 컴포넌트 & 컨텍스트
│   │   └── pages/
│   │       ├── Dashboard.jsx   # 대시보드 (요약 카드 + 전체 임직원 뷰)
│   │       ├── AssetList.jsx   # 자산 목록 (URL param으로 타입 구분)
│   │       ├── NewHire.jsx     # 신규 입사자
│   │       ├── Resign.jsx      # 퇴사자 관리
│   │       ├── Consumables.jsx # 소모품 관리
│   │       ├── DeptConfig.jsx  # BU/ROLE 설정
│   │       └── ExcelUpload.jsx # 엑셀 업로드
│   ├── package.json
│   └── vite.config.js
│
├── config.py                   # 전역 설정 (DB 경로, 시트 매핑, 자산 타입)
├── asset_database.db           # SQLite 메인 DB
├── consumables.db              # 소모품 전용 DB
├── requirements.txt            # Python 의존성
└── DEVELOPMENT_GUIDE.md        # 이 문서
```

---

## 4. 로컬 개발 환경 설정

### 사전 요구사항

- Python **3.11 이상**
- Node.js **18 이상** (LTS 권장)
- npm 또는 yarn

---

### 4-1. 백엔드 실행

```bash
# 프로젝트 루트에서 실행

# 1. 가상환경 생성 및 활성화
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate           # Windows

# 2. 의존성 설치
pip install -r requirements.txt

# 3. FastAPI 서버 시작 (개발 모드 - 자동 재시작)
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

✅ 서버가 기동되면 http://localhost:8000/docs 에서 Swagger UI를 확인할 수 있습니다.

---

### 4-2. 프론트엔드 실행

```bash
# frontend 디렉토리에서 실행
cd frontend

# 1. 의존성 설치
npm install

# 2. 개발 서버 시작
npm run dev
```

✅ 브라우저에서 http://localhost:5173 으로 접속합니다.

---

### 4-3. 두 서버 동시 실행

터미널 탭을 두 개 열고 백엔드·프론트엔드를 각각 실행하면 됩니다.  
프론트엔드(Vite)는 `vite.config.js`에 프록시 설정 없이, axios의 `baseURL`로 `http://localhost:8000`을 직접 사용합니다.

---

## 5. 백엔드 개발 가이드

### 5-1. 라우터 추가

새 라우터를 생성하려면:

1. `backend/routers/` 에 새 파일 생성 (예: `reports.py`)
2. `APIRouter` 생성 후 엔드포인트 작성
3. `backend/main.py` 에 라우터 등록

```python
# backend/routers/reports.py
from fastapi import APIRouter
router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/summary")
async def get_summary():
    return {"data": "..."}
```

```python
# backend/main.py
from backend.routers import assets, consumables, reports   # 추가
app.include_router(reports.router)                          # 추가
```

---

### 5-2. DB 접근 패턴

모든 DB 접근은 `backend/services/database.py` 의 함수를 통해 합니다.

```python
from backend.services.database import load_from_db, update_db

# 전체 데이터 로드 (dict of DataFrames 반환)
dfs = load_from_db()
df_lease = dfs["Lease"]

# 수정 후 저장
update_db("Lease", df_lease)
```

> **⚠️ 주의**: `load_from_db()`는 Supabase → SQLite 순서로 폴백(fallback)합니다.  
> Supabase 환경변수가 없으면 자동으로 로컬 SQLite를 사용합니다.

---

### 5-3. Pydantic 모델

요청 Body가 있는 엔드포인트는 반드시 Pydantic 모델을 정의합니다.

```python
from pydantic import BaseModel

class MyRequest(BaseModel):
    email: str
    asset_type: str
    value: Optional[str] = None
```

---

### 5-4. 에러 처리

```python
from fastapi import HTTPException

# 404 처리
if asset_type not in dfs:
    raise HTTPException(status_code=404, detail=f"'{asset_type}' not found")

# 400 처리
if not email:
    raise HTTPException(status_code=400, detail="이메일이 없습니다.")
```

---

## 6. 프론트엔드 개발 가이드

### 6-1. 라우팅 구조

`App.jsx` 에서 모든 라우트를 정의합니다.

| URL 패턴 | 컴포넌트 | 설명 |
|----------|----------|------|
| `/` | → `/dashboard` redirect | |
| `/dashboard` | `Dashboard` | 대시보드 |
| `/assets/:type` | `AssetList` | type = Lease / iPad / Monitor / Printer / Teams |
| `/consumables` | `Consumables` | 소모품 |
| `/newhire` | `NewHire` | 신규 입사자 |
| `/resign` | `Resign` | 퇴사자 |
| `/config` | `DeptConfig` | BU/ROLE 설정 |
| `/upload` | `ExcelUpload` | 엑셀 업로드 |

새 페이지를 추가하려면:
1. `frontend/src/pages/` 에 `NewPage.jsx` 생성
2. `App.jsx` 에 `<Route>` 추가
3. `Sidebar.jsx` 에 네비게이션 링크 추가

---

### 6-2. API 호출 패턴

axios를 사용하며, `@tanstack/react-query`로 서버 상태를 관리합니다.

```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const API_BASE = 'http://localhost:8000/api'

// 데이터 조회
const { data, isLoading, error } = useQuery({
  queryKey: ['assets', 'Lease'],
  queryFn: () => axios.get(`${API_BASE}/assets/Lease`).then(r => r.data)
})

// 데이터 변경
const queryClient = useQueryClient()
const mutation = useMutation({
  mutationFn: (payload) => axios.put(`${API_BASE}/assets/row/update`, payload),
  onSuccess: () => {
    queryClient.invalidateQueries(['assets', 'Lease'])  // 캐시 갱신
    showToast('저장 완료!', 'success')
  }
})
```

---

### 6-3. Toast 알림 사용

`Toast.jsx`에 `ToastProvider`와 `useToast` 훅이 정의되어 있습니다.

```jsx
import { useToast } from '../components/Toast'

const { showToast } = useToast()

// 성공 알림
showToast('저장 완료!', 'success')

// 에러 알림
showToast('오류가 발생했습니다.', 'error')
```

---

### 6-4. 새 컴포넌트 작성 규칙

- 파일명은 **PascalCase** (예: `MyComponent.jsx`)
- 스타일은 `index.css`의 기존 CSS 클래스를 최대한 재사용
- 인라인 스타일은 최소화, 별도 CSS가 필요하면 같은 이름의 `.css` 파일 생성
- API 호출은 컴포넌트 내부에서 직접 하지 않고, `useQuery` / `useMutation` 훅으로 분리

---

## 7. 데이터베이스 설계

### 7-1. 테이블 목록

| 테이블 키 | 실제 테이블명(SQLite) | 설명 |
|-----------|----------------------|------|
| `All_User` | All_User | 전체 임직원 마스터 |
| `Lease` | Lease | 노트북 자산 |
| `iPad` | iPad | 아이패드 자산 |
| `Teams` | Teams | Teams 번호 |
| `Printer` | Printer | 프린터/복합기 |
| `Monitor` | Monitor | 모니터 |
| `Resign` | Resign | 퇴사자 목록 |
| `NewHire` | NewHire | 신규 입사자 목록 |
| `Dept_Config` | Dept_Config | BU/ROLE 코드 테이블 |

### 7-2. 핵심 컬럼 설명

**All_User (마스터)**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| NO | int | 순번 (자동 증가) |
| NAME | str | 영문 이름 |
| 이름 | str | 한글 이름 |
| email | str | **PK 역할** (소문자, 공백 제거 후 저장) |
| ROLE | str | 직책 |
| BU | str | 부서 코드 |

**자산 테이블 공통**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| email | str | 할당된 사용자 이메일 (비어있으면 미할당) |
| S/N 또는 Model | str | 자산 식별자 |

**Resign (퇴사자)**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| F | int | 퇴사 연도 |
| 월 | int | 퇴사 월 |
| 날짜 | int | 퇴사 일 |
| email | str | 퇴사자 이메일 |
| 노트북 / 아이패드 / ... | str | 반납 자산 정보 |

---

### 7-3. 이메일 정규화 규칙

> **모든 이메일은 소문자 변환 + 앞뒤 공백 제거 후 저장합니다.**

```python
# database.py 의 normalize_email() 함수가 자동 처리
df["email"] = df["email"].astype(str).str.strip().str.lower()
```

- `NaN`, `None`, `null`, `"nan"` 은 빈 문자열 `""` 로 치환
- 미할당 자산의 email은 빈 문자열

---

## 8. API 레퍼런스

> 전체 API 목록은 서버 실행 후 **http://localhost:8000/docs** 에서 확인하세요.

### 자산 관련 (`/api/assets`)

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/assets/dashboard` | 대시보드 요약 수치 |
| GET | `/api/assets/dashboard/integrated` | 전체 임직원 통합 뷰 |
| GET | `/api/assets/{asset_type}` | 자산 목록 조회 |
| POST | `/api/assets/upload` | Excel 파일 전체 업로드 |
| GET | `/api/assets/{asset_type}/download` | CSV 다운로드 |
| PUT | `/api/assets/row/update` | 행 인라인 수정 |
| DELETE | `/api/assets/row/delete` | 행 삭제 |
| POST | `/api/assets/{asset_type}/save` | 테이블 전체 저장 |
| GET | `/api/assets/unassigned/list` | 미할당 자산 목록 |
| GET | `/api/assets/{asset_type}/integrity` | 이메일 정합성 체크 |

### 신규입사자 (`/api/assets/newhire`)

| Method | URL | 설명 |
|--------|-----|------|
| POST | `/api/assets/newhire/register` | 신규 입사자 등록 |
| POST | `/api/assets/newhire/sync` | NewHire → All_User 동기화 |

### 퇴사자 (`/api/assets/resign`)

| Method | URL | 설명 |
|--------|-----|------|
| POST | `/api/assets/resign/register` | 퇴사자 등록 + 자산 정보 연동 |
| POST | `/api/assets/resign/return` | 자산 반납 처리 |
| POST | `/api/assets/resign/delete-master` | All_User 에서 삭제 |

### 부서 설정 (`/api/assets/config`)

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/assets/config/dept` | BU/ROLE 목록 |
| POST | `/api/assets/config/dept/add` | BU/ROLE 추가 |
| POST | `/api/assets/config/dept/delete` | BU/ROLE 삭제 |

---

## 9. 환경 변수 / 설정

### 9-1. `config.py` — 앱 전역 설정

프로젝트 루트의 `config.py`에서 핵심 상수를 관리합니다.

```python
DB_FILE = "asset_database.db"          # 메인 SQLite DB 경로
CONSUMABLES_DB_FILE = "consumables.db" # 소모품 DB 경로

SHEET_MAPPING = {                       # Excel 시트명 ↔ 내부 키 매핑
    "All_User": "All_User",
    "Lease": "Lease_List",
    "iPad": "Ipad_List",
    ...
}

ASSET_TYPES = {                         # 자산 타입별 한글명
    "Lease": "노트북",
    "iPad": "아이패드",
    "Teams": "Teams",
    "Monitor": "모니터",
    "Printer": "복합기",
}
```

> Excel 시트명이 바뀌면 `SHEET_MAPPING`만 수정하면 됩니다.

---

### 9-2. Supabase 환경 변수

`.env` 파일 또는 시스템 환경 변수로 설정합니다.

```env
SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co
SUPABASE_KEY=your-anon-or-service-role-key
```

환경 변수가 없으면 **자동으로 로컬 SQLite** 를 사용합니다. 개발 시에는 환경 변수 없이 바로 실행 가능합니다.

---

## 10. Excel 업로드 규격

Excel 파일 업로드 시 `config.py`의 `SHEET_MAPPING`에 정의된 시트가 자동으로 인식됩니다.

### 필수 시트 목록

| 시트명 (Excel) | 내부 키 | 주요 필수 컬럼 |
|----------------|---------|---------------|
| `All_User` | All_User | NAME, 이름, email, BU, ROLE |
| `Lease_List` | Lease | email, S/N, Model |
| `Ipad_List` | iPad | email, S/N, Model |
| `TeamsNumber` | Teams | email, Number (또는 LineURI) |
| `Monitor` | Monitor | email, Model |
| `Printer` | Printer | email, Model |
| `퇴사자` | Resign | F(연도), 월, 날짜, email |
| `신규입사자` | NewHire | NAME, 이름, email, BU, ROLE |
| `Dept_Config` | Dept_Config | BU, ROLE |

### 주의사항

- 헤더(컬럼명)의 **앞뒤 공백은 자동 제거**됩니다.
- `email` 컬럼은 **소문자로 자동 정규화**됩니다.
- 같은 컬럼명이 중복되면 `.0`, `.1`... 접미사가 자동으로 붙습니다.
- 업로드 시 기존 데이터는 **완전히 덮어씌워집니다** (replace 방식).

---

## 11. Supabase 연동

### 테이블 매핑

| 내부 키 | Supabase 테이블명 |
|---------|------------------|
| All_User | users |
| Lease | assets_lease |
| iPad | assets_ipad |
| Teams | assets_teams |
| Monitor | assets_monitor |
| Printer | assets_printer |
| Resign | Resign |

> `NewHire`, `Dept_Config` 는 현재 Supabase 동기화 미지원 (로컬 SQLite만 사용).

### 폴백(Fallback) 로직

```
1. Supabase 연결 시도
   ├── 성공 → Supabase 데이터 사용
   │   └── 테이블별 실패 시 → 해당 테이블만 SQLite로 폴백
   └── 실패 → 전체 SQLite 폴백
```

`update_db()` 함수는 현재 로컬 SQLite에만 저장합니다.  
Supabase 완전 동기화가 필요하면 `migrate_to_supabase.py` 스크립트를 참고하세요.

---

## 12. 개발 팁 & 주의사항

### ✅ 권장사항

- **새 자산 타입 추가 시**: `config.py`의 `SHEET_MAPPING`, `ASSET_TYPES`, `DEFAULT_SCHEMAS`를 함께 업데이트하세요.
- **API 추가 시**: 반드시 Pydantic 모델로 타입을 명시하고, `HTTPException`으로 에러를 처리하세요.
- **React 컴포넌트 수정 시**: `useQueryClient().invalidateQueries()`로 관련 캐시를 갱신하세요.
- **DB 스키마 변경 시**: Excel 재업로드로 테이블을 재생성하거나 SQLite 마이그레이션 스크립트를 작성하세요.

### ⚠️ 주의사항

- `load_from_db()`는 매 API 요청마다 **전체 데이터를 메모리에 로드**합니다. 데이터가 수만 행 이상으로 늘어나면 성능 최적화가 필요합니다.
- `update_db()`는 기존 테이블을 **통째로 replace**합니다. 동시 편집 시 충돌 위험이 있습니다.
- CORS 허용 도메인은 `main.py`의 `origins` 리스트에만 추가됩니다. 배포 시 실제 도메인으로 변경해야 합니다.
- `asset_database.db`와 `consumables.db`는 `.gitignore`에 추가하거나 민감 데이터 여부를 확인 후 커밋하세요.

---

## 13. 자주 묻는 질문 (FAQ)

**Q. 백엔드 서버를 실행해도 프론트엔드에서 API 요청이 실패합니다.**  
A. 프론트엔드가 요청하는 `baseURL`이 `http://localhost:8000`인지 확인하세요. 또한 백엔드 `main.py`의 `origins`에 `http://localhost:5173`이 포함되어 있는지 확인하세요.

**Q. Excel 업로드 후 데이터가 반영되지 않습니다.**  
A. Excel 시트명이 `config.py`의 `SHEET_MAPPING` 값과 정확히 일치하는지 확인하세요. 시트명의 공백, 대소문자를 주의하세요.

**Q. Supabase를 사용하지 않고 로컬에서만 실행하려면?**  
A. `SUPABASE_URL`, `SUPABASE_KEY` 환경 변수를 설정하지 않으면 자동으로 로컬 SQLite만 사용됩니다.

**Q. 새로운 자산 타입(예: 키보드)을 추가하려면?**  
A. `config.py`에서 `SHEET_MAPPING`, `ASSET_TYPES`, `COLUMN_MAPPING`, `DEFAULT_SCHEMAS`에 새 항목을 추가하고, Excel 파일에 해당 시트를 추가 후 업로드하면 됩니다.

**Q. 퇴사자 처리 시 자산이 자동으로 반납 처리되지 않습니다.**  
A. `/api/assets/resign/register` 호출 시 자산 정보가 연동되고, `/api/assets/resign/return` 을 별도 호출해야 email이 초기화됩니다. 두 단계가 모두 필요합니다.

---

## 14. AI 협업 및 토큰 최적화 가이드

AI 어시스턴트(Antigravity 등)와 협업 시 **토큰 사용량을 최소화**하고 작업 효율을 높이기 위한 지침입니다.

### ✅ 토큰 절약을 위한 팁

1.  **필요한 파일만 명시**: 질문이나 요청 시, 현재 작업과 직접 관련된 파일 이름(및 경로)만 언급하세요. 불필요하게 많은 파일을 열어두면 모델의 컨텍스트(Input Token)가 급격히 증가합니다.
2.  **구체적인 작업 범위 지정**: "코드 전체를 고쳐줘" 대신 **"A 파일의 B 함수 내 C 로직을 D 방식으로 수정해줘"**와 같이 구체적으로 요청하세요.
3.  **단계적(Incremental) 요청**: 한 번에 여러 기능을 추가하기보다, **하나의 기능을 구현하고 확인한 뒤 다음 작업**을 요청하는 것이 토큰 낭비를 줄이고 오류를 방지하는 지름길입니다.
4.  **이미지/스크린샷 활용**: 텍스트로 길게 UI 버그를 설명하기보다, **스크린샷을 캡처해서 전달**하면 AI가 상황을 훨씬 빠르고 정확하게 파악합니다.
5.  **아티팩트(Artifacts) 확인**: AI가 생성한 `task.md`나 `implementation_plan.md`를 먼저 확인하면, 진행 상황을 다시 설명할 필요가 없어 토큰이 루프되는 현상을 줄일 수 있습니다.
6.  **불필요한 전체 조회 지양**: `grep`이나 `find` 대신 정확한 파일 위치를 안다면 직접 지정하여 불필요한 파일 리스팅 토큰을 아끼세요.

---

*문의사항은 개발팀에게 연락하세요.*
