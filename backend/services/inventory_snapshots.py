"""Immutable closing inventory, committed only after every snapshot row is stored."""
from datetime import datetime, timezone
import threading
import uuid

SHEET_NAME = "재고마감스냅샷V2"
HEADERS = ["month", "batch_id", "kind", "closed_at", "item_name", "category", "price", "is_tracked", "closing_stock", "outbound_qty", "item_count"]
_LOCK = threading.RLock()
USER_SHEET = "재고사용자저장V1"
USER_HEADERS = ["save_id", "label", "saved_at", "item_name", "category", "price", "stock", "kind", "item_count"]


def _service():
    from backend.services import consumables_service
    return consumables_service


def _worksheet(create=False):
    svc = _service()
    _, ss = svc._get_consumables_client(svc.CONSUMABLES_MASTER_SPREADSHEET_ID)
    if ss is None:
        raise RuntimeError("Snapshot spreadsheet is unavailable")
    # Listing distinguishes absence from API/permission failures.
    for ws in ss.worksheets():
        if ws.title == SHEET_NAME:
            return ws
    if not create:
        return None
    ws = ss.add_worksheet(title=SHEET_NAME, rows=2000, cols=len(HEADERS))
    ws.update("A1:K1", [HEADERS], value_input_option="RAW")
    return ws


def _integer(value):
    text = str(value).replace(",", "").strip()
    return int(text)


def _committed(ws):
    if ws is None:
        return {}
    rows = ws.get_all_values()
    if not rows or rows[0] != HEADERS:
        raise RuntimeError("Snapshot header is invalid")
    pending, result = {}, {}
    for row in rows[1:]:
        if not row:
            continue
        row = row + [""] * (len(HEADERS) - len(row))
        month, batch, kind = row[:3]
        key = (month, batch)
        if kind == "ITEM":
            pending.setdefault(key, []).append(row)
        elif kind == "COMMIT":
            items = pending.get(key, [])
            if len(items) != _integer(row[10]):
                raise RuntimeError("Committed snapshot row count is inconsistent")
            if len({item[4] for item in items}) != len(items):
                raise RuntimeError("Committed snapshot contains duplicate items")
            result[month] = (row[3], batch, list(items))
    return result


def _report(month, committed):
    available = month in committed
    result = {"month": month, "snapshot_kind": "closing", "snapshot_available": available,
              "has_snapshot": available, "closed_at": None, "tracked_items": [], "items": [],
              "general_items": [], "toner_items": []}
    if not available:
        return result
    closed_at, batch, rows = committed[month]
    result.update(closed_at=closed_at, batch_id=batch)
    for row in rows:
        stock = _integer(row[8])
        item = {"item_name": row[4], "category": row[5], "price": row[6],
                "is_tracked": row[7] == "true", "closing_stock": stock,
                "current_stock": stock, "remaining": stock, "outbound_qty": _integer(row[9])}
        result["tracked_items"].append(item)
        category = row[5].lower()
        group = "toner_items" if any(k in category for k in ("toner", "tonner", "토너")) else "general_items"
        result[group].append(item)
    result["items"] = result["tracked_items"]
    return result


def get_report(month):
    """Never consult live inventory when rendering a saved month."""
    return _report(month, _committed(_worksheet()))


def get_closed_months():
    return sorted(_committed(_worksheet()), reverse=True)

def save_named_current_inventory(label):
    """Save the current tracked inventory under a user-provided label."""
    if not isinstance(label, str):
        raise ValueError("저장 이름을 입력하세요.")
    label = label.strip()
    if not label or len(label) > 80:
        raise ValueError("저장 이름은 1~80자로 입력하세요.")
    svc = _service()
    items = svc._get_items_list_impl()
    tracked = [x for x in items if x.get('is_tracked') is True]
    if not tracked:
        raise ValueError("저장할 재고 추적 품목이 없습니다.")
    save_id = uuid.uuid4().hex
    saved_at = datetime.now(timezone.utc).isoformat()
    rows = []
    for item in tracked:
        name = str(item.get('item_name', '')).strip()
        if not name: raise ValueError("품목명이 없는 추적 품목은 저장할 수 없습니다.")
        stock = _integer(item.get('current_stock'))
        rows.append([save_id, label, saved_at, name, item.get('category',''), item.get('price',''), stock, 'ITEM', ''])
    with _LOCK:
        ws = _named_worksheet(create=True)
        ws.append_rows(rows, value_input_option="RAW")
        ws.append_rows([[save_id, label, saved_at, '', '', '', '', 'COMMIT', len(rows)]], value_input_option="RAW")
        return get_named_inventory_save(save_id)

