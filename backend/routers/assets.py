from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from backend.services.database import (
    load_from_db, update_db, save_excel_to_db_service,
    normalize_email, get_connection, ASSET_DB_FILE
)
from backend.services.assets_service import (
    get_dashboard_integrated_data,
    perform_bulk_search,
    enrich_data_with_assets,
    return_asset
)
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import pandas as pd
import io
import time
import logging

logger = logging.getLogger(__name__)

# ── 대시보드 통합뷰 캐시 ──────────────────────────────────
_DASHBOARD_CACHE: Dict[str, Any] = {"data": None, "ts": 0.0}
_DASHBOARD_CACHE_TTL = 60  # seconds

def _invalidate_dashboard_cache():
    """데이터 변경 시 대시보드 캐시를 무효화합니다."""
    _DASHBOARD_CACHE["data"] = None
    _DASHBOARD_CACHE["ts"] = 0.0

router = APIRouter(
    prefix="/api/assets",
    tags=["assets"],
    responses={404: {"description": "Not found"}},
)

# ── Pydantic Models ──────────────────────────────────
class RowUpdateRequest(BaseModel):
    asset_type: str
    row_index: int
    updates: Dict[str, Any]

class RowDeleteRequest(BaseModel):
    asset_type: str
    row_indices: List[int]

class NewHireEntry(BaseModel):
    NAME: Optional[str] = ""
    email: Optional[str] = ""
    BU: str = ""
    ROLE: str = ""
    korean_name: str = ""
    join_date: str = ""  # YYYY-MM-DD

class ResignEntry(BaseModel):
    email: str
    resign_date: str = ""  # YYYY-MM-DD

class AssetReturnRequest(BaseModel):
    email: str
    asset_type: Optional[str] = None  # "Lease","iPad","Teams","Monitor","Printer" or None=all
    name: Optional[str] = None
    bu: Optional[str] = None

class DeleteFromMasterRequest(BaseModel):
    email: str
    name: Optional[str] = None

class BuRoleEntry(BaseModel):
    BU: str
    ROLE: str = ""

class BulkSearchRequest(BaseModel):
    search_input: str
    search_type: str = "all"
    search_target: str = "all"

# ── Dashboard ────────────────────────────────────────
@router.get("/dashboard")
def get_dashboard_data():
    dfs = load_from_db()
    summary = {}
    
    dashboard_keys = {
        "Lease": "total_lease",
        "iPad": "total_ipad",
        "Monitor": "total_monitor",
        "Printer": "total_printer",
        "Teams": "total_teams",
    }
    
    if "All_User" in dfs and not dfs["All_User"].empty:
        summary["total_users"] = len(dfs["All_User"])
    if "NewHire" in dfs and not dfs["NewHire"].empty:
        summary["total_newhire"] = len(dfs["NewHire"])
    if "Resign" in dfs and not dfs["Resign"].empty:
        summary["total_resign"] = len(dfs["Resign"])
    
    for key, summary_key in dashboard_keys.items():
        if key in dfs and not dfs[key].empty:
            summary[summary_key] = len(dfs[key])
    
    return summary

