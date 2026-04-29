"""
admin.py — 관리자/개발용 API 엔드포인트
개발(development) 환경에서만 동작합니다.
운영(production) 환경에서는 모든 엔드포인트가 403을 반환합니다.
"""

from fastapi import APIRouter, HTTPException
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from config import (
    IS_PRODUCTION, APP_ENV,
    SPREADSHEET_ID, CONSUMABLES_MASTER_SPREADSHEET_ID,
    CONSUMABLES_OUTBOUND_SPREADSHEET_ID, TONER_SPREADSHEET_ID,
)

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
)


def _require_dev():
    """운영 환경이면 403 반환"""
    if IS_PRODUCTION:
        raise HTTPException(
            status_code=403,
            detail="이 기능은 개발 환경에서만 사용할 수 있습니다."
        )


@router.get("/env-status")
def get_env_status():
    """
    현재 실행 환경 및 로컬 데이터 상태를 반환합니다.
    프론트엔드 개발 배너에서 사용합니다.
    """
    local_data_ok = False
    if not IS_PRODUCTION:
        try:
            from backend.services.local_sheets import local_data_exists
            local_data_ok = local_data_exists()
        except Exception:
            pass

    return {
        "app_env": APP_ENV,
        "is_production": IS_PRODUCTION,
        "local_data_exists": local_data_ok,
        "active_sheet_ids": {
            "assets":               SPREADSHEET_ID,
            "consumables_master":   CONSUMABLES_MASTER_SPREADSHEET_ID,
            "consumables_outbound": CONSUMABLES_OUTBOUND_SPREADSHEET_ID,
            "toner":                TONER_SPREADSHEET_ID,
        },
    }


@router.post("/sync-prod-to-local")
def sync_prod_to_local():
    """
    운영 Google Sheets 데이터를 data/local/*.json 으로 다운로드합니다.
    로컬 서버는 이 파일을 읽고 씁니다 (Google API 불필요).
    개발 환경에서만 사용 가능합니다.
    """
    _require_dev()

    logs = []

    try:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        from scripts.download_to_local import run_download

        def log_fn(msg):
            logs.append(msg)
            print(msg)

        result = run_download(log_fn=log_fn)

        # 캐시 전체 무효화 + 로컬 클라이언트 리셋
        try:
            from backend.services.consumables_service import invalidate_cache
            invalidate_cache()
            from backend.services import local_sheets as _ls
            _ls._client = None
        except Exception:
            pass

        return {
            **result,
            "logs": logs,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"다운로드 중 오류: {str(e)}")
