from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from backend.services.database import (
    load_from_db, update_db, save_excel_to_db_service,
    normalize_email, get_connection, ASSET_DB_FILE
)
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import pandas as pd
import io

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
    """
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

    # Filter valid emails
    if "email" in view_df.columns:
        view_df["email"] = view_df["email"].astype(str).str.strip().str.lower()
        view_df = view_df[~view_df["email"].isin(["nan", "", "none", "null"])]
    else:
        return []

    # Helper: Group by email and join values with duplicate marker
    def _group_asset(df, email_col, val_col, target_key):
        if df.empty or email_col not in df.columns or val_col not in df.columns:
            return pd.DataFrame(columns=["email", target_key])
        
        subset = df[[email_col, val_col]].dropna().copy()
        subset["email"] = subset["email"].astype(str).str.strip().str.lower()
        subset[val_col] = subset[val_col].astype(str).str.strip()
        
        # Filter out invalid values
        subset = subset[~subset[val_col].isin(["", "-", "nan", "None", "null"])]
        if subset.empty:
            return pd.DataFrame(columns=["email", target_key])

        # Group and Join
        def _join_logic(x):
            unique_vals = sorted(list(set(x)))
            if not unique_vals: return "-"
            prefix = "[중복!] " if len(unique_vals) > 1 else ""
            return prefix + ", ".join(unique_vals)

        grouped = subset.groupby("email")[val_col].apply(_join_logic).reset_index()
        return grouped.rename(columns={val_col: target_key})

    # 1. Lease
    if "Lease" in dfs and not dfs["Lease"].empty:
        cols = dfs["Lease"].columns
        target_col = "S/N" if "S/N" in cols else (cols[3] if len(cols) > 3 else cols[0])
        l_sub = _group_asset(dfs["Lease"], "email", target_col, "Lease_List")
        view_df = pd.merge(view_df, l_sub, on="email", how="left")

    # 2. iPad
    if "iPad" in dfs and not dfs["iPad"].empty:
        cols = dfs["iPad"].columns
        target_col = "S/N" if "S/N" in cols else ("Model" if "Model" in cols else cols[0])
        i_sub = _group_asset(dfs["iPad"], "email", target_col, "Ipad_List")
        view_df = pd.merge(view_df, i_sub, on="email", how="left")

    # 3. Monitor
    if "Monitor" in dfs and not dfs["Monitor"].empty:
        m_sub = _group_asset(dfs["Monitor"], "email", "Model", "Monitor")
        view_df = pd.merge(view_df, m_sub, on="email", how="left")

    # 4. Teams
    if "Teams" in dfs and not dfs["Teams"].empty:
        cols = dfs["Teams"].columns
        target_col = next((c for c in ["LineURI", "Number", "전화번호", "Number formated for Country"] if c in cols), None)
        if target_col:
            t_sub = _group_asset(dfs["Teams"], "email", target_col, "TeamsNum")
            view_df = pd.merge(view_df, t_sub, on="email", how="left")

    # 5. Printer
    if "Printer" in dfs and not dfs["Printer"].empty:
        cols = dfs["Printer"].columns
        target_col = next((c for c in ["Additional Information 2", "프린터정보", "Model"] if c in cols), None)
        if target_col:
            p_sub = _group_asset(dfs["Printer"], "email", target_col, "Printer")
            view_df = pd.merge(view_df, p_sub, on="email", how="left")

    # 6. Resign Info
    if "Resign" in dfs and not dfs["Resign"].empty and "email" in dfs["Resign"].columns:
        try:
            r_sub = dfs["Resign"].copy()
            r_sub["email"] = r_sub["email"].astype(str).str.strip().str.lower()
            
            if all(c in r_sub.columns for c in ["년도", "월", "날짜"]):
                r_sub["퇴사정보"] = r_sub.apply(lambda x: f"{int(x['년도'])}년 {int(x['월'])}월 {int(x['날짜'])}일 퇴사" if pd.notnull(x["년도"]) else "퇴사자", axis=1)
            elif "월" in r_sub.columns and "날짜" in r_sub.columns:
                r_sub["퇴사정보"] = r_sub.apply(lambda x: f"{int(x['월'])}월 {int(x['날짜'])}일 퇴사" if pd.notnull(x["월"]) else "퇴사자", axis=1)
            else:
                r_sub["퇴사정보"] = "퇴사자 목록 포함"
            
            r_sub = r_sub[["email", "퇴사정보"]].drop_duplicates("email")
            view_df = pd.merge(view_df, r_sub, on="email", how="left")
        except: pass

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
    return result_df.to_dict(orient="records")

# ── Asset List (Read) ────────────────────────────────
@router.get("/{asset_type}")
def get_asset_list(asset_type: str):
    dfs = load_from_db()
    if asset_type not in dfs:
        raise HTTPException(status_code=404, detail=f"Asset type '{asset_type}' not found")
    
    df = dfs[asset_type]
    
    # 신규 입사자 및 퇴사자의 경우 실시간 자산 정보 매칭(Enrichment) 수행
    if asset_type in ["NewHire", "Resign"] and not df.empty:
        df = _enrich_data_with_assets(df, dfs)
        
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
        df = _enrich_data_with_assets(df, dfs)
        
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
    enriched = _enrich_data_with_assets(new_df, dfs)
    
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
    email = req.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="이메일이 없습니다.")
    
    today_str = datetime.now().strftime("%Y%m%d")
    dfs = load_from_db()
    updated_tables = []
    
    eng_name = req.name or "Unknown"
    user_bu = req.bu or "Unknown"
    
    if (eng_name == "Unknown" or user_bu == "Unknown") and "All_User" in dfs and not dfs["All_User"].empty:
        clean_email = email.split('@')[0] if '@' in email else email
        mask = dfs["All_User"]["email"].str.strip().str.lower().str.contains(clean_email, na=False)
        user_row = dfs["All_User"][mask]
        if not user_row.empty:
            if eng_name == "Unknown":
                eng_name = str(user_row.iloc[0].get("NAME", "Unknown")).strip()
            if user_bu == "Unknown":
                user_bu = str(user_row.iloc[0].get("BU", "Unknown")).strip()
    
    if eng_name == "Unknown":
        eng_name = email.split('@')[0]
    
    teams_label = f"{user_bu}/{eng_name}" if user_bu != "Unknown" else eng_name
    
    def process_table(table_key, label, extra_updates=None):
        if table_key in dfs and not dfs[table_key].empty and "email" in dfs[table_key].columns:
            mask = dfs[table_key]["email"].str.strip().str.lower() == email
            if mask.any():
                dfs[table_key].loc[mask, "email"] = ""
                if extra_updates:
                    for col, val in extra_updates.items():
                        if col in dfs[table_key].columns:
                            dfs[table_key].loc[mask, col] = val
                update_db(table_key, dfs[table_key])
                return label
        return None
    
    asset_type = req.asset_type
    
    if asset_type in (None, "Lease", ""):
        res = process_table("Lease", "PC/노트북", {
            "User": "STOCK", "BU": "IT",
            "Additional Information": f"{today_str}/{email}/반납"
        })
        if res: updated_tables.append(res)
    
    if asset_type in (None, "iPad", ""):
        res = process_table("iPad", "아이패드", {
            "User": "STOCK", "BU": "IT", "Role": "IT",
            "Additional Information": f"{today_str}/{email}/반납"
        })
        if res: updated_tables.append(res)
    
    if asset_type in (None, "Teams", ""):
        res = process_table("Teams", "팀즈 번호", {
            "Business Title": f"{teams_label} 사용한 번호"
        })
        if res: updated_tables.append(res)
    
    if asset_type in (None, "Monitor", ""):
        res = process_table("Monitor", "모니터", {
            "Additional Information": f"{today_str}/{email}/반납"
        })
        if res: updated_tables.append(res)
    
    if asset_type in (None, "Printer", ""):
        res = process_table("Printer", "프린터", {
            "Additional Information": f"{today_str}/{email}/반납"
        })
        if res: updated_tables.append(res)
    
    # ALWAYS clear Resign table to fix any desync or stuck users
    # ALWAYS clear Resign table to fix any desync or stuck users
    if "Resign" in dfs and not dfs["Resign"].empty and "email" in dfs["Resign"].columns:
        mask = dfs["Resign"]["email"].str.strip().str.lower() == email
        if mask.any():
            cols_to_clear = []
            if req.asset_type == "Lease": cols_to_clear = ["노트북"]
            elif req.asset_type == "iPad": cols_to_clear = ["아이패드"]
            elif req.asset_type == "Monitor": cols_to_clear = ["모니터"]
            elif req.asset_type == "Printer": cols_to_clear = ["복합기"]
            elif req.asset_type == "Teams": cols_to_clear = ["Teams"]
            else: cols_to_clear = ["노트북", "아이패드", "모니터", "복합기", "Teams"]

            for col in cols_to_clear:
                if col in dfs["Resign"].columns:
                    dfs["Resign"].loc[mask, col] = "-"
            update_db("Resign", dfs["Resign"])
            # Return success even if we only caught up a desynced Resign table
            if not updated_tables:
                return {"success": True, "message": "동기화 완료: 기존 반납 상태가 대시보드에 반영되었습니다."}

    if updated_tables:
        return {"success": True, "message": f"반납 처리 완료: {', '.join(updated_tables)}"}
        
    return {"success": False, "message": "해당 이메일로 할당된 자산이 없습니다."}

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

# ── Helper: Enrich data with assets ──────────────────
def _enrich_data_with_assets(target_df, dfs):
    target_df = normalize_email(target_df)
    
    asset_map = {"NAME": {}, "BU": {}, "노트북": {}, "아이패드": {}, "모니터": {}, "Teams": {}, "복합기": {}}
    
    def robust_to_dict(df_src, email_col, val_col):
        if df_src.empty or email_col not in df_src.columns or val_col not in df_src.columns:
            return {}
        df_clean = df_src[[email_col, val_col]].dropna().copy()
        df_clean[email_col] = df_clean[email_col].astype(str).str.strip().str.lower()
        df_clean[val_col] = df_clean[val_col].astype(str).str.strip().str.lstrip("=")
        placeholders = ["", "-", "nan", "None", ".", "0", "없음"]
        df_clean = df_clean[~df_clean[val_col].isin(placeholders)]
        if df_clean.empty: return {}
        return df_clean.groupby(email_col)[val_col].apply(lambda x: ", ".join(sorted(set(x)))).to_dict()
    
    if "All_User" in dfs and not dfs["All_User"].empty:
        df_users = dfs["All_User"].dropna(subset=["email"])
        if "NAME" in df_users.columns:
            asset_map["NAME"] = {str(k).strip().lower(): v for k, v in df_users.set_index("email")["NAME"].to_dict().items()}
        if "BU" in df_users.columns:
            asset_map["BU"] = {str(k).strip().lower(): v for k, v in df_users.set_index("email")["BU"].to_dict().items()}
    
    if "Lease" in dfs and not dfs["Lease"].empty:
        cols = dfs["Lease"].columns
        target_col = "S/N" if "S/N" in cols else (cols[3] if len(cols) > 3 else cols[0])
        asset_map["노트북"].update(robust_to_dict(dfs["Lease"], "email", target_col))
    
    if "iPad" in dfs and not dfs["iPad"].empty:
        cols = dfs["iPad"].columns
        target_col = "S/N" if "S/N" in cols else ("Model" if "Model" in cols else cols[0])
        asset_map["아이패드"].update(robust_to_dict(dfs["iPad"], "email", target_col))
    
    if "Monitor" in dfs and not dfs["Monitor"].empty:
        cols = dfs["Monitor"].columns
        target_col = "Model" if "Model" in cols else cols[0]
        asset_map["모니터"].update(robust_to_dict(dfs["Monitor"], "email", target_col))
    
    if "Teams" in dfs and not dfs["Teams"].empty:
        cols = dfs["Teams"].columns
        target_col = next((c for c in ["LineURI", "Number", "전화번호"] if c in cols), None)
        if not target_col:
            target_col = next((c for c in cols if c != "email"), cols[0])
        asset_map["Teams"].update(robust_to_dict(dfs["Teams"], "email", target_col))
    
    if "Printer" in dfs and not dfs["Printer"].empty and "email" in dfs["Printer"].columns:
        cols = dfs["Printer"].columns
        target_col = next((c for c in ["Model", "프린터정보"] if c in cols), None)
        if not target_col:
            target_col = next((c for c in cols if c != "email"), cols[0])
        asset_map["복합기"].update(robust_to_dict(dfs["Printer"], "email", target_col))
    
    enrich_cols = {"NAME": "NAME", "BU": "BU", "노트북": "노트북", "아이패드": "아이패드", "모니터": "모니터", "Teams": "Teams", "복합기": "복합기"}
    
    for col in enrich_cols.keys():
        if col not in target_df.columns:
            target_df[col] = None
    
    for idx, row in target_df.iterrows():
        email = str(row.get("email", "")).strip().lower()
        if not email: continue
        for df_col, map_key in enrich_cols.items():
            val = target_df.at[idx, df_col]
            new_val = asset_map[map_key].get(email)
            
            if map_key in ["노트북", "아이패드", "모니터", "Teams", "복합기"]:
                # Assets MUST always reflect the LIVE master DB state
                target_df.at[idx, df_col] = str(new_val) if new_val else "-"
            else:
                # NAME and BU inherit master data ONLY if missing
                if pd.isna(val) or str(val).strip() in ["", "-", "nan", "None", ".", "0"]:
                    target_df.at[idx, df_col] = str(new_val) if new_val else "-"
                
    # Add deletion flag based on master DB
    target_df["_is_deleted"] = True
    if "All_User" in dfs and not dfs["All_User"].empty and "email" in dfs["All_User"].columns:
        master_emails = set(dfs["All_User"]["email"].dropna().astype(str).str.strip().str.lower())
        if "email" in target_df.columns:
            target_df["_is_deleted"] = ~target_df["email"].astype(str).str.strip().str.lower().isin(master_emails)
    
    return target_df
