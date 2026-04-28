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
    PROD_SHEET_IDS, TEST_SHEET_IDS, TEST_SHEETS_CONFIGURED,
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
    현재 실행 환경 및 연결된 시트 정보를 반환합니다.
    프론트엔드 개발 배너에서 사용합니다.
    """
    return {
        "app_env": APP_ENV,
        "is_production": IS_PRODUCTION,
        "test_sheets_configured": TEST_SHEETS_CONFIGURED,
        "active_sheet_ids": {
            "assets":               SPREADSHEET_ID,
            "consumables_master":   CONSUMABLES_MASTER_SPREADSHEET_ID,
            "consumables_outbound": CONSUMABLES_OUTBOUND_SPREADSHEET_ID,
            "toner":                TONER_SPREADSHEET_ID,
        },
        "prod_sheet_ids": PROD_SHEET_IDS if not IS_PRODUCTION else {},
        "test_sheet_ids": TEST_SHEET_IDS if not IS_PRODUCTION else {},
    }


@router.post("/sync-prod-to-test")
def sync_prod_to_test():
    """
    운영 시트의 모든 데이터를 테스트 시트로 복사합니다.
    개발 환경에서만 사용 가능합니다.
    """
    _require_dev()

    if not TEST_SHEETS_CONFIGURED:
        raise HTTPException(
            status_code=400,
            detail=(
                "테스트 시트 ID가 설정되지 않았습니다. "
                "먼저 scripts/create_test_sheets.py 를 실행하고 "
                ".env.development 에 ID를 설정하세요."
            )
        )

    logs = []

    try:
        # sync 함수를 import (실행 시점 import로 순환 참조 방지)
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        from scripts.sync_prod_to_test import run_sync

        def log_fn(msg):
            logs.append(msg)
            print(msg)  # 서버 로그에도 출력

        result = run_sync(log_fn=log_fn)

        # 캐시 전체 무효화 (동기화 후 최신 데이터 반영)
        try:
            from backend.services.consumables_service import invalidate_cache
            invalidate_cache()
        except Exception:
            pass

        return {
            **result,
            "logs": logs,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"동기화 중 오류: {str(e)}")
