from fastapi import APIRouter, HTTPException, Body
from backend.services.consumables_service import get_items, add_item, get_outbound_history, add_outbound
from typing import List, Dict, Any

router = APIRouter(
    prefix="/api/consumables",
    tags=["consumables"],
    responses={404: {"description": "Not found"}},
)

@router.get("/items")
async def list_items(year: int = None, month: int = None):
    return get_items(year, month)

@router.post("/items")
async def create_or_update_item(item: Dict[str, Any] = Body(...)):
    success = add_item(item)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save item")
    return {"message": "Item saved successfully"}

@router.get("/outbound")
async def list_outbound():
    return get_outbound_history()

@router.post("/outbound")
async def create_outbound(data: Dict[str, Any] = Body(...)):
    success = add_outbound(data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save outbound record")
    return {"message": "Outbound record saved successfully"}