@router.get("/dashboard/integrated")
def get_dashboard_integrated():
    """
    Returns the merged 'All Employee Info' view:
    All_User + Lease + iPad + Monitor + Teams + Printer + Resign info
    Now supports multiple assets per user (grouped by email).
    캐시 TTL: 60초 (write 발생 시 자동 무효화)
    """
    global _DASHBOARD_CACHE
    now = time.time()
    if _DASHBOARD_CACHE["data"] is not None and now - _DASHBOARD_CACHE["ts"] < _DASHBOARD_CACHE_TTL:
        logger.debug("대시보드 캐시 히트")
        return _DASHBOARD_CACHE["data"]

    dfs = load_from_db()
    if "All_User" not in dfs or dfs["All_User"].empty:
        return []

    view_df = dfs["All_User"].copy()
    
    # Drop known asset columns from All_User to avoid merge conflicts (_x/_y)
    # This ensures assets are pulled fresh from the dedicated tables as requested.
    asset_cols_to_drop = ["Lease_List", "Ipad_List", "TeamsNum", "Printer", "Monitor", "모니터"]
    cols_present = [c for c in asset_cols_to_drop if c in view_df.columns]
    if cols_present:
        view_df.drop(columns=cols_present, inplace=True)

    # Filter valid emails (원본 대소문자 보존)
    if "email" in view_df.columns:
        view_df["email"] = view_df["email"].astype(str).str.strip()
        view_df = view_df[~view_df["email"].str.lower().isin(["nan", "", "none", "null"])]
        view_df["_email_key"] = view_df["email"].str.lower()
    else:
        return []

    # Helper: Group by email and join values with duplicate marker
    def _group_asset(df, email_col, val_col, target_key):
        if df.empty or email_col not in df.columns or val_col not in df.columns:
            return pd.DataFrame(columns=["_email_key", target_key])
        
        subset = df[[email_col, val_col]].dropna().copy()
        subset["_email_key"] = subset[email_col].astype(str).str.strip().str.lower()
        subset[val_col] = subset[val_col].astype(str).str.strip()
        
        # Filter out invalid values
        subset = subset[~subset[val_col].isin(["", "-", "nan", "None", "null"])]
        if subset.empty:
            return pd.DataFrame(columns=["_email_key", target_key])

        # Group and Join
        def _join_logic(x):
            unique_vals = sorted(list(set(x)))
            if not unique_vals: return "-"
            prefix = "[중복!] " if len(unique_vals) > 1 else ""
            return prefix + ", ".join(unique_vals)

        grouped = subset.groupby("_email_key")[val_col].apply(_join_logic).reset_index()
        return grouped.rename(columns={val_col: target_key})

    # 1. Lease
    if "Lease" in dfs and not dfs["Lease"].empty:
        cols = dfs["Lease"].columns
        target_col = "S/N" if "S/N" in cols else (cols[3] if len(cols) > 3 else cols[0])
        l_sub = _group_asset(dfs["Lease"], "email", target_col, "Lease_List")
        view_df = pd.merge(view_df, l_sub, on="_email_key", how="left")

    # 2. iPad
    if "iPad" in dfs and not dfs["iPad"].empty:
        cols = dfs["iPad"].columns
        target_col = "S/N" if "S/N" in cols else ("Model" if "Model" in cols else cols[0])
        i_sub = _group_asset(dfs["iPad"], "email", target_col, "Ipad_List")
        view_df = pd.merge(view_df, i_sub, on="_email_key", how="left")

    # 3. Monitor
    if "Monitor" in dfs and not dfs["Monitor"].empty:
        m_sub = _group_asset(dfs["Monitor"], "email", "Model", "Monitor")
        view_df = pd.merge(view_df, m_sub, on="_email_key", how="left")

    # 4. Teams
    if "Teams" in dfs and not dfs["Teams"].empty:
        cols = dfs["Teams"].columns
        target_col = next((c for c in ["TeamsNumber", "Number", "전화번호"] if c in cols), None)
        if target_col:
            t_sub = _group_asset(dfs["Teams"], "email", target_col, "TeamsNum")
            view_df = pd.merge(view_df, t_sub, on="_email_key", how="left")

    # 5. Printer
    if "Printer" in dfs and not dfs["Printer"].empty:
        cols = dfs["Printer"].columns
        target_col = next((c for c in ["Additional Information 2", "프린터정보", "Model"] if c in cols), None)
        if target_col:
            p_sub = _group_asset(dfs["Printer"], "email", target_col, "Printer")
            view_df = pd.merge(view_df, p_sub, on="_email_key", how="left")

    # 6. Resign Info
    if "Resign" in dfs and not dfs["Resign"].empty and "email" in dfs["Resign"].columns:
        try:
            r_sub = dfs["Resign"].copy()
            r_sub["_email_key"] = r_sub["email"].astype(str).str.strip().str.lower()
            
            if all(c in r_sub.columns for c in ["년도", "월", "날짜"]):
                r_sub["퇴사정보"] = r_sub.apply(lambda x: f"{int(x['년도'])}년 {int(x['월'])}월 {int(x['날짜'])}일 퇴사" if pd.notnull(x["년도"]) else "퇴사자", axis=1)
            elif "월" in r_sub.columns and "날짜" in r_sub.columns:
                r_sub["퇴사정보"] = r_sub.apply(lambda x: f"{int(x['월'])}월 {int(x['날짜'])}일 퇴사" if pd.notnull(x["월"]) else "퇴사자", axis=1)
            else:
                r_sub["퇴사정보"] = "퇴사자 목록 포함"
            
            r_sub = r_sub[["_email_key", "퇴사정보"]].drop_duplicates("_email_key")
            view_df = pd.merge(view_df, r_sub, on="_email_key", how="left")
        except: pass

    # 임시 병합 키 제거
    if "_email_key" in view_df.columns:
        view_df.drop(columns=["_email_key"], inplace=True)

    # Fill missing cols and handle NaNs
    view_df["퇴사정보"] = view_df.get("퇴사정보", pd.Series()).fillna("-")

    if "모니터" in view_df.columns and "Monitor" not in view_df.columns:
        view_df.rename(columns={"모니터": "Monitor"}, inplace=True)

    desired_cols = ["NAME", "이름", "email", "BU", "ROLE", "Lease_List", "Ipad_List", "TeamsNum", "Printer", "Monitor", "퇴사정보"]
    
    # Fill missing cols
    for col in desired_cols:
        if col not in view_df.columns:
            view_df[col] = "-"
        else:
            view_df[col] = view_df[col].fillna("-")
            
    # Final sort/filter
    result_df = view_df[desired_cols].where(pd.notnull(view_df[desired_cols]), "-")
    result = result_df.to_dict(orient="records")
    # 결과를 캐시에 저장
    _DASHBOARD_CACHE["data"] = result
    _DASHBOARD_CACHE["ts"] = time.time()
    logger.debug(f"대시보드 캐시 갱신 ({len(result)}명)")
    return result

