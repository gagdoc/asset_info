from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
from datetime import datetime
from backend.services.database import load_from_db, update_db

router = APIRouter(
    prefix="/api/rentals",
    tags=["rentals"],
    responses={404: {"description": "Not found"}},
)

class RentalEntry(BaseModel):
    name: str
    email: str
    item_name: str
    rent_date: str
    expected_return_date: str
    notes: Optional[str] = ""

@router.get("/")
def get_rentals():
    dfs = load_from_db()
    if "Rental" not in dfs:
        return []
    
    df = dfs["Rental"]
    
    # 상태 자동 업데이트 (연체 체크)
    today_str = datetime.now().strftime("%Y-%m-%d")
    updated = False
    
    if not df.empty and "상태" in df.columns and "반납 예정일" in df.columns:
        for idx, row in df.iterrows():
            if str(row.get("상태", "")) == "대여중":
                exp_date = str(row.get("반납 예정일", "")).strip()
                if exp_date and exp_date < today_str:
                    df.at[idx, "상태"] = "연체"
                    updated = True
                    
    if updated:
        update_db("Rental", df)

    df = df.where(pd.notnull(df), None)
    return df.to_dict(orient="records")

@router.post("/")
def add_rental(entry: RentalEntry):
    dfs = load_from_db()
    
    # Rental 테이블이 없으면 생성
    if "Rental" not in dfs:
        df = pd.DataFrame(columns=["NO", "대여자 이름", "대여자 이메일", "품목명", "대여 일자", "반납 예정일", "실제 반납일", "상태", "비고"])
    else:
        df = dfs["Rental"]
        
    try:
        max_no = pd.to_numeric(df["NO"], errors="coerce").max()
        if pd.isna(max_no): max_no = 0
    except:
        max_no = 0
        
    new_row = {
        "NO": int(max_no) + 1,
        "대여자 이름": entry.name,
        "대여자 이메일": entry.email,
        "품목명": entry.item_name,
        "대여 일자": entry.rent_date,
        "반납 예정일": entry.expected_return_date,
        "실제 반납일": "",
        "상태": "대여중",
        "비고": entry.notes,
    }
    
    # 연체 체크
    today_str = datetime.now().strftime("%Y-%m-%d")
    if entry.expected_return_date < today_str:
        new_row["상태"] = "연체"
    
    new_df = pd.DataFrame([new_row])
    df = pd.concat([df, new_df], ignore_index=True)
    update_db("Rental", df)
    
    return {"message": "대여 등록 완료"}

@router.put("/{item_no}/return")
def return_rental(item_no: int):
    dfs = load_from_db()
    if "Rental" not in dfs:
        raise HTTPException(status_code=404, detail="Rental table not found")
        
    df = dfs["Rental"]
    
    # Find row with NO == item_no
    mask = pd.to_numeric(df["NO"], errors="coerce") == item_no
    if not mask.any():
        raise HTTPException(status_code=404, detail="Item not found")
        
    row_idx = df[mask].index[0]
    
    if df.at[row_idx, "상태"] == "반납완료":
        raise HTTPException(status_code=400, detail="이미 반납완료된 항목입니다.")
        
    today_str = datetime.now().strftime("%Y-%m-%d")
    df.at[row_idx, "실제 반납일"] = today_str
    df.at[row_idx, "상태"] = "반납완료"
    
    update_db("Rental", df)
    
    return {"message": "반납 처리 완료"}
