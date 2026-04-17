from fastapi import APIRouter, HTTPException, Query, Body, Path
from fastapi.responses import StreamingResponse
from backend.services.consumables_service import (
    get_available_months, get_items_list, get_outbound_history,
    get_estimate, add_outbound, save_item, update_outbound_history,
    delete_outbound_history, get_item_outbound_history,
    create_month_sheet, invalidate_cache, get_tonner_consignment_history,
    get_toner_inventory, update_toner_item, delete_item,
)
from typing import List, Dict, Any
import io
import os
from datetime import datetime

router = APIRouter(
    prefix="/api/consumables",
    tags=["consumables"],
    responses={404: {"description": "Not found"}},
)

@router.get("/clear-cache")
def clear_consumables_cache():
    """서버 캐시를 강제로 비워 구글 시트 최신 데이터를 불러올 수 있게 함"""
    invalidate_cache()
    return {"status": "success", "message": "Cache cleared."}

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

@router.get("/estimate/download")
def download_estimate_excel(month: str = Query(..., description="다운로드할 월 (예: '3월')")):
    """선택한 월의 견적서를 Excel 파일로 다운로드 (template 없이 직접 생성)"""
    try:
        import openpyxl
        from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
        from openpyxl.utils import get_column_letter
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl 패키지가 필요합니다.")

    try:
        estimate = get_estimate(month)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"견적 데이터 조회 오류: {str(e)}")

    if not estimate:
        raise HTTPException(status_code=404, detail=f"{month} 견적 데이터가 없습니다.")

    today_str = datetime.now().strftime("%Y%m%d")
    today_fmt = datetime.now().strftime("%Y-%m-%d")

    # ── 스타일 헬퍼 ────────────────────────────────────────────────
    def thin_border(top=False, bottom=False, left=False, right=False):
        s = Side(border_style="thin", color="000000")
        return Border(
            top=s if top else Side(),
            bottom=s if bottom else Side(),
            left=s if left else Side(),
            right=s if right else Side(),
        )

    def set_cell(ws, coord, value, bold=False, size=10, align="left",
                 valign="center", num_fmt=None, fill=None, border=None):
        c = ws[coord]
        c.value = value
        c.font = Font(bold=bold, size=size, name="맑은 고딕")
        c.alignment = Alignment(horizontal=align, vertical=valign, wrap_text=True)
        if num_fmt:
            c.number_format = num_fmt
        if fill:
            c.fill = fill
        if border:
            c.border = border

    # ── 워크북 생성 ────────────────────────────────────────────────
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"견적서_{month}"

    # 열 너비 설정 (A:숨김, B:NO, C:ITEM, D:품목명, E:수량, F:단가, G:금액)
    ws.column_dimensions["A"].width = 2
    ws.column_dimensions["B"].width = 6
    ws.column_dimensions["C"].width = 18
    ws.column_dimensions["D"].width = 40
    ws.column_dimensions["E"].width = 8
    ws.column_dimensions["F"].width = 14
    ws.column_dimensions["G"].width = 16

    # ── 헤더 영역 ──────────────────────────────────────────────────
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    title_font = Font(bold=True, size=16, color="FFFFFF", name="맑은 고딕")

    # 제목
    ws.merge_cells("B2:G2")
    c = ws["B2"]
    c.value = "소 모 품 견 적 서"
    c.font = title_font
    c.alignment = Alignment(horizontal="center", vertical="center")
    c.fill = header_fill
    ws.row_dimensions[2].height = 36

    # 날짜 / 견적번호
    ws.row_dimensions[3].height = 18
    set_cell(ws, "B3", "발행일자", bold=True, size=9, align="center")
    ws.merge_cells("C3:D3")
    set_cell(ws, "C3", today_fmt, size=9)
    set_cell(ws, "F3", "No.", bold=True, size=9, align="center")
    month_num = ''.join(filter(str.isdigit, month))
    set_cell(ws, "G3", f"{today_str}-{month_num}", size=9, align="center")

    # 월 정보
    ws.row_dimensions[4].height = 18
    ws.merge_cells("B4:G4")
    set_cell(ws, "B4", f"조회 기준: {month}", size=9, align="right")

    ws.row_dimensions[5].height = 6  # 여백

    # ── 테이블 헤더 ────────────────────────────────────────────────
    col_header_fill = PatternFill(start_color="2E75B6", end_color="2E75B6", fill_type="solid")
    col_header_font = Font(bold=True, size=10, color="FFFFFF", name="맑은 고딕")

    HEADER_ROW = 6
    ws.row_dimensions[HEADER_ROW].height = 22
    headers = [("B", "No.", "center"), ("C", "ITEM (분류)", "center"),
               ("D", "품목명 (Model Name)", "center"), ("E", "수량", "center"),
               ("F", "단가 (₩)", "center"), ("G", "견적금액 (₩)", "center")]
    for col, label, align in headers:
        c = ws[f"{col}{HEADER_ROW}"]
        c.value = label
        c.font = col_header_font
        c.alignment = Alignment(horizontal=align, vertical="center")
        c.fill = col_header_fill
        c.border = thin_border(top=True, bottom=True,
                               left=(col == "B"), right=(col == "G"))

    # ── 데이터 행 ──────────────────────────────────────────────────
    DATA_START = HEADER_ROW + 1
    n = len(estimate)
    row_fills = [
        PatternFill(start_color="EBF3FB", end_color="EBF3FB", fill_type="solid"),
        PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid"),
    ]

    def parse_int(val):
        """문자열 숫자("1,500" 또는 "3" 등)를 정수로 안전하게 변환"""
        try:
            return int(str(val).replace(',', '').strip() or 0)
        except (ValueError, TypeError):
            return 0

    for idx, row in enumerate(estimate):
        r = DATA_START + idx
        ws.row_dimensions[r].height = 18
        fill = row_fills[idx % 2]
        bdr_top = (idx == 0)
        bdr_bot = (idx == n - 1)

        # get_estimate()는 수치를 문자열로 반환하므로 정수로 변환
        qty_val   = parse_int(row.get("total_qty", 0))
        unit_val  = parse_int(row.get("unit_price", 0))
        total_p   = parse_int(row.get("total_price", 0))

        data_cols = [
            ("B", row.get("no", idx+1), False, "center", None),
            ("C", row.get("category", ""), False, "center", None),
            ("D", row.get("item_name", ""), True, "left", None),
            ("E", qty_val,  True,  "center", None),
            ("F", unit_val, False, "right",  '#,##0'),
            ("G", total_p,  True,  "right",  '#,##0'),
        ]
        for col, val, bold, align, nfmt in data_cols:
            c = ws[f"{col}{r}"]
            c.value = val
            c.font = Font(bold=bold, size=10, name="맑은 고딕")
            c.alignment = Alignment(horizontal=align, vertical="center")
            c.fill = fill
            c.border = thin_border(top=bdr_top, bottom=bdr_bot,
                                   left=(col == "B"), right=(col == "G"))
            if nfmt:
                c.number_format = nfmt

    # ── TOTAL 행 ───────────────────────────────────────────────────
    TOTAL_ROW = DATA_START + n
    ws.row_dimensions[TOTAL_ROW].height = 22
    total_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")

    ws.merge_cells(f"B{TOTAL_ROW}:F{TOTAL_ROW}")
    c = ws[f"B{TOTAL_ROW}"]
    c.value = "TOTAL AMOUNT (VAT 별도)"
    c.font = Font(bold=True, size=10, color="FFFFFF", name="맑은 고딕")
    c.alignment = Alignment(horizontal="center", vertical="center")
    c.fill = total_fill
    c.border = thin_border(top=True, bottom=True, left=True)

    # total_price도 문자열이므로 정수 변환 후 합산
    total_val = sum(parse_int(r.get("total_price", 0)) for r in estimate)
    c = ws[f"G{TOTAL_ROW}"]
    c.value = total_val
    c.font = Font(bold=True, size=11, color="FFFFFF", name="맑은 고딕")
    c.alignment = Alignment(horizontal="right", vertical="center")
    c.fill = total_fill
    c.border = thin_border(top=True, bottom=True, right=True)
    c.number_format = '#,##0'

    # ── VAT 포함 합계 안내 ─────────────────────────────────────────
    NOTE_ROW = TOTAL_ROW + 1
    ws.row_dimensions[NOTE_ROW].height = 16
    ws.merge_cells(f"B{NOTE_ROW}:G{NOTE_ROW}")
    set_cell(ws, f"B{NOTE_ROW}",
             f"  ※ 상기 금액은 부가세(VAT 10%) 별도 금액입니다.  |  VAT 포함: {int(total_val * 1.1):,} ₩",
             size=9, align="right")

    # ── 메모리 스트림으로 반환 ─────────────────────────────────────
    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    filename = f"견적서_{month}_{today_str}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"}
    )

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

