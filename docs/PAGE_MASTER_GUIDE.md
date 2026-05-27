# 🏢 Asset Info — 페이지 관리 마스터 가이드

> **이 문서는 AI 에이전트 및 개발자가 `asset-info` 웹 앱의 9개 페이지를 관리·개선할 때
> 가장 먼저 참조해야 할 마스터 레퍼런스입니다.**
>
> 📌 세 가지 관점으로 각 페이지를 다룹니다: **디자인** | **데이터** | **보안**

---

## 📐 전역 디자인 시스템 (index.css 기준)

### CSS 변수 — 이것 외의 색상 하드코딩 금지

```css
/* 색상 */
--primary: #4f46e5          /* 주 액션, 링크, 강조 */
--primary-hover: #4338ca    /* 버튼 hover 상태 */
--primary-light: #eef2ff    /* 배경 강조 (선택 행 등) */
--bg-color: #f3f4f6         /* 앱 전체 배경 */
--card-bg: #ffffff          /* 카드/패널 배경 */
--sidebar-bg: #1e1e2e       /* 사이드바 (다크) */
--sidebar-text: #cdd6f4
--border-color: #e5e7eb

/* 시맨틱 색상 */
--success: #10b981          /* 성공, 완료, 정상 */
--warning: #f59e0b          /* 경고, 주의 */
--danger: #ef4444           /* 오류, 삭제, 위험 */
--info: #3b82f6             /* 안내, 정보 */

/* 텍스트 */
--text-main: #111827
--text-secondary: #6b7280
```

### 공통 클래스 — 반드시 재사용

| 클래스 | 용도 |
|--------|------|
| `.card` | 패널/섹션 감싸기 (shadow + border + radius) |
| `.btn`, `.btn-primary`, `.btn-danger`, `.btn-success` | 버튼 |
| `.btn-sm` | 테이블 내부 소형 버튼 |
| `.data-table`, `.table-wrapper` | 데이터 테이블 |
| `.form-group`, `.form-label`, `.form-input`, `.form-row` | 폼 |
| `.badge-success`, `.badge-warning`, `.badge-danger` | 상태 뱃지 |
| `.alert-info`, `.alert-success`, `.alert-warning`, `.alert-danger` | 알림 박스 |
| `.tabs`, `.tab-btn` | 탭 UI |
| `.stat-card`, `.stat-value`, `.stat-label` | 대시보드 통계 카드 |

### 공통 컴포넌트 — 직접 구현 금지, 아래 것을 사용

```jsx
import { useToast } from '../components/Toast'          // 토스트 알림
import LoadingModal from '../components/LoadingModal'    // 로딩 모달
import ConfirmModal from '../components/ConfirmModal'    // 확인 모달
import SearchableSelect from '../components/SearchableSelect' // 검색 가능 셀렉트
import ErrorBoundary from '../components/ErrorBoundary' // 에러 경계
```

### 페이지 기본 템플릿

```jsx
export default function PageName() {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)

  return (
    <div>
      <h1>📋 페이지 제목</h1>
      <div className="card">
        {/* 내용 */}
      </div>
      {loading && <LoadingModal message="처리 중..." />}
    </div>
  )
}
```

---

## 🗂️ 페이지별 상세 명세

### 1. 📊 대시보드 — `/dashboard` → `Dashboard.jsx`

**역할**: 전체 자산 현황 통합 조회 (All_User + 모든 자산 병합 뷰)

**데이터 흐름**:
```
GET /api/assets/dashboard        → 통계 숫자 (카드용)
GET /api/assets/dashboard/integrated → 전체 직원 + 자산 병합 테이블
```

**디자인 패턴**:
- 상단: `.dashboard-grid` 통계 카드 (`.stat-card`)
- 하단: `.data-table` 직원별 자산 현황 테이블
- 중복 자산 있는 사용자: `[중복!]` 접두어 + 노란 강조

**데이터 규칙**:
- 이메일 없는 행은 필터링하여 표시 금지
- NaN → `"-"` 표시 (백엔드에서 처리)
- 퇴사자는 `퇴사정보` 컬럼으로 표시 (삭제 아님)

**보안 포인트**:
- 퇴사자 정보가 노출되므로 URL 직접 접근 제한 고려
- 전체 직원 이메일 노출 → 사내망 접근 전제

---

### 2. 📋 자산 목록 — `/assets/:type` → `AssetList.jsx`

