import os
import sys
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
import pandas as pd

# Add parent directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from config import SPREADSHEET_ID, ASSET_TYPES
from backend.services.sheets_service import _get_client
from backend.services.database import get_connection, ASSET_DB_FILE

logger = logging.getLogger(__name__)

HISTORY_SHEET_NAME = "Asset_History"
HISTORY_HEADERS = [
    "일시",
    "자산유형",
    "작업구분",
    "식별자",
    "대상자",
    "이메일",
    "변경내용",
    "변경전",
    "변경후",
    "비고",
]


def ensure_history_sheet(spreadsheet):
    """
    Asset_History 시트가 없으면 생성하고 헤더를 추가합니다.
    """
    try:
        ws = spreadsheet.worksheet(HISTORY_SHEET_NAME)
        # 헤더 확인
        vals = ws.get_all_values()
        if not vals or len(vals) == 0:
            ws.append_row(HISTORY_HEADERS, value_input_option="USER_ENTERED")
        return ws
    except Exception:
        try:
            ws = spreadsheet.add_worksheet(title=HISTORY_SHEET_NAME, rows=500, cols=len(HISTORY_HEADERS))
            ws.append_row(HISTORY_HEADERS, value_input_option="USER_ENTERED")
            logger.info(f"Google Sheets '{HISTORY_SHEET_NAME}' 워크시트 생성 완료")
            return ws
        except Exception as e:
            logger.error(f"'{HISTORY_SHEET_NAME}' 워크시트 생성 실패: {e}")
            return None


def _format_dict_for_log(data: Optional[Dict[str, Any]]) -> str:
    if not data:
        return ""
    if isinstance(data, dict):
        # 불필요한 내부 키 필터링 (_originalIdx, _email_key 등)
        clean = {k: v for k, v in data.items() if not str(k).startswith("_")}
        try:
            return json.dumps(clean, ensure_ascii=False)
        except Exception:
            return str(clean)
    return str(data)


def log_asset_change(
    asset_type: str,
    action: str,
    identifier: str = "",
    user_name: str = "",
    user_email: str = "",
    changes_summary: str = "",
    before_data: Optional[Dict[str, Any]] = None,
    after_data: Optional[Dict[str, Any]] = None,
    memo: str = "",
) -> bool:
    """
    자산 변경 히스토리를 Google Sheets + SQLite에 기록합니다.
    - asset_type: Lease, iPad, Monitor, Teams, Printer, All_User, Resign, NewHire 등
    - action: 정보수정, 반납처리, 신규추가, 행삭제 등
    - identifier: S/N 또는 주요 식별자
    - user_name: 사용자 이름
    - user_email: 사용자 이메일
    - changes_summary: 변경된 내용 요약 (예: 'User: 홍길동 -> STOCK, BU: IT -> IT')
    - before_data: 변경 전 데이터 딕셔너리
    - after_data: 변경 후 데이터 딕셔너리
    - memo: 추가 메모
    """
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    type_label = ASSET_TYPES.get(asset_type, asset_type)

    before_str = _format_dict_for_log(before_data)
    after_str = _format_dict_for_log(after_data)

    row = [
        now_str,
        type_label,
        action,
        str(identifier or "").strip(),
        str(user_name or "").strip(),
        str(user_email or "").strip(),
        str(changes_summary or "").strip(),
        before_str,
        after_str,
        str(memo or "").strip(),
    ]

    # 1. Google Sheets에 추가
    sheets_success = False
    try:
        _, spreadsheet = _get_client()
        if spreadsheet:
            ws = ensure_history_sheet(spreadsheet)
            if ws:
                ws.append_row(row, value_input_option="USER_ENTERED")
                sheets_success = True
                logger.info(f"자산 히스토리 기록 완료 (Sheets): [{type_label}] {action} - {identifier} / {user_name}")
    except Exception as e:
        logger.error(f"자산 히스토리 Sheets 기록 실패: {e}")

    # 2. SQLite 백업 저장
    try:
        conn = get_connection(ASSET_DB_FILE)
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS Asset_History (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                asset_type TEXT,
                action TEXT,
                identifier TEXT,
                user_name TEXT,
                user_email TEXT,
                changes_summary TEXT,
                before_data TEXT,
                after_data TEXT,
                memo TEXT
            )
            """
        )
        cursor.execute(
            """
            INSERT INTO Asset_History (
                timestamp, asset_type, action, identifier, user_name, user_email,
                changes_summary, before_data, after_data, memo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                now_str,
                type_label,
                action,
                str(identifier or "").strip(),
                str(user_name or "").strip(),
                str(user_email or "").strip(),
                str(changes_summary or "").strip(),
                before_str,
                after_str,
                str(memo or "").strip(),
            ),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"자산 히스토리 SQLite 백업 기록 실패: {e}")

    return sheets_success


