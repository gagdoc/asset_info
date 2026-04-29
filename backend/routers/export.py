"""
export.py — 공용 Excel 내보내기 API
====================================
POST /api/export/xlsx
    프론트엔드가 직접 가진 데이터를 스타일드 .xlsx 파일로 변환합니다.
    대시보드 내보내기와 동일한 스타일(인디고 헤더, 테두리, 자동 열 너비)을 적용합니다.

Request body (JSON):
    {
        "filename": "소모품리스트_20240429",   ← 저장 파일명 (.xlsx 자동 추가)
        "sheets": [
            {
                "title":   "소모품 목록",
                "columns": [
                    {"key": "item_name", "label": "품목명"},
                    {"key": "current_stock", "label": "현재재고"},
                    ...
                ],
                "rows": [
                    {"item_name": "A4 용지", "current_stock": 10},
                    ...
                ]
            }
        ]
    }
"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any
import urllib.parse

from backend.services.xlsx_utils import build_xlsx

router = APIRouter(prefix="/api/export", tags=["export"])


class ColumnDef(BaseModel):
    key: str
    label: str


class SheetDef(BaseModel):
    title: str = "Sheet"
    columns: list[ColumnDef] = []
    rows: list[dict[str, Any]] = []


class ExportRequest(BaseModel):
    filename: str = "export"
    sheets: list[SheetDef] = []


@router.post("/xlsx")
def export_xlsx(body: ExportRequest):
    """
    프론트엔드가 보낸 데이터를 스타일드 xlsx로 변환해 반환합니다.
    대용량 데이터도 메모리에서 스트림으로 처리합니다.
    """
    sheets_data = [
        {
            "title":   s.title,
            "columns": [{"key": c.key, "label": c.label} for c in s.columns],
            "rows":    s.rows,
        }
        for s in body.sheets
    ]

    output = build_xlsx(sheets_data, title=body.filename)

    fname = body.filename if body.filename.endswith(".xlsx") else f"{body.filename}.xlsx"
    # RFC 5987 인코딩 (한국어 파일명 지원)
    encoded = urllib.parse.quote(fname, safe="")

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded}",
        },
    )