**역할**: Lease(노트북), iPad, Teams, Monitor, Printer 5개 자산 통합 관리

**지원 타입**: `Lease` | `iPad` | `Teams` | `Monitor` | `Printer`

**데이터 흐름**:
```
GET  /api/assets/{type}           → 목록 조회
PUT  /api/assets/row/update       → 인라인 셀 편집
DEL  /api/assets/row/delete       → 행 삭제
GET  /api/assets/{type}/download  → CSV 다운로드
POST /api/assets/{type}/replace   → 테이블 전체 교체
```

**디자인 패턴**:
- **인라인 편집**: 셀 클릭 → input 활성화 → Enter/blur로 저장
  - `td.editable` 클래스 적용 시 자동 hover 스타일 적용
- **행 선택**: 체크박스 선택 → 일괄 삭제
- **컬럼 필터**: 상단 입력창에서 실시간 필터링 (클라이언트 사이드)
- **페이지네이션**: 클라이언트 사이드 (50행 기본)

**자산 타입별 주요 컬럼**:
```
Lease(노트북): email, User, BU, S/N, SNOW Tag, Model, Additional Information
iPad:          email, User, BU, S/N, 전화 번호, Model, Additional Information
Teams:         email, TeamsNumber/Number, History
Monitor:       email, User, Model, Additional Information
Printer:       email, Model, Additional Information 2
```

**데이터 규칙**:
- STOCK 처리(반납): `email = ""`, `User = "STOCK"`, `BU = "IT"`
- `Additional Information`: `"YYYYMMDD/email/반납"` 형식으로 기록
- S/N 컬럼: `lstrip("=")` 처리 (Excel 수식 앞 = 제거)

**보안 포인트**:
- 행 삭제 시 `ConfirmModal` 필수 (되돌릴 수 없음)
- 전체 테이블 교체(`/replace`)는 되돌리기 불가 → 이중 확인

---

### 3. 📦 소모품 관리 — `/consumables` → `Consumables.jsx` ⚠️ 복잡도 최고

**역할**: 소모품 입출고, 재고, 발주, 토너 관리

**데이터 흐름**:
```
GET  /api/consumables/items           → 소모품 품목 목록
GET  /api/consumables/stock/summary   → 재고 요약
POST /api/consumables/outbound        → 출고 등록
POST /api/consumables/inbound         → 입고 등록
GET  /api/consumables/history         → 출고 내역
GET  /api/consumables/toner/stock     → 토너 재고
POST /api/consumables/toner/outbound  → 토너 출고
```

**⚠️ 알려진 버그 패턴**:
```python
# 수량 처리 — 쉼표 포함 문자열 대비 필수
qty = int(str(raw_qty).replace(",", ""))

# 토너 재고 차감 — 대소문자 일치 실패 방지
df[df["토너_품번"].str.lower() == toner_code.lower()]
```

**디자인 패턴**:
- 탭 구조: `재고 현황` | `출고 등록` | `입고 등록` | `토너 관리` | `발주 내역`
- 재고 부족 품목: `.badge-danger` 강조
- 출고 폼: `SearchableSelect`로 품목 선택

**보안 포인트**:
- 입고/출고 수량은 반드시 서버에서 양수 검증
- 발주 내역 수정 권한은 관리자만 (현재 미구현)

---

### 4. 👤 신규 입사자 — `/newhire` → `NewHire.jsx`

**역할**: 입사자 등록 → NewHire 탭 + All_User 동시 등록

**데이터 흐름**:
```
POST /api/assets/newhire/register  → 입사자 등록 (NewHire + All_User 동기화)
POST /api/assets/newhire/sync      → NewHire → All_User 일괄 동기화
GET  /api/assets/user/lookup/{email} → 이메일로 기존 사용자 자동 완성
GET  /api/assets/NewHire           → 입사자 목록
```

**디자인 패턴**:
- 상단: 등록 폼 (이름, 이메일, 부서, 직책, 입사일)
- 이메일 입력 시 기존 사용자 자동 조회 (`/lookup`) → 이름/부서 자동 완성
- 하단: 등록된 입사자 목록 (자산 현황 포함 enrichment)

**데이터 규칙**:
- 이메일 기준으로 All_User 중복 체크 후 없으면 추가
- 퇴사자 목록(Resign)에 있는 이메일은 재등록 불가 처리 필요
- `join_date` 포맷: `"YYYY-MM-DD"` → 백엔드에서 년/월/날짜 분리 저장

