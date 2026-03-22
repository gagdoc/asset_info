from fastapi import APIRouter, HTTPException, Query, Body
from backend.services.consumables_service import get_available_months, get_items_list, get_outbound_history, get_estimate, add_outbound, save_item
from typing import List, Dict, Any

router = APIRouter(
    prefix="/api/consumables",
    tags=["consumables"],
    responses={404: {"description": "Not found"}},
)

@router.get("/months")
async def list_months():
    """사용 가능한 월(시트) 목록 반환"""
    months = get_available_months()
    return {"months": months}

@router.get("/items")
async def list_items():
    """품목 리스트 반환 ('품목리스트' 시트)"""
    items = get_items_list()
    return items

@router.get("/outbound")
async def list_outbound(month: str = Query(..., description="조회할 월 (예: '3월')")):
    """선택한 월의 출고 이력 반환"""
    history = get_outbound_history(month)
    return history

@router.get("/estimate")
async def get_month_estimate(month: str = Query(..., description="조회할 월 (예: '3월')")):
    """선택한 월의 견적서 데이터 반환"""
    estimate = get_estimate(month)
    return estimate

@router.post("/outbound")
async def create_outbound(data: Dict[str, Any] = Body(...)):
    """월별 출고 데이터 추가"""
    month = data.get("month")
    if not month:
        raise HTTPException(status_code=400, detail="Month is required")
        
    success = add_outbound(month, data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to add outbound record")
    return {"status": "success"}

@router.post("/items")
async def create_or_update_item(data: Dict[str, Any] = Body(...)):
    """품목 마스터 리스트 추가/수정"""
    if not data.get("item_name"):
        raise HTTPException(status_code=400, detail="Item name is required")
        
    success = save_item(data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save item")
    return {"status": "success"}