@router.delete("/items")
def delete_item_endpoint(
    row_index: int = Query(..., description="삭제할 행 번호"),
    item_name: str = Query(..., description="삭제할 품목명 (이중 검증용)")
):
    """품목 마스터 리스트에서 특정 품목 삭제 (row_index + item_name 이중 검증)"""
    success = delete_item(row_index, item_name)
    if not success:
        raise HTTPException(status_code=500, detail="품목 삭제에 실패했습니다. 행 정보를 확인하세요.")
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
def delete_outbound(
    month: str = Query(...),
    row_index: int = Query(...),
    verify_date: str = Query("", description="삭제 전 날짜 검증값"),
    verify_item: str = Query("", description="삭제 전 품목명 검증값"),
    verify_user: str = Query("", description="삭제 전 사용자명 검증값 (중복 행 오탐 방지)"),
):
    """월별 출고 개별 데이터 삭제 (날짜+품목+사용자 3중 검증)"""
    success = delete_outbound_history(month, row_index, verify_date, verify_item, verify_user)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete outbound record")
    return {"status": "success"}

@router.get("/tonner-consignment")
def list_tonner_consignment(month: str = Query(None, description="조회할 월 (없으면 전체)")):
    """위탁 출고된 Tonner 내역 조회"""
    history = get_tonner_consignment_history(month=month)
    return history

@router.get("/toner-inventory")
def list_toner_inventory():
    """토너 전용 재고 시트 전체 조회 (헤더 + 품목 목록)"""
    return get_toner_inventory()

@router.put("/toner-inventory")
def update_toner_inventory_item(data: Dict[str, Any] = Body(...)):
    """토너 재고 시트의 특정 행 수정"""
    row_index = data.get("row_index")
    if not row_index:
        raise HTTPException(status_code=400, detail="row_index is required")
    success = update_toner_item(int(row_index), data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update toner inventory item")
    return {"status": "success"}