**보안 포인트**:
- 중복 이메일 등록 시 기존 ROLE/BU만 업데이트 (덮어쓰기 방지)

---

### 5. 🚪 퇴사자 관리 — `/resign` → `Resign.jsx`

**역할**: 퇴사 예정 등록 → 자산별 개별 반납 처리 → 최종 퇴사 확정

**데이터 흐름**:
```
POST /api/assets/resign/register      → 퇴사 예정자 등록
POST /api/assets/resign/return        → 개별 자산 반납 처리
POST /api/assets/resign/delete-master → All_User에서 최종 삭제 (퇴사 확정)
GET  /api/assets/Resign               → 퇴사자 목록 (자산 enrichment 포함)
```

**반납 처리 흐름**:
```
1. 퇴사 예정자 등록 (All_User 유지)
2. 자산별 반납 클릭 → email="" / STOCK 처리
3. Resign 탭에서 해당 자산 컬럼 → "-"
4. 모든 자산 반납 완료 후 "퇴사 확정" 버튼 활성화
5. 퇴사 확정 → All_User에서 삭제
```

**디자인 패턴**:
- 자산 컬럼(노트북/아이패드/Teams/모니터/복합기)이 "-"이면 ✅ 표시
- 모든 자산이 "-"일 때만 "퇴사 확정" 버튼 활성화
- 개별 자산 셀 클릭 → 반납 처리 (ConfirmModal 필수)

**보안 포인트**:
- "퇴사 확정"(delete-master)은 되돌릴 수 없음 → ConfirmModal + 입력 확인
- All_User 삭제 전 모든 자산 반납 여부 서버에서도 검증 권장

---

### 6. 🔍 대량 검색 — `/bulk-search` → `BulkSearch.jsx`

**역할**: 여러 시리얼/이메일을 한번에 검색하여 자산 현황 파악

**데이터 흐름**:
```
POST /api/assets/bulk-search → { found: [...], notFound: [...] }
```

**요청 파라미터**:
```json
{
  "search_input": "SN001\nSN002\nSN003",  // 개행/쉼표/세미콜론으로 분리
  "search_type": "all | email | serial_laptop | serial_ipad",
  "search_target": "all | dashboard | laptop | ipad"
}
```

**디자인 패턴**:
- 왼쪽: 검색어 텍스트에어리아 (여러 줄 입력)
- 오른쪽: 검색 결과 (found/notFound 구분 표시)
- notFound 항목: `.badge-danger` 강조
- found 항목: 테이블로 결과 표시 (어느 시트에서 발견됐는지 포함)

**보안 포인트**:
- 검색 결과에 이메일 전체 노출 → 내부망 전제

---

### 7. 📤 자가 출고 — `/register` → `SelfOutbound.jsx`

**역할**: 사용자가 직접 소모품 출고 신청 (인증 없이 접근 가능)

**데이터 흐름**:
```
GET  /api/consumables/items         → 출고 가능 품목 목록
POST /api/consumables/self-outbound → 자가 출고 등록
```

**⚠️ 특이사항**: `/register` 경로는 `centered-layout` (사이드바 없음)

```jsx
// App.jsx에서 centered-layout 처리
const isRegisterPage = location.pathname === '/register'
// → Sidebar, DevEnvBanner, MobileHeader 모두 숨김
```

**디자인 패턴**:
- 단순 폼 레이아웃 (사이드바 없음, 카드 중앙 배치)
- `.app-container.centered-layout` 클래스 자동 적용됨
- 제출 후 성공 메시지 + 폼 초기화

**보안 포인트**:
- 이 페이지만 외부 공유 가능 (직원 스스로 출고 신청)
- 이름/부서 입력은 자유 입력 (검증 없음) — 추후 이메일 검증 권장
- 대량 출고 방지: 1회 최대 수량 제한 권장

---

### 8. 📁 Excel 업로드 — `/upload` → `ExcelUpload.jsx`

**역할**: `ASSET_INFO.xlsx` 업로드로 전체 데이터 일괄 갱신

**데이터 흐름**:
```
POST /api/assets/upload (multipart/form-data) → 전체 시트 파싱 후 Google Sheets에 저장
```