@router.post("/bulk-search")
def bulk_search_assets(req: BulkSearchRequest):
    """
    Search multiple identifiers across selected targets and column types.
    Returns: { "found": [...], "notFound": [...], "found_count": int }

    규칙:
    - 이메일 검색: 정확 일치(exact match), 대소문자 무시
    - 시리얼/전체 검색: 부분 일치(contains)
    - 검색어 1개당 결과 1건 원칙 (대시보드: term당 1건, 개별테이블: table당 1건)
    - found_count = 실제 매칭된 고유 검색어 수 (행 수 X)
    """
    import re
    import pandas as pd

    terms = [t.strip() for t in re.split(r'[\n,;]+', req.search_input) if t.strip()]
    if not terms:
        return {"found": [], "notFound": [], "found_count": 0}

    found_results = []
    found_terms = set()

    def filter_columns_by_type(all_cols, table_key):
        if req.search_type == "email":
            return [c for c in all_cols if c.lower() == "email"]
        elif req.search_type == "serial_laptop":
            if table_key == "Lease":
                return [c for c in all_cols if c in ["S/N", "SNOW Tag"]]
            elif table_key == "dashboard":
                return [c for c in all_cols if c == "Lease_List"]
            return []
        elif req.search_type == "serial_ipad":
            if table_key == "iPad":
                return [c for c in all_cols if c in ["S/N", "전화 번호", "Model"]]
            elif table_key == "dashboard":
                return [c for c in all_cols if c == "Ipad_List"]
            return []
        return all_cols

    def make_mask(series, term_lower, term_original):
        """이메일: 대소문자 구분 + 완전 일치, 그 외: 소문자 포함(contains)"""
        if req.search_type == "email":
            # 이메일은 대소문자까지 완전 일치만 허용
            return series.astype(str).str.strip() == term_original
        normalized = series.astype(str).str.lower().str.strip()
        return normalized.str.contains(term_lower, na=False, regex=False)

    if req.search_target == "dashboard":
        dashboard_data = get_dashboard_integrated()
        if dashboard_data:
            df = pd.DataFrame(dashboard_data)
            search_cols = filter_columns_by_type(df.columns.tolist(), "dashboard")

            for term in terms:
                term_lower = term.lower().strip()
                for col in search_cols:
                    mask = make_mask(df[col], term_lower, term.strip())
                    if mask.any():
                        # term당 첫 번째 매칭 행 1건만 반환 (이메일 1개 = 사용자 1명)
                        first_idx = df[mask].index[0]
                        row = df.loc[first_idx]
                        row_dict = row.where(pd.notnull(row), None).to_dict()
                        found_results.append({
                            "type": "대시보드",
                            "table_key": "dashboard",
                            "match_col": col,
                            "match_term": term,
                            "row_index": int(first_idx),
                            "data": row_dict,
                        })
                        found_terms.add(term)
                        break  # 이 term 완료

    else:
        dfs = load_from_db()
        search_targets = {
            "Lease":    ["S/N", "SNOW Tag", "email", "User", "Model"],
            "iPad":     ["S/N", "전화 번호", "email", "User", "Model"],
            "Teams":    ["TeamsNumber", "Number", "email", "History"],
            "Monitor":  ["Model", "email", "User"],
            "Printer":  ["Model", "email", "프린터정보"],
            "All_User": ["email", "NAME", "이름"],
        }
        type_labels = {
            "Lease": "노트북", "iPad": "아이패드", "Teams": "Teams",
            "Monitor": "모니터", "Printer": "복합기", "All_User": "대시보드",
        }

        target_keys = list(search_targets.keys())
        if req.search_target == "laptop":
            target_keys = ["Lease"]
        elif req.search_target == "ipad":
            target_keys = ["iPad"]

        for term in terms:
            term_lower = term.lower().strip()
            matched_for_term = False

            for table_key in target_keys:
                if table_key not in dfs or dfs[table_key].empty:
                    continue

                df = dfs[table_key]
                available_cols = [c for c in search_targets[table_key] if c in df.columns]
                search_cols = filter_columns_by_type(available_cols, table_key)
                if not search_cols:
                    continue

                # 테이블당 term 1건만 추가 (첫 번째 매칭 컬럼/행)
                for col in search_cols:
                    mask = make_mask(df[col], term_lower, term.strip())
                    if mask.any():
                        first_idx = df[mask].index[0]
                        row = df.loc[first_idx]
                        row_dict = row.where(pd.notnull(row), None).to_dict()
                        found_results.append({
                            "type": type_labels.get(table_key, table_key),
                            "table_key": table_key,
                            "match_col": col,
                            "match_term": term,
                            "row_index": int(first_idx),
                            "data": row_dict,
                        })
                        matched_for_term = True
                        break  # 이 테이블에서 첫 매칭으로 종료

            if matched_for_term:
                found_terms.add(term)

    not_found = [t for t in terms if t not in found_terms]

    return {
        "found": found_results,
        "notFound": not_found,
        "found_count": len(found_terms),  # 실제 매칭된 고유 검색어 수
    }

