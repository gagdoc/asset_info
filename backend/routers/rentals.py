from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
from datetime import datetime
from backend.services.database import load_from_db, update_db
from backend.services.consumables_service import add_outbound, add_purchase_record

router = APIRouter(
    prefix="/api/rentals",
    tags=["rentals"],
    responses={404: {"description": "Not found"}},
)

class RentalEntry(BaseModel):
    name: str
    email: str
    item_name: str
    quantity: str = "1"
    rent_date: str
    expected_return_date: str = ""
    notes: Optional[str] = ""

@router.get("")
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

@router.post("")
def add_rental(entry: RentalEntry):
    # 출고 데이터 준비
    try:
        dt = datetime.strptime(entry.rent_date, "%Y-%m-%d")
        month_str = f"{dt.year}년 {dt.month}월"
    except:
        now = datetime.now()
        month_str = f"{now.year}년 {now.month}월"

    outbound_data = {
        "date": entry.rent_date,
        "item_name": entry.item_name,
        "quantity": entry.quantity,
        "user_name": entry.name,
        "outbound_type": "대여",
        "staff": "기타(대여)",
        "delivery": "직접"
    }

    # 1. 소모품 출고 내역에 기록 (재고 차감)
    success = add_outbound(month_str, outbound_data)
    if not success:
        pass

    # 2. 대여 리스트(Rental)에 기록
    dfs = load_from_db()
    
    if "Rental" not in dfs:
        df = pd.DataFrame(columns=["NO", "대여자 이름", "대여자 이메일", "품목명", "대여 일자", "반납 예정일", "실제 반납일", "상태", "비고"])
    else:
        df = dfs["Rental"]
        
    try:
        max_no = pd.to_numeric(df["NO"], errors="coerce").max()
        if pd.isna(max_no): max_no = 0
    except:
        max_no = 0
        
    # 수량을 비고에 기록 (나중에 반납 시 참조용)
    notes_with_qty = entry.notes or ""
    if str(entry.quantity) != "1":
        notes_with_qty = f"[수량: {entry.quantity}] " + notes_with_qty

    new_row = {
        "NO": int(max_no) + 1,
        "대여자 이름": entry.name,
        "대여자 이메일": entry.email,
        "품목명": entry.item_name,
        "대여 일자": entry.rent_date,
        "반납 예정일": entry.expected_return_date,
        "실제 반납일": "",
        "상태": "대여중",
        "비고": notes_with_qty,
    }
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    if entry.expected_return_date and entry.expected_return_date < today_str:
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
    
    item_name = str(df.at[row_idx, "품목명"])
    notes = str(df.at[row_idx, "비고"])
    
    # 비고에서 수량 파싱 시도 ([수량: X])
    quantity = "1"
    import re
    qty_match = re.search(r"\[수량:\s*(\d+)\]", notes)
    if qty_match:
        quantity = qty_match.group(1)
    
    # 1. 상태 및 반납일 갱신
    df.at[row_idx, "상태"] = "반납완료"
    df.at[row_idx, "실제 반납일"] = today_str
    
    update_db("Rental", df)

    # 2. 반납 시 소모품 출고 내역에 음수(-) 수량으로 기록하여 실재고 복구
    month_str = datetime.now().strftime("%Y년 %-m월")
    add_outbound(month_str, {
        "date": today_str,
        "item_name": item_name,
        "quantity": -int(quantity),
        "user_name": df.at[row_idx, "대여자 이름"],
        "outbound_type": "대여반납",
        "staff": "기타(대여반납)",
        "delivery": "직접"
    })
    
    # 3. 구매 입고 내역에도 참조용으로 기록 남기기 (재고 차감에는 영향 없음)
    add_purchase_record({
        "date": today_str,
        "item_name": item_name,
        "quantity": quantity,
        "vendor": "대여반납",
        "staff": "시스템",
        "note": f"대여 건(NO:{item_no}) 반납 자동 복구"
    })
    
    return {"message": "반납 처리 완료"}

@router.put("/{item_no}/convert-to-outbound")
def convert_to_outbound(item_no: int):
    dfs = load_from_db()
    if "Rental" not in dfs:
        raise HTTPException(status_code=404, detail="Rental table not found")
        
    df = dfs["Rental"]
    
    # Find row with NO == item_no
    mask = pd.to_numeric(df["NO"], errors="coerce") == item_no
    if not mask.any():
        raise HTTPException(status_code=404, detail="Item not found")
        
    row_idx = df[mask].index[0]
    
    current_status = df.at[row_idx, "상태"]
    if current_status in ["반납완료", "출고전환"]:
        raise HTTPException(status_code=400, detail="이미 처리된 항목입니다.")
        
    df.at[row_idx, "상태"] = "출고전환"
    
    update_db("Rental", df)
    
    return {"message": "영구 출고 전환 완료"}