def get_asset_history(
    asset_type: Optional[str] = None,
    search: Optional[str] = None,
    sn: Optional[str] = None,
    email: Optional[str] = None,
    limit: int = 300,
) -> List[Dict[str, Any]]:
    """
    저장된 자산 히스토리 로그를 최신순으로 가져옵니다.
    """
    records = []

    # 1. Google Sheets에서 읽기 시도
    try:
        _, spreadsheet = _get_client()
        if spreadsheet:
            ws = ensure_history_sheet(spreadsheet)
            if ws:
                raw_values = ws.get_all_values()
                if len(raw_values) > 1:
                    headers = raw_values[0]
                    for r in raw_values[1:]:
                        # 행 패딩
                        padded = r + [""] * (len(headers) - len(r))
                        item = dict(zip(headers, padded[: len(headers)]))
                        records.append(item)
    except Exception as e:
        logger.warning(f"Google Sheets에서 히스토리 읽기 실패 ({e}), SQLite에서 로드 시도")

    # 2. Sheets에서 읽지 못했거나 빈 경우 SQLite에서 로드
    if not records:
        try:
            conn = get_connection(ASSET_DB_FILE)
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT name FROM sqlite_master WHERE type='table' AND name='Asset_History'
                """
            )
            if cursor.fetchone():
                df = pd.read_sql_query(
                    "SELECT timestamp, asset_type, action, identifier, user_name, user_email, changes_summary, before_data, after_data, memo FROM Asset_History ORDER BY id DESC",
                    conn,
                )
                df.rename(
                    columns={
                        "timestamp": "일시",
                        "asset_type": "자산유형",
                        "action": "작업구분",
                        "identifier": "식별자",
                        "user_name": "대상자",
                        "user_email": "이메일",
                        "changes_summary": "변경내용",
                        "before_data": "변경전",
                        "after_data": "변경후",
                        "memo": "비고",
                    },
                    inplace=True,
                )
                records = df.to_dict(orient="records")
            conn.close()
        except Exception as e:
            logger.error(f"SQLite 히스토리 조회 실패: {e}")

    # 3. 최신순 정렬 (역순)
    records.reverse()

    # 4. 필터링
    filtered = []
    norm = lambda s: str(s or "").strip().lower()

    target_type = norm(ASSET_TYPES.get(asset_type, asset_type)) if asset_type else ""
    target_search = norm(search)
    target_sn = norm(sn)
    target_email = norm(email)

    for r in records:
        r_type = norm(r.get("자산유형"))
        r_id = norm(r.get("식별자"))
        r_name = norm(r.get("대상자"))
        r_email = norm(r.get("이메일"))
        r_changes = norm(r.get("변경내용"))
        r_memo = norm(r.get("비고"))

        if target_type and target_type != "all" and (target_type not in r_type and r_type not in target_type):
            continue

        if target_sn and target_sn not in r_id:
            continue

        if target_email and target_email not in r_email:
            continue

        if target_search:
            # 검색어가 식별자, 대상자, 이메일, 변경내용, 비고 중 하나에 포함되는지 확인
            if not any(
                target_search in field
                for field in [r_id, r_name, r_email, r_changes, r_memo, r_type]
            ):
                continue

        filtered.append(r)
        if len(filtered) >= limit:
            break

    return filtered