# ── Asset List (Read) ────────────────────────────────
@router.get("/{asset_type}")
def get_asset_list(asset_type: str):
    dfs = load_from_db()
    if asset_type not in dfs:
        raise HTTPException(status_code=404, detail=f"Asset type '{asset_type}' not found")
    
    df = dfs[asset_type]
    
    # 신규 입사자 및 퇴사자의 경우 실시간 자산 정보 매칭(Enrichment) 수행
    if asset_type in ["NewHire", "Resign"] and not df.empty:
        df = enrich_data_with_assets(df, dfs)
        
    df = df.where(pd.notnull(df), None)
    return df.to_dict(orient="records")
# ── User Lookup (Auto-fill) ──────────────────────────
@router.get("/user/lookup/{email}")
def lookup_user(email: str):
    email = email.strip().lower()
    dfs = load_from_db()
    if "All_User" in dfs and not dfs["All_User"].empty and "email" in dfs["All_User"].columns:
        df = dfs["All_User"]
        mask = df["email"].astype(str).str.strip().str.lower() == email
        if mask.any():
            match = df[mask].iloc[0]
            val = lambda k: str(match.get(k, "")) if pd.notnull(match.get(k)) else ""
            return {"NAME": val("NAME"), "korean_name": val("이름"), "BU": val("BU"), "ROLE": val("ROLE")}
    raise HTTPException(status_code=404, detail="User not found in All_User")