**디자인 패턴**:
- `.upload-area` 드래그앤드롭 존
- 업로드 성공/실패 결과 리스트 표시
- 진행 중 `LoadingModal` 표시 필수 (오래 걸림)

**보안 포인트**:
- `.xlsx` 확장자만 허용 (현재 백엔드에서 처리)
- 파일 크기 제한 없음 → 대용량 파일 서버 부하 가능 → 제한 권장
- 업로드는 전체 데이터를 덮어씀 → 이중 확인 필수

---

### 9. ⚙️ 부서 설정 — `/config` → `DeptConfig.jsx`

**역할**: BU(부서)/ROLE(직책) 목록 관리 (신규 입사자 폼에서 사용)

**데이터 흐름**:
```
GET    /api/assets/config/dept        → BU/ROLE 목록 조회
POST   /api/assets/config/dept/add    → 추가
POST   /api/assets/config/dept/delete → 삭제
```

**디자인 패턴**:
- BU별로 그룹화된 테이블
- 추가 폼은 인라인 (별도 페이지 없음)
- 삭제 시 ConfirmModal

**보안 포인트**:
- BU 삭제 시 해당 BU에 속한 직원 데이터에 영향 없음 (Sheets 직접 참조)
- 의도치 않은 BU 전체 삭제 방지 → 삭제 전 해당 BU 직원 수 표시 권장

---

## 🔒 전역 보안 규칙

### 절대 커밋 금지 파일

```
data/*.json          # Google 서비스 계정 키
*.db, *.sqlite3      # 로컬 DB
.env, .env.*         # 환경변수
deployment_config.json
ASSET_INFO*.xlsx     # 실제 데이터
```

### API 응답 에러 처리 패턴 (프론트)

```jsx
try {
  const { data } = await axios.post('/api/...', payload)
  showToast(data.message || '처리 완료', 'success')
} catch (err) {
  const msg = err?.response?.data?.detail || '오류가 발생했습니다.'
  showToast(msg, 'error')  // 내부 에러 그대로 표시 금지
} finally {
  setLoading(false)
}
```

### 파괴적 작업 필수 확인 목록

| 작업 | 필수 처리 |
|------|----------|
| 행 삭제 (자산/소모품) | `ConfirmModal` |
| 퇴사 확정 (All_User 삭제) | `ConfirmModal` + 텍스트 재입력 |
| 테이블 전체 교체 (Excel 업로드) | `ConfirmModal` |
| 자산 반납 처리 | `ConfirmModal` |

---

## 🔄 새 기능 추가 워크플로우

```
1. docs/exec-plans/active/ 에 스펙 문서 작성
2. config.py 상수 추가 여부 확인
3. 백엔드: router에 엔드포인트 → service에 로직 분리
4. 프론트: 기존 패턴 최대한 재사용 (새 파일 최소화)
5. 로컬 테스트 (uvicorn + npm run dev)
6. git commit → git push → ./deploy.sh
7. docs/exec-plans/completed/ 로 이동
```

### 라우터 추가 위치 판단

```
자산 관련(직원/자산 데이터)  → backend/routers/assets.py
소모품 관련                  → backend/routers/consumables.py
관리 기능(환경/설정)         → backend/routers/admin.py (신규 생성)
```

---

## ⚡ 빠른 디버깅 참조

### 로컬 실행

```bash
# 백엔드 (프로젝트 루트에서)
uvicorn backend.main:app --reload --port 8000

# 프론트엔드 (frontend/ 디렉토리에서)
cd frontend && npm run dev
```

### API 직접 테스트

```bash
# 대시보드 통계
curl http://localhost:8000/api/assets/dashboard

# 자산 목록
curl http://localhost:8000/api/assets/Lease

# 소모품 재고
curl http://localhost:8000/api/consumables/stock/summary
```

### 흔한 오류 & 해결법

| 증상 | 원인 | 해결 |
|------|------|------|
| 소모품 API 400 오류 | 수량 문자열 파싱 실패 | `int(str(qty).replace(",",""))` |
| 토너 재고 미차감 | name_col 대소문자 불일치 | `.str.lower()` 비교 |
| 대시보드 이메일 중복 | All_User에 중복 행 | 이메일 기준 dedup 처리 |
| 배포 후 미반영 | git push 안 됨 | `git status` → commit → push → deploy |
| CORS 오류 (로컬) | 포트 불일치 | vite.config.js proxy 확인 |
