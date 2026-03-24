from fastapi import APIRouter, HTTPException, Query, Body, Path
from backend.services.consumables_service import (
    get_available_months, get_items_list, get_outbound_history,
    get_estimate, add_outbound, save_item, update_outbound_history,
    delete_outbound_history, get_item_outbound_history,
    create_month_sheet
)
from typing import List, Dict, Any

router = APIRouter(
    prefix="/api/consumables",
    tags=["consumables"],
    responses={404: {"description": "Not found"}},
)

@router.get("/months")
def list_months():
    """사용 가능한 월(시트) 목록 반환"""
    months = get_available_months()
    return {"months": months}

@router.post("/months")
def add_new_month(data: Dict[str, str] = Body(...)):
    """새로운 월의 출고 내역 시트 생성"""
    month_name = data.get("month")
    start_date = data.get("start_date", "")
    if not month_name:
        raise HTTPException(status_code=400, detail="새로운 월 이름이 필요합니다.")
        
    success = create_month_sheet(month_name, start_date)
    if not success:
        raise HTTPException(status_code=500, detail="이미 존재하는 월이거나 구글 시트 생성에 실패했습니다.")
    return {"status": "success"}

@router.get("/items")
def list_items(month: str = Query(None)):
    """품목 리스트 반환 ('품목리스트' 시트) 및 선택적 월별 출고합산"""
    items = get_items_list(month=month)
    return items

@router.get("/items/{item_name}/outbound")
def list_item_outbounds(item_name: str = Path(..., description="조회할 품목 이름")):
    """선택한 단일 품목의 전체 시트(월) 기준 과거 출고 이력 조회"""
    history = get_item_outbound_history(item_name)
    return history

@router.get("/outbound")
def list_outbound(month: str = Query(..., description="조회할 월 (예: '3월')")):
    """선택한 월의 출고 이력 반환"""
    history = get_outbound_history(month)
    return history

@router.get("/estimate")
def get_month_estimate(month: str = Query(..., description="조회할 월 (예: '3월')")):
    """선택한 월의 견적서 데이터 반환"""
    estimate = get_estimate(month)
    return estimate

@router.post("/outbound")
def create_outbound(data: Dict[str, Any] = Body(...)):
    """월별 출고 데이터 추가"""
    month = data.get("month")
    if not month:
        raise HTTPException(status_code=400, detail="Month is required")
        
    success = add_outbound(month, data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to add outbound record")
    return {"status": "success"}

@router.post("/items")
def create_or_update_item(data: Dict[str, Any] = Body(...)):
    """품목 마스터 리스트 추가/수정"""
    if not data.get("item_name"):
        raise HTTPException(status_code=400, detail="Item name is required")
        
    success = save_item(data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save item")
    return {"status": "success"}

@router.put("/outbound")
def update_outbound(data: Dict[str, Any] = Body(...)):
    """월별 출고 개별 데이터 수정"""
    month = data.get("month")
    row_index = data.get("row_index")
    if not month or not row_index:
        raise HTTPException(status_code=400, detail="Month and row_index are required")
        
    success = update_outbound_history(month, int(row_index), data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update outbound record")
    return {"status": "success"}

@router.delete("/outbound")
def delete_outbound(month: str = Query(...), row_index: int = Query(...)):
    """월별 출고 개별 데이터 삭제"""
    success = delete_outbound_history(month, row_index)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete outbound record")
    return {"status": "success"}
