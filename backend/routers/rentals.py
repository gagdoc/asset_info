from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
from datetime import datetime
from backend.services.database import load_from_db, update_db
from backend.services.consumables_service import add_outbound, add_purchase_record, invalidate_cache

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
                    
    # "수량" 컬럼 마이그레이션 및 파싱
    if "수량" not in df.columns:
        df["수량"] = 1
        updated = True

    import re
    for idx, row in df.iterrows():
        notes = str(row.get("비고", ""))
        qty_match = re.search(r"\[수량:\s*(\d+)\]", notes)
        if qty_match:
            # 수량 추출 및 비고에서 텍스트 제거
            df.at[idx, "수량"] = int(qty_match.group(1))
            df.at[idx, "비고"] = re.sub(r"\[수량:\s*\d+\]\s*", "", notes)
            updated = True
        
        # 기본 수량이 없는 경우 1로 설정
        if pd.isna(row.get("수량")) or str(row.get("수량")).strip() == "":
            df.at[idx, "수량"] = 1
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

    # 1. 대여 리스트(Rental)에 기록 (재고는 동적 계산 시 자동 차감됨)
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
        
    # 수량 컬럼 초기화 및 값 설정
    if "수량" not in df.columns:
        df["수량"] = 1
    
    qty = int(entry.quantity) if entry.quantity else 1

    new_row = {
        "NO": int(max_no) + 1,
        "대여자 이름": entry.name,
        "대여자 이메일": entry.email,
        "품목명": entry.item_name,
        "대여 일자": entry.rent_date,
        "반납 예정일": entry.expected_return_date,
        "실제 반납일": "",
        "상태": "대여중",
        "비고": entry.notes or "",
        "수량": qty,
    }
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    if entry.expected_return_date and entry.expected_return_date < today_str:
        new_row["상태"] = "연체"
    
    
    new_df = pd.DataFrame([new_row])
    df = pd.concat([df, new_df], ignore_index=True)
    update_db("Rental", df)
    
    # 대여로 인한 재고 변동을 즉각 반영하기 위해 캐시 초기화
    invalidate_cache("items_")
    
    return {"message": "대여 등록 완료"}

@router.put("/{item_no}")
def edit_rental(item_no: int, entry: RentalEntry):
    dfs = load_from_db()
    if "Rental" not in dfs:
        raise HTTPException(status_code=404, detail="Rental table not found")
        
    df = dfs["Rental"]
    
    mask = pd.to_numeric(df["NO"], errors="coerce") == item_no
    if not mask.any():
        raise HTTPException(status_code=404, detail="Item not found")
        
    row_idx = df[mask].index[0]
    
    qty = int(entry.quantity) if entry.quantity else 1
    
    # Ensure 수량 column exists before modifying
    if "수량" not in df.columns:
        df["수량"] = 1
        
    df.loc[row_idx, "대여자 이름"] = entry.name
    df.loc[row_idx, "대여자 이메일"] = entry.email
    df.loc[row_idx, "품목명"] = entry.item_name
    df.loc[row_idx, "대여 일자"] = entry.rent_date
    df.loc[row_idx, "반납 예정일"] = entry.expected_return_date
    df.loc[row_idx, "비고"] = entry.notes or ""
    df.loc[row_idx, "수량"] = qty
    
    # 만약 기존 상태가 '대여중'이거나 '연체'인 경우에만 예정일 비교로 연체 상태 재평가
    current_status = df.loc[row_idx, "상태"]
    if current_status in ["대여중", "연체"]:
        today_str = datetime.now().strftime("%Y-%m-%d")
        if entry.expected_return_date and entry.expected_return_date < today_str:
            df.loc[row_idx, "상태"] = "연체"
        else:
            df.loc[row_idx, "상태"] = "대여중"
            
    update_db("Rental", df)
    invalidate_cache("items_")
    
    return {"message": "대여 수정 완료"}

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
    
    # 더 이상 비고에서 수량을 파싱하지 않아도 됨 (수량 컬럼 사용)
    quantity = df.at[row_idx, "수량"]
    
    # 1. 상태 및 반납일 갱신 (재고는 동적 계산에 의해 자동 복구됨)
    df.at[row_idx, "상태"] = "반납완료"
    df.at[row_idx, "실제 반납일"] = today_str
    
    update_db("Rental", df)
    
    # 반납으로 인한 재고 복구를 즉각 반영하기 위해 캐시 초기화
    invalidate_cache("items_")

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
        
    # 상태를 '출고전환'으로 변경하여 반납 대상에서 제외
    df.at[row_idx, "상태"] = "출고전환"
    
    update_db("Rental", df)
    
    # 이제 공식적으로 출고 내역(Outbound) 시트에 기록 (총 출고량 합산됨)
    month_str = datetime.now().strftime("%Y년 %-m월")
    add_outbound(month_str, {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "item_name": df.at[row_idx, "품목명"],
        "quantity": df.at[row_idx, "수량"],
        "user_name": df.at[row_idx, "대여자 이름"],
        "outbound_type": "대여출고전환",
        "staff": "시스템",
        "delivery": "직접"
    })
    
    # 상태 변경으로 인한 재고 변동(Rental 동적 차감 해제 -> 정식 출고 차감)을 반영하기 위해 캐시 초기화
    invalidate_cache("items_")
    
    return {"message": "영구 출고 전환 완료"}