# ── Excel Upload ─────────────────────────────────────
@router.post("/upload")
async def upload_excel(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        save_excel_to_db_service(contents)
        return {"filename": file.filename, "message": "파일이 성공적으로 처리되었습니다."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── CSV Download ─────────────────────────────────────
@router.get("/{asset_type}/download")
def download_asset_csv(asset_type: str):
    dfs = load_from_db()
    if asset_type not in dfs:
        raise HTTPException(status_code=404, detail=f"Asset type '{asset_type}' not found")
    df = dfs[asset_type]
    
    if asset_type in ["NewHire", "Resign"] and not df.empty:
        df = enrich_data_with_assets(df, dfs)
        
    csv_bytes = df.to_csv(index=False).encode("utf-8-sig")
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={asset_type}.csv"}
    )

# ── Row Update (inline editing) ──────────────────────
@router.put("/row/update")
def update_row(req: RowUpdateRequest):
    dfs = load_from_db()
    if req.asset_type not in dfs:
        raise HTTPException(status_code=404, detail=f"Asset type '{req.asset_type}' not found")
    
    df = dfs[req.asset_type]
    if req.row_index < 0 or req.row_index >= len(df):
        raise HTTPException(status_code=400, detail="Invalid row index")
    
    for col, val in req.updates.items():
        if col in df.columns:
            df.at[req.row_index, col] = val
    
    update_db(req.asset_type, df)
    return {"message": "Row updated successfully"}

# ── Row Delete ───────────────────────────────────────
@router.delete("/row/delete")
def delete_rows(req: RowDeleteRequest):
    dfs = load_from_db()
    if req.asset_type not in dfs:
        raise HTTPException(status_code=404, detail=f"Asset type '{req.asset_type}' not found")
    
    df = dfs[req.asset_type]
    valid_indices = [i for i in req.row_indices if 0 <= i < len(df)]
    df = df.drop(index=valid_indices).reset_index(drop=True)
    update_db(req.asset_type, df)
    _invalidate_dashboard_cache()
    return {"message": f"{len(valid_indices)} rows deleted"}

# ── Add Row ──────────────────────────────────────────
@router.post("/row/add")
def add_row(asset_type: str, row_data: Dict[str, Any]):
    dfs = load_from_db()
    if asset_type not in dfs:
        raise HTTPException(status_code=404, detail=f"Asset type '{asset_type}' not found")
    
    df = dfs[asset_type]
    new_row = pd.DataFrame([row_data])
    df = pd.concat([df, new_row], ignore_index=True)
    update_db(asset_type, df)
    return {"message": "Row added successfully"}

# ── Replace Table (CSV/Excel upload per table) ───────
@router.post("/{asset_type}/replace")
async def replace_table(asset_type: str, file: UploadFile = File(...)):
    contents = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
        
        df = normalize_email(df)
        update_db(asset_type, df)
        return {"message": f"{asset_type} 테이블이 업데이트되었습니다."}  
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Save Entire Table ────────────────────────────────
@router.post("/{asset_type}/save")
def save_table(asset_type: str, data: List[Dict[str, Any]]):
    dfs = load_from_db()
    if asset_type not in dfs and asset_type not in ["NewHire", "Resign", "All_User", "Dept_Config"]:
        raise HTTPException(status_code=404, detail=f"Asset type '{asset_type}' not found")
    
    df = pd.DataFrame(data)
    update_db(asset_type, df)
    return {"message": f"{asset_type} 테이블 저장 완료"}

# ── New Hire: Register ───────────────────────────────
@router.post("/newhire/register")
def register_new_hire(entry: NewHireEntry):
    dfs = load_from_db()
    df = dfs.get("NewHire", pd.DataFrame())
    
    email = entry.email.strip().lower() if entry.email else ""
    
    # 파싱 로직
    year, month, day = "", "", ""
    if entry.join_date:
        try:
            dt = datetime.strptime(entry.join_date, "%Y-%m-%d")
            year, month, day = dt.year, dt.month, dt.day
        except:
            pass
            
    new_row = {
        "년": year,
        "월": month,
        "날짜": day,
        "NAME": entry.NAME,
        "이름": entry.korean_name,
        "email": email,
        "BU": entry.BU,
        "ROLE": entry.ROLE,
    }
    
    # Fill columns that exist in the DF
    for col in df.columns:
        if col not in new_row:
            new_row[col] = "-"
    
    new_df = pd.DataFrame([new_row])
    df = pd.concat([df, new_df], ignore_index=True)
    update_db("NewHire", df)
    
    # ── 대시보드(All_User) 자동 추가 연동 (이메일이 있을 경우에만) ──
    if email:
        df_all = dfs.get("All_User", pd.DataFrame())
    if not df_all.empty:
        try:
            max_no = pd.to_numeric(df_all["NO"], errors="coerce").max()
            if pd.isna(max_no): max_no = 0
        except:
            max_no = 0
            
        all_row = {
            "NO": int(max_no) + 1,
            "NAME": entry.NAME if entry.NAME else entry.korean_name,
            "이름": entry.korean_name,
            "email": email,
            "BU": entry.BU,
            "ROLE": entry.ROLE,
        }
        for col in df_all.columns:
            if col not in all_row:
                all_row[col] = "-"
                
        df_all = pd.concat([df_all, pd.DataFrame([all_row])], ignore_index=True)
        update_db("All_User", df_all)
        
    return {"message": f"{email} 입사 등록 완료 (대시보드와 동기화 됨)"}

# ── New Hire: Sync to All_User ───────────────────────
@router.post("/newhire/sync")
def sync_newhire_to_alluser():
    """Sync NewHire list to All_User master table."""
    dfs = load_from_db()
    new_hire_df = dfs.get("NewHire", pd.DataFrame())
    
    if new_hire_df.empty:
        return {"message": "신규 입사자 데이터가 없습니다.", "added": 0, "updated": 0}
    
    # Port logic from sync_new_hire_list_to_all_user_smart
    conn = get_connection(ASSET_DB_FILE)
    try:
        all_user_df = pd.read_sql("SELECT * FROM 'All_User'", conn)
        all_user_df = normalize_email(all_user_df)
    except:
        all_user_df = pd.DataFrame(columns=["NO", "NAME", "이름", "email", "ROLE", "BU"])
    
    try:
        resign_df = pd.read_sql("SELECT * FROM 'Resign'", conn)
        resign_df = normalize_email(resign_df)
        resigned_emails = set(resign_df["email"].dropna().unique()) if "email" in resign_df.columns else set()
    except:
        resigned_emails = set()
    
    added_count = 0
    updated_count = 0
    
    if "email" not in all_user_df.columns:
        all_user_df["email"] = ""
    
    all_user_df = all_user_df.drop_duplicates(subset=["email"])
    all_user_df.set_index("email", inplace=True, drop=False)
    
    try:
        max_no = pd.to_numeric(all_user_df["NO"], errors="coerce").max()
        if pd.isna(max_no): max_no = 0
    except:
        max_no = 0
    
    new_hire_df = normalize_email(new_hire_df)
    rows_to_add = []
    
    for _, row in new_hire_df.iterrows():
        email = str(row.get("email", "")).strip().lower()
        if not email or email in ("nan", "none", ""):
            continue
        if email in resigned_emails:
            continue
        
        new_name_en = row.get("NAME", "")
        new_name_ko = row.get("이름", "")
        new_role = row.get("ROLE", "")
        new_bu = row.get("BU", "")
        
        if email in all_user_df.index:
            all_user_df.at[email, "ROLE"] = new_role
            all_user_df.at[email, "BU"] = new_bu
            updated_count += 1
        else:
            max_no += 1
            final_name = new_name_en if new_name_en else new_name_ko
            rows_to_add.append({
                "NO": max_no, "NAME": final_name, "이름": new_name_ko,
                "email": email, "ROLE": new_role, "BU": new_bu,
            })
            added_count += 1
    
    all_user_df.reset_index(drop=True, inplace=True)
    if rows_to_add:
        all_user_df = pd.concat([all_user_df, pd.DataFrame(rows_to_add)], ignore_index=True)
    
    all_user_df.to_sql("All_User", conn, if_exists="replace", index=False)
    conn.close()
    
    return {"message": f"동기화 완료: {added_count}명 추가, {updated_count}명 업데이트", "added": added_count, "updated": updated_count}

# ── Unassigned Assets ────────────────────────────────
@router.get("/unassigned/list")
def get_unassigned_assets():
    dfs = load_from_db()
    result = {}
    
    for key, label in [("Lease", "노트북"), ("iPad", "아이패드"), ("Monitor", "모니터"), ("Teams", "Teams"), ("Printer", "복합기")]:
        if key in dfs and not dfs[key].empty and "email" in dfs[key].columns:
            unassigned = dfs[key][
                (dfs[key]["email"].isna()) | (dfs[key]["email"] == "")
            ]
            if not unassigned.empty:
                unassigned = unassigned.where(pd.notnull(unassigned), None)
                result[label] = unassigned.to_dict(orient="records")
    
    return result

# ── Resign: Register ─────────────────────────────────
@router.post("/resign/register")
def register_resign(entry: ResignEntry):
    dfs = load_from_db()
    df = dfs.get("Resign", pd.DataFrame())
    
    email = entry.email.strip().lower()
    
    # Parse date
    year, month, day = "", "", ""
    if entry.resign_date:
        try:
            dt = datetime.strptime(entry.resign_date, "%Y-%m-%d")
            year, month, day = dt.year, dt.month, dt.day
        except:
            pass
    
    new_row = {"년": year, "월": month, "날짜": day, "email": email, "설명": "퇴사자 정보 연동 확정"}
    for col in df.columns:
        if col not in new_row:
            new_row[col] = "-"
    
    # Enrich with asset info (자동 매핑)
    new_df = pd.DataFrame([new_row])
    enriched = enrich_data_with_assets(new_df, dfs)
    
    # Check duplicates
    if "email" in df.columns and email in df["email"].values:
        df.loc[df["email"] == email, enriched.columns] = enriched.iloc[0].values
    else:
        df = pd.concat([df, enriched], ignore_index=True)
    
    update_db("Resign", df)
    
    # ── 대시보드(All_User)에서 자동 삭제 및 자산 반납(STOCK 처리) 자동 연동 제거 ──
    # 자산 반납 확인 프로세스를 거친 후, UI에서 '퇴사 확정(삭제)' 버튼을 클릭했을 때만 
    # 대시보드에서 제거되도록 안전 잠금을 적용함.
    # 따라서 등록 단계에서는 대시보드(All_User)에서 정보를 유지함.
        
    return {"message": f"{email} 퇴사 예정자 등록 완료 (대시보드 유지 상태. 자산은 리스트에서 확인 후 수동 반납해주세요)"}

# ── Asset Return ─────────────────────────────────────
@router.post("/resign/return")
def process_asset_return_endpoint(req: AssetReturnRequest):
    return return_asset(req.email, req.asset_type, req.name, req.bu)

# ── Delete from Master ───────────────────────────────
@router.post("/resign/delete-master")
def delete_from_master(req: DeleteFromMasterRequest):
    email = req.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="이메일이 없습니다.")
    try:
        dfs = load_from_db()
        if "All_User" not in dfs or dfs["All_User"].empty:
            return {"success": False, "message": "All_User 데이터를 찾을 수 없습니다."}
            
        df_all = dfs["All_User"].copy()
        if "email" not in df_all.columns:
            return {"success": False, "message": "email 컬럼이 없습니다."}
            
        initial_len = len(df_all)
        
        # Remove user by email
        df_all["_email_lower"] = df_all["email"].astype(str).str.strip().str.lower()
        df_all = df_all[df_all["_email_lower"] != email].drop(columns=["_email_lower"])
        
        deleted = initial_len - len(df_all)
        
        if deleted > 0:
            update_db("All_User", df_all)
            return {"success": True, "message": f"{deleted}명 마스터 DB(구글시트/로컬) 완전 삭제 완료"}
            
        return {"success": False, "message": "삭제할 데이터가 마스터 DB에 없습니다."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── BU/ROLE Config ───────────────────────────────────
@router.get("/config/dept")
def get_dept_config():
    dfs = load_from_db()
    df = dfs.get("Dept_Config", pd.DataFrame())
    if df.empty:
        return {"bu_list": [], "data": []}
    
    bu_list = sorted(df["BU"].dropna().unique().tolist()) if "BU" in df.columns else []
    df = df.where(pd.notnull(df), None)
    return {"bu_list": bu_list, "data": df.to_dict(orient="records")}

@router.post("/config/dept/add")
def add_dept_config(entry: BuRoleEntry):
    dfs = load_from_db()
    df = dfs.get("Dept_Config", pd.DataFrame())
    
    new_row = pd.DataFrame([{"BU": entry.BU.strip(), "ROLE": entry.ROLE.strip()}])
    if df.empty:
        df = new_row
    else:
        df = pd.concat([df, new_row], ignore_index=True)
    
    update_db("Dept_Config", df)
    return {"message": f"'{entry.BU}' / '{entry.ROLE}' 추가 완료"}

@router.post("/config/dept/delete")
def delete_dept_config(entry: BuRoleEntry):
    dfs = load_from_db()
    df = dfs.get("Dept_Config", pd.DataFrame())
    
    if entry.ROLE:
        df = df[~((df["BU"] == entry.BU) & (df["ROLE"] == entry.ROLE))]
    else:
        df = df[df["BU"] != entry.BU]
    
    update_db("Dept_Config", df)
    return {"message": f"삭제 완료"}

# ── Data Integrity Check ─────────────────────────────
@router.get("/{asset_type}/integrity")
def check_integrity(asset_type: str):
    dfs = load_from_db()
    if asset_type not in dfs:
        raise HTTPException(status_code=404, detail="Not found")
    
    df = dfs[asset_type]
    if "email" not in df.columns:
        return {"total": len(df), "matched": 0, "mismatched": 0, "mismatched_emails": []}
    
    asset_emails = set(df["email"].dropna().str.strip().str.lower().tolist()) - {""}
    dash_emails = set(dfs.get("All_User", pd.DataFrame()).get("email", pd.Series()).dropna().str.strip().str.lower().tolist()) if "All_User" in dfs else set()
    
    missing = asset_emails - dash_emails
    return {
        "total": len(asset_emails),
        "matched": len(asset_emails) - len(missing),
        "mismatched": len(missing),
        "mismatched_emails": list(missing),
    }

# Functions moved to assets_service.py
