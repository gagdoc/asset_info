# AI Copilot Instructions for Asset Management System

## Project Overview
A Streamlit-based corporate asset management application with two main modules:
- **Asset Management**: Employee equipment tracking (PC/Laptop, iPad, Teams, Monitor, Printer)
- **Consumables Management**: Stock inventory and outbound tracking for supplies

The system uses SQLite databases and Pandas DataFrames for data operations, with Excel import as the primary data source.

## Architecture & Data Flow

### Core Data Model
- **Two separate SQLite databases**:
  - `asset_database.db`: Master employee + asset data (shared by both modules)
  - `consumables.db`: Inventory and outbound tracking
  
- **Master data tables** (asset_database.db):
  - `All_User`: Employee master (email as unique identifier)
  - Asset tables: `Lease`, `iPad`, `Teams`, `Printer`, `Monitor`, `Resign`, `NewHire`
  - Configuration: `Dept_Config` (BU and ROLE categories)

### Data Flow Pattern
1. **Excel Upload** → [sheet_name mapping in `SHEET_MAPPING`] → Normalize (email, columns, strips) → SQLite
2. **View Rendering** → `dfs = load_from_db()` (session state) → Display/Edit → `update_db(key, df)` → Sync session
3. **Cross-table operations**: Asset tables join on normalized email to `All_User`; resignations marked in data

### Session State Usage
- `st.session_state["dfs"]` holds all dataframes loaded from database
- **Always cache**: Check if `"dfs"` exists; load once with `load_from_db()` on app start
- After DB updates, sync: `st.session_state["dfs"][key] = updated_df`

## Project-Specific Patterns

### Email Normalization (Critical)
All email fields must be normalized before DB operations:
```python
# Defined in utils.normalize_email()
df["email"] = df["email"].astype(str).str.strip().str.lower()
df["email"] = df["email"].replace(["nan", "none", "null"], "", regex=True)
```
**Why**: Email is the join key across all asset + employee data. Inconsistency breaks data integrity.
### BU/ROLE Hierarchical Management
- **BU (Business Unit)**: 1차 카테고리
- **ROLE**: 2차 카테고리 (BU에 속함)
- Dept_Config 테이블: [BU, ROLE] 형태로 저장
- `get_bu_role_mapping()`: BU → ROLE 매핑 생성 (BU별 ROLE 리스트)
- `get_column_config_with_bu_role()`: selectbox 설정 자동 생성 헬퍼
- 모든 메뉴에서 BU/ROLE selectbox 적용 (선택하거나 자유입력 가능)
### Column Deduplication
Use `deduplicate_columns(df)` when loading Excel sheets (handles merged cell imports):
```python
# Renames duplicates as "ColumnName.0", "ColumnName.1", etc.
```

### Sheet Mapping
[See `SHEET_MAPPING` dict in utils.py](utils.py#L6-L15): Maps SHEET_MAPPING keys to actual Excel sheet names. If sheets are renamed, update mapping. Missing sheets generate empty tables with default columns.

### View Rendering Convention
- **Function signature**: `render_[page_name]_page(dfs)` → located in `views/` directory
- **Routed in app.py**: Radio menu selections call the render function
- **Generic pages**: Teams/Monitor/Printer use shared `render_common_page(dfs, menu_name)` with `page_map` dict
- **Always handle missing tables**: Check `if key not in dfs or dfs[key].empty`

### Data Validation Pattern
See [lease.py](views/lease.py#L15-L30): Email integrity check between asset tables and All_User
```python
asset_emails = set(df["email"]) - dash_emails  # Find unmatched emails
# Display mismatches for user review
```

### Resign Data Handling
- Marked by "퇴사" substring in `퇴사정보` column
- Dashboard highlights resigned rows in orange (`style_resigned_rows`)
- New hire sync blocks resigned users: `sync_new_hire_list_to_all_user_smart()` filters them

## Critical Developer Workflows

### Database Initialization
```bash
# New database created on first Excel upload via app UI
# OR programmatically:
from common.database import init_db
init_db()  # Creates consumables.db with schema + migrations
```

### Running the Application
```bash
streamlit run app.py          # Unified asset + consumables management (single app)
```

### Data Sync Workflow (New Hires)
1. User edits NewHire table in UI
2. `enrich_data_with_assets()` → matches emails to asset data (Lease, iPad, etc.) from `All_User`
3. `sync_new_hire_list_to_all_user_smart()` → merges into All_User, blocks resignations
4. Returns: (added_count, duplicate_list, resigned_list)

### Consumables Module Integration
- **pages_ui/** folder contains consumables dashboard, inventory items, outbound, and reports
- Separate database (`consumables.db`) with schema: `items` (stock + pricing) + `outbound` (transaction history)
- Uses `get_users_detailed()` from [common/database.py](common/database.py#L72) to cross-reference with employee data
- DB migrations auto-apply via `init_db()` (adds missing columns: `current_qty`, `estimate_year`, `estimate_month`)

## Key Files & Their Roles

| File | Purpose |
|------|---------|
| [app.py](app.py) | Main entry: unified asset + consumables app, sidebar menu, DB init, session state, routing |
| [common/utils.py](common/utils.py) | Core: Asset & consumables DB ops, email normalization, data enrichment, file I/O, Excel generation |
| [views/dashboard.py](views/dashboard.py) | Master employee data, dept config CRUD, resigned highlighting |
| [views/new_hire.py](views/new_hire.py) | New hire management with BU/ROLE selectbox from Dept_Config |
| [views/common.py](views/common.py) | Shared logic for Teams/Monitor/Printer pages |
| [common/database.py](common/database.py) | Consumables DB: init, migrations, user lookups |

## Integration Points & Dependencies

- **Streamlit API**: `st.session_state`, `st.data_editor`, `st.file_uploader`, `st.rerun()`
- **External data**: Excel files (ASSET_INFO.xlsx) with named sheets; no external APIs
- **Databases**: SQLite (file-based, no server); auto-created on first upload

## Testing & Debugging

- **Test data flow**: Upload sample Excel, check both databases populate correctly
- **Email validation**: Query DB for null/mismatched emails; see lease.py pattern
- **Session state issues**: Check `st.session_state["dfs"]` in Streamlit inspector (not in code)
- **Schema mismatches**: Run `common.database.init_db()` to apply migrations

## Important Conventions NOT to Break

1. Always normalize emails before DB writes
2. Always deduplicate columns after Excel import
3. Don't hardcode table names; use `SHEET_MAPPING` keys
4. Resign status is determined by text matching, not a boolean flag
5. Asset tables must have `email` column for joins; missing column = data loss risk