def _named_worksheet(create=False):
    svc = _service()
    _, ss = svc._get_consumables_client(svc.CONSUMABLES_MASTER_SPREADSHEET_ID)
    if ss is None: raise RuntimeError("Snapshot spreadsheet is unavailable")
    ws = next((w for w in ss.worksheets() if w.title == USER_SHEET), None)
    if ws is None and create:
        ws = ss.add_worksheet(title=USER_SHEET, rows=2000, cols=len(USER_HEADERS))
        ws.update("A1:I1", [USER_HEADERS], value_input_option="RAW")
    return ws

def _named_saves():
    ws = _named_worksheet()
    if ws is None: return {}
    rows = ws.get_all_values()
    if not rows or rows[0] != USER_HEADERS:
        raise RuntimeError("저장 재고 시트의 헤더가 올바르지 않습니다.")
    pending, result = {}, {}
    for row in rows[1:]:
        if not row: continue
        row = row + [''] * (len(USER_HEADERS) - len(row))
        save_id, label, saved_at = row[:3]
        if row[7] == 'ITEM':
            pending.setdefault(save_id, []).append({'item_name': row[3], 'category': row[4], 'price': row[5], 'current_stock': _integer(row[6])})
        elif row[7] == 'COMMIT':
            items = pending.get(save_id, [])
            if len(items) != _integer(row[8]):
                raise RuntimeError("저장 재고의 품목 수가 일치하지 않습니다.")
            result[save_id] = {'save_id': save_id, 'label': label, 'saved_at': saved_at, 'item_count': len(items), 'items': items}
    return result

def get_named_inventory_save(save_id):
    result = _named_saves().get(save_id)
    if result is None: raise KeyError(save_id)
    return result

def list_named_inventory_saves():
    summaries = [{k: v for k, v in record.items() if k != 'items'} for record in _named_saves().values()]
    return sorted(summaries, key=lambda x:x['saved_at'], reverse=True)


def capture_snapshot(month, recapture=False, validate=None):
    """Return the existing committed close, or append a new immutable generation.

    validate is an optional no-argument callback; it must raise on unsafe capture.
    Callers must enforce their close/write concurrency policy across instances.
    """
    if not isinstance(month, str) or not month.strip():
        raise ValueError("A month is required")
    with _LOCK:
        ws = _worksheet(create=True)
        committed = _committed(ws)
        if month in committed and not recapture:
            return _report(month, committed)
        if validate is not None:
            validate()
        svc = _service()
        items = svc._get_items_list_impl()
        if items is None:
            raise RuntimeError("Current inventory could not be loaded")
        history = svc._get_outbound_history_impl(month)
        if history is None:
            raise RuntimeError("Month outbound history could not be loaded")
        totals = {}
        for entry in history:
            name = str(entry.get("item_name", "")).strip()
            if not name or name.startswith("=="):
                continue
            totals[name] = totals.get(name, 0) + _integer(entry.get("quantity", 0))
        timestamp = datetime.now(timezone.utc).isoformat()
        batch = uuid.uuid4().hex
        rows, names = [], set()
        for item in items:
            if item.get("is_tracked") is not True:
                continue
            name = str(item.get("item_name", "")).strip()
            if not name or name in names:
                raise ValueError("Tracked inventory requires unique non-empty item names")
            names.add(name)
            rows.append([month, batch, "ITEM", timestamp, name, str(item.get("category", "")),
                         str(item.get("price", "")), "true", str(_integer(item["current_stock"])),
                         str(totals.get(name, 0)), ""])
        if rows:
            ws.append_rows(rows, value_input_option="RAW")
        ws.append_rows([[month, batch, "COMMIT", timestamp, "", "", "", "", "", "", str(len(rows))]],
                       value_input_option="RAW")
        # Do not report successful close without reading the persisted commit.
        saved = _committed(ws)
        if saved.get(month, (None, None))[1] != batch:
            raise RuntimeError("Snapshot commit could not be verified")
        return _report(month, saved)
