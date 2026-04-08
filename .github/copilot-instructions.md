# AI Copilot Instructions for Asset Management System

## Project Overview

A **FastAPI + React** corporate asset management web application.

- **Asset Management**: Employee equipment tracking (Laptop/노트북, iPad, Teams Phone, Monitor, Printer)
- **Consumables Management**: Stock inventory and outbound tracking for supplies

> ⚠️ `views/` and `pages_ui/` contain legacy Streamlit code — do NOT modify or reference these. The active stack is FastAPI (backend) + React/Vite (frontend).

---

## Architecture & Data Flow

```
React SPA (Vite / Port 5173)
        │ HTTP REST (axios)
        ▼
FastAPI Backend (Port 8000)
  ├── backend/routers/assets.py         ← 자산·입사·퇴사·부서 API
  └── backend/routers/consumables.py    ← 소모품 API
        │
        ▼
  backend/services/
  ├── sheets_service.py   ← Google Sheets API (Batch Get, 30s timeout)
  └── database.py         ← load_from_db() / update_db() — Sheets→SQLite fallback
```

**Data Storage Priority**

```
Read:  Google Sheets (primary) → SQLite fallback (on timeout/error)
Write: Google Sheets + SQLite simultaneously (SQLite-only if Sheets fails)
```

**Production**: Docker multi-stage build (Node → React build → Python/FastAPI serves static files) deployed to **Google Cloud Run** (`asia-northeast3`, service: `asset-info`).

---

## Key Files & Their Roles

| File | Role |
|------|------|
| `config.py` | ★ Global constants — DB paths, Sheet IDs, SHEET_MAPPING, ASSET_TYPES, COLUMN_MAPPING |
| `backend/main.py` | FastAPI app init, CORS, router registration, React static file serving |
| `backend/routers/assets.py` | All asset/newhire/resign/dept-config REST endpoints |
| `backend/routers/consumables.py` | Consumables endpoints |
| `backend/services/database.py` | `load_from_db()` and `update_db()` — the only DB access interface |
| `backend/services/sheets_service.py` | Google Sheets read/write with timeout handling |
| `backend/services/consumables_service.py` | Consumables business logic |
| `frontend/src/App.jsx` | SPA routing (all Routes defined here) |
| `frontend/src/index.css` | Global design system (CSS variables, all component styles) |
| `frontend/src/components/Sidebar.jsx` | Navigation sidebar |
| `frontend/src/components/Toast.jsx` | Toast notifications (Context + `useToast` hook) |
| `Dockerfile` | Multi-stage: Node builds React → Python serves FastAPI + static |
| `deploy.sh` | One-command Cloud Run deployment |

---

## Backend Patterns

### DB Access (Always Use These Two Functions)

```python
from backend.services.database import load_from_db, update_db

# Load all tables — returns dict[str, DataFrame]
# Internally: Google Sheets first, SQLite fallback on failure
dfs = load_from_db()
df_lease = dfs["Lease"]        # Laptop assets
df_users = dfs["All_User"]     # Employee master

# Save a table (writes to Sheets + SQLite simultaneously)
update_db("Lease", df_lease)
```

> ⚠️ `load_from_db()` loads all data into memory each call. Avoid calling in tight loops.
> ⚠️ `update_db()` does a full table replace — concurrent edits may conflict.

### Adding a New Endpoint

```python
# backend/routers/assets.py — add to existing router
@router.get("/api/assets/custom-endpoint")
async def my_endpoint():
    dfs = load_from_db()
    # ... business logic
    return {"data": result}
```

**New router file** → register in `backend/main.py`:
```python
from backend.routers import reports
app.include_router(reports.router)
```

### Pydantic Request Models (Required for POST/PUT)

```python
from pydantic import BaseModel
from typing import Optional

class AssetUpdateRequest(BaseModel):
    email: str
    asset_type: str    # "Lease", "iPad", "Monitor", etc.
    column: str
    value: Optional[str] = None
```

### Error Handling

```python
from fastapi import HTTPException

raise HTTPException(status_code=404, detail="자산 타입 없음")
raise HTTPException(status_code=400, detail="유효하지 않은 이메일")
# 500: wrap in try/except and raise HTTPException(status_code=500, detail=str(e))
```

---

## Frontend Patterns

### SPA Routes (defined in `App.jsx`)

| URL | Component | Notes |
|-----|-----------|-------|
| `/dashboard` | `Dashboard` | Summary cards + integrated employee view |
| `/assets/:type` | `AssetList` | type = Lease / iPad / Monitor / Printer / Teams |
| `/consumables` | `Consumables` | Inventory + outbound history |
| `/newhire` | `NewHire` | New employee registration |
| `/resign` | `Resign` | Resignation workflow |
| `/config` | `DeptConfig` | BU/ROLE code management |
| `/upload` | `ExcelUpload` | Bulk Excel upload |
| `/register` | `SelfOutbound` | Public self-service outbound (no auth) |

**Adding a new page:**
1. Create `frontend/src/pages/MyPage.jsx`
2. Add `<Route path="/mypage" element={<MyPage />} />` in `App.jsx`
3. Add navigation link in `Sidebar.jsx`

### API Calls (Always Use React Query)

