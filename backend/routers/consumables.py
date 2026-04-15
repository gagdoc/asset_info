from fastapi import APIRouter, HTTPException, Query, Body, Path
from fastapi.responses import StreamingResponse
from backend.services.consumables_service import (
    get_available_months, get_items_list, get_outbound_history,
    get_estimate, add_outbound, save_item, update_outbound_history,
    delete_outbound_history, get_item_outbound_history,
    create_month_sheet, invalidate_cache, get_tonner_consignment_history,
    get_toner_inventory, update_toner_item,
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
    """선택한 월의 견적서를 Excel 파일로 다운로드"""
    import logging
    logger_dl = logging.getLogger("estimate_download")

    try:
        import openpyxl
        from openpyxl.styles import Font, Alignment, Border, Side
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl 패키지가 필요합니다.")

    try:
        estimate = get_estimate(month)
    except Exception as e:
        logger_dl.error(f"get_estimate 오류: {e}")
        raise HTTPException(status_code=500, detail=f"견적 데이터 조회 오류: {str(e)}")

    if not estimate:
        raise HTTPException(status_code=404, detail=f"{month} 견적 데이터가 없습니다. (Google Sheets 동기화 후 재시도)")

    # template.xlsx 경로 — 여러 경로 후보를 순서대로 탐색
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    candidate_paths = [
        os.path.join(base_dir, "template.xlsx"),          # /app/template.xlsx
        os.path.join(os.getcwd(), "template.xlsx"),        # cwd/template.xlsx
        "/app/template.xlsx",                              # Cloud Run 절대경로
    ]
    template_path = next((p for p in candidate_paths if os.path.exists(p)), None)
    if not template_path:
        logger_dl.error(f"template.xlsx 없음. 탐색 경로: {candidate_paths}")
        raise HTTPException(status_code=500, detail=f"template.xlsx 파일을 찾을 수 없습니다. (경로: {candidate_paths})")

    try:
        wb = openpyxl.load_workbook(template_path)
        ws = wb.active
    except Exception as e:
        logger_dl.error(f"template.xlsx 로드 오류: {e}")
        raise HTTPException(status_code=500, detail=f"template.xlsx 로드 실패: {str(e)}")

    # ── 견적 번호: No : YYYYMMDD-월 ──────────────────────────────────
    today_str = datetime.now().strftime("%Y%m%d")
    month_num = ''.join(filter(str.isdigit, month))
    ws["G6"] = f"No : {today_str}-{month_num}"

    # ── 데이터 영역: 18행부터 삽입 ──────────────────────────────────
    DATA_START_ROW = 18
    n = len(estimate)

    # 템플릿 기본 데이터 행(18~34)과 TOTAL 행(35) 위치
    TEMPLATE_TOTAL_ROW = 35
    TEMPLATE_DATA_ROWS = 17  # 18~34

    # 실제 데이터 행 수가 17을 초과하면 행 삽입
    if n > TEMPLATE_DATA_ROWS:
        extra = n - TEMPLATE_DATA_ROWS
        ws.insert_rows(TEMPLATE_TOTAL_ROW, amount=extra)

    actual_total_row = DATA_START_ROW + n  # 데이터 직후 TOTAL 행

    # 경계선 스타일 헬퍼
    thin = Side(border_style="thin", color="000000")
    def make_border(top=False, bottom=False, left=False, right=False):
        return Border(
            top=Side(border_style="thin", color="000000") if top else Side(),
            bottom=Side(border_style="thin", color="000000") if bottom else Side(),
            left=Side(border_style="thin", color="000000") if left else Side(),
            right=Side(border_style="thin", color="000000") if right else Side(),
        )

    # 데이터 행 채우기
    for idx, row in enumerate(estimate):
        r = DATA_START_ROW + idx
        is_last = (idx == n - 1)

        cells = {
            "B": (row.get("no", idx + 1),          False, "center"),
            "C": (row.get("category", ""),          False, "left"),
            "D": (row.get("item_name", ""),         True,  "left"),
            "E": (row.get("total_qty", 0),          True,  "center"),
            "F": (row.get("unit_price", 0),         False, "right"),
            "G": (row.get("total_price", 0),        True,  "right"),
        }

        for col, (val, bold, align) in cells.items():
            cell = ws[f"{col}{r}"]
            cell.value = val
            cell.font = Font(bold=bold, size=10)
            cell.alignment = Alignment(horizontal=align, vertical="center")
            cell.border = make_border(
                top=(idx == 0),
                bottom=is_last,
                left=(col == "B"),
                right=(col == "G"),
            )
            # 금액 컬럼 숫자 포맷
            if col in ("F", "G") and isinstance(val, (int, float)):
                cell.number_format = '#,##0'

        ws.row_dimensions[r].height = 18

    # ── TOTAL 행 위치 갱신 ────────────────────────────────────────
    total_row = actual_total_row
    ws[f"B{total_row}"] = "TOTAL AMOUNT (VAT 별도가)"
    ws[f"B{total_row}"].font = Font(bold=True, size=10)
    ws[f"B{total_row}"].alignment = Alignment(horizontal="center", vertical="center")
    ws[f"G{total_row}"] = f"=SUM(G{DATA_START_ROW}:G{total_row - 1})"
    ws[f"G{total_row}"].font = Font(bold=True, size=10)
    ws[f"G{total_row}"].alignment = Alignment(horizontal="right", vertical="center")
    ws[f"G{total_row}"].number_format = '#,##0'

    for col in ["B", "C", "D", "E", "F", "G"]:
        ws[f"{col}{total_row}"].border = make_border(top=True, bottom=True,
                                                      left=(col == "B"), right=(col == "G"))
    # B~F 병합 (기존 병합 먼저 해제 후 재병합 — 중복 병합 오류 방지)
    try:
        ws.unmerge_cells(f"B{total_row}:F{total_row}")
    except Exception:
        pass
    ws.merge_cells(f"B{total_row}:F{total_row}")
    ws.row_dimensions[total_row].height = 18

    # Total 요약(행14) 수식도 업데이트
    ws["C14"] = f"=G{total_row}"

    # ── 이전 TOTAL 행(35) 내용 정리 (병합 셀 직접 접근 금지) ──────
    if n <= TEMPLATE_DATA_ROWS and total_row != TEMPLATE_TOTAL_ROW:
        try:
            ws.unmerge_cells(f"B{TEMPLATE_TOTAL_ROW}:F{TEMPLATE_TOTAL_ROW}")
        except Exception:
            pass
        ws[f"B{TEMPLATE_TOTAL_ROW}"].value = None
        ws[f"G{TEMPLATE_TOTAL_ROW}"].value = None

    # ── 메모리 스트림으로 저장 후 반환 ──────────────────────────
    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    filename = f"견적서_{month}_{today_str}.xlsx"
    encoded_name = filename.encode("utf-8").decode("latin-1", errors="replace")

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
        }
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