```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api'

// Read
const { data, isLoading, error } = useQuery({
  queryKey: ['assets', 'Lease'],
  queryFn: () => axios.get(`${API_BASE}/assets/Lease`).then(r => r.data)
})

// Write
const queryClient = useQueryClient()
const mutation = useMutation({
  mutationFn: (payload) => axios.put(`${API_BASE}/assets/row/update`, payload),
  onSuccess: () => {
    queryClient.invalidateQueries(['assets', 'Lease'])  // invalidate → auto-refetch
    showToast('저장 완료!', 'success')
  },
  onError: (err) => showToast(`오류: ${err.response?.data?.detail || err.message}`, 'error')
})
```

> Do NOT call `axios.get()` directly inside render — always use `useQuery`.

### Toast Notifications

```jsx
import { useToast } from '../components/Toast'
const { showToast } = useToast()

showToast('저장 완료!', 'success')   // green
showToast('오류 발생!', 'error')     // red
showToast('처리 중...', 'info')      // blue
```

### Component Conventions

- Filenames: **PascalCase** (`MyNewPage.jsx`)
- Styles: reuse existing CSS classes from `index.css` first; inline styles only for dynamic values
- Modals: `ConfirmModal` for confirmations, `LoadingModal` for async ops
- Dropdowns with search: use `SearchableSelect` component

---

## Data Model

### Tables (Google Sheets tabs = SQLite tables)

| Key | Sheets Tab | Description |
|-----|-----------|-------------|
| `All_User` | `All_User` | Employee master — **email is the join key** |
| `Lease` | `Lease_List` | Laptop assets |
| `iPad` | `Ipad_List` | iPad assets |
| `Teams` | `TeamsNumber` | Teams phone numbers |
| `Printer` | `Printer` | Printers |
| `Monitor` | `Monitor` | Monitors |
| `Resign` | `퇴사자` | Resignation records |
| `NewHire` | `신규입사자` | New hire records |
| `Dept_Config` | `Dept_Config` | BU/ROLE codes |

**Consumables DB** (`consumables.db` — separate):
- `consumables_master`: Item master (stock, unit price)
- `consumables_outbound`: Outbound transaction history

### Email Normalization (Critical — Applied Automatically)

```python
# All emails must be normalized before any DB write
df["email"] = df["email"].astype(str).str.strip().str.lower()
df["email"] = df["email"].replace(["nan", "none", "null"], "", regex=True)
```

- Email is the **join key** across all tables — inconsistency breaks data integrity
- Unassigned assets have `email = ""`

### BU/ROLE Hierarchy

- **BU** (Business Unit): primary category
- **ROLE**: secondary category (belongs to a BU)
- Stored in `Dept_Config` table: `[BU, ROLE]`

### Resignation Status

Resigned employees are identified by `"퇴사"` substring in data — **not a boolean flag**.

---

## Configuration (`config.py`)

All global constants live here. **Change settings here without touching business logic.**

```python
DB_FILE = "asset_database.db"
CONSUMABLES_DB_FILE = "consumables.db"
SPREADSHEET_ID = "1__8NXfK6ruhlQtnomhIi_sjdkHgLD0C2N1Mw4P3GW7g"
SHEET_MAPPING = {"All_User": "All_User", "Lease": "Lease_List", ...}
ASSET_TYPES = {"Lease": "노트북", "iPad": "아이패드", ...}
```

**Adding a new asset type** requires updating 4 dicts in `config.py`:
`SHEET_MAPPING`, `ASSET_TYPES`, `COLUMN_MAPPING`, `DEFAULT_SCHEMAS`

---

## Environment Variables

| Variable | Where Used | Notes |
|----------|-----------|-------|
| `GOOGLE_CREDENTIALS_JSON` | Cloud Run env var | Service account key JSON string |
| `VITE_API_BASE` | Frontend `.env` | API base URL (default: `http://localhost:8000/api`) |

Local dev: place service account key JSON in `data/` folder (auto-detected by `config.py`).
Cloud: inject as `GOOGLE_CREDENTIALS_JSON` env var in Cloud Run.

---

## Local Development

```bash
# Terminal 1 — Backend
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
# Swagger UI: http://localhost:8000/docs

# Terminal 2 — Frontend
cd frontend && npm install && npm run dev
# App: http://localhost:5173
```

---

## Deployment (Google Cloud Run)

```bash
./deploy.sh
# → Docker multi-stage build → push to Artifact Registry → deploy to Cloud Run
# Production URL: https://asset-info-1015498761413.asia-northeast3.run.app
```

---

## Critical Conventions — Never Break These

1. Always normalize emails before DB writes (`str.strip().str.lower()`, NaN → `""`)
2. Always deduplicate columns after Excel import (`deduplicate_columns(df)`)
3. Never hardcode table names — use `SHEET_MAPPING` keys from `config.py`
4. Resign status is text-matching (`"퇴사"` substring), not a boolean flag
5. Asset tables must have an `email` column — missing column causes data loss
6. Never commit `data/*.json`, `*.db`, `*.xlsx`, or `.env` files to Git
7. All frontend API calls must go through `useQuery`/`useMutation` (no raw `axios` in render)
