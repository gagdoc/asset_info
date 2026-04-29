"""
local_sheets.py
===============
로컬 개발 환경용 gspread 에뮬레이터.
실제 Google Sheets 대신 data/local/{sheet_id}.json 파일을 읽고 씁니다.

파일 구조:
  data/local/{spreadsheet_id}.json
  {
    "시트탭이름": [["헤더1","헤더2",...], ["값1","값2",...], ...],
    ...
  }
"""

import os
import re
import json
import threading

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCAL_DATA_DIR = os.path.join(_PROJECT_ROOT, "data", "local")

_lock = threading.Lock()


# ── 열 문자 ↔ 인덱스 변환 ──────────────────────────────────

def _col_to_idx(col_str: str) -> int:
    """'A' → 0, 'Z' → 25, 'AA' → 26"""
    result = 0
    for c in col_str.upper():
        result = result * 26 + (ord(c) - ord("A") + 1)
    return result - 1


def _parse_range(range_str: str):
    """
    'A1:Z100' → (row_start, col_start, row_end, col_end)  ← 0-based index
    'A1'      → (0, 0, 0, 0)
    """
    m = re.match(r"([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?", range_str.strip().upper())
    if not m:
        return 0, 0, None, None
    c1, r1 = m.group(1), int(m.group(2))
    c2, r2 = m.group(3), m.group(4)
    row_start = r1 - 1
    col_start = _col_to_idx(c1)
    row_end = int(r2) - 1 if r2 else row_start
    col_end = _col_to_idx(c2) if c2 else col_start
    return row_start, col_start, row_end, col_end


# ── LocalWorksheet ─────────────────────────────────────────

class LocalWorksheet:
    def __init__(self, spreadsheet: "LocalSpreadsheet", title: str):
        self._ss = spreadsheet
        self.title = title
        self.id = abs(hash(title)) % (10 ** 8)

    def _data(self):
        return self._ss._data.get(self.title, [])

    def _set(self, rows):
        self._ss._data[self.title] = rows
        self._ss._save()

    # ── 속성 ──────────────────────────────────────────────

    @property
    def row_count(self):
        return max(len(self._data()) + 200, 1000)

    @property
    def col_count(self):
        d = self._data()
        return max((len(r) for r in d), default=26)

    # ── 읽기 ──────────────────────────────────────────────

    def get_all_values(self):
        return [list(r) for r in self._data()]

    def get_all_records(self):
        d = self._data()
        if len(d) < 2:
            return []
        headers = d[0]
        return [dict(zip(headers, r + [""] * (len(headers) - len(r)))) for r in d[1:]]

    def row_values(self, row: int):
        """row 는 1-based"""
        d = self._data()
        return list(d[row - 1]) if row <= len(d) else []

    def col_values(self, col: int):
        """col 는 1-based"""
        return [r[col - 1] if len(r) >= col else "" for r in self._data()]

    # ── 쓰기 ──────────────────────────────────────────────

    def update(self, values_or_range, values=None, value_input_option=None, **kwargs):
        """
        두 가지 호출 방식을 모두 지원합니다.
          ws.update(data)                        # 시트 전체 덮어쓰기
          ws.update("A1:Z100", data)             # 범위 지정 업데이트
        """
        if isinstance(values_or_range, str):
            # 범위 지정 업데이트
            row_s, col_s, _, _ = _parse_range(values_or_range)
            current = self._data()
            for i, row in enumerate(values or []):
                r_idx = row_s + i
                while len(current) <= r_idx:
                    current.append([])
                for j, cell in enumerate(row):
                    c_idx = col_s + j
                    while len(current[r_idx]) <= c_idx:
                        current[r_idx].append("")
                    current[r_idx][c_idx] = cell
            self._set(current)
        else:
            # 전체 덮어쓰기
            self._set([list(r) for r in (values_or_range or [])])

    def append_rows(self, rows, value_input_option=None, **kwargs):
        current = self._data()
        current.extend([list(r) for r in rows])
        self._set(current)

    def append_row(self, row, value_input_option=None, **kwargs):
        self.append_rows([row])

    def delete_rows(self, idx: int):
        """idx 는 1-based"""
        current = self._data()
        if 1 <= idx <= len(current):
            del current[idx - 1]
            self._set(current)

    def clear(self):
        self._set([])

    def resize(self, rows=None, cols=None):
        pass  # 로컬에서는 크기 제한 없음

    def add_rows(self, n):
        pass


# ── LocalSpreadsheet ───────────────────────────────────────

class LocalSpreadsheet:
    def __init__(self, json_path: str, sheet_id: str):
        self._path = json_path
        self.id = sheet_id
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        if os.path.exists(json_path):
            with open(json_path, encoding="utf-8") as f:
                self._data: dict = json.load(f)
        else:
            self._data: dict = {}

    def _save(self):
        with _lock:
            with open(self._path, "w", encoding="utf-8") as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)

    def worksheet(self, title: str) -> LocalWorksheet:
        if title not in self._data:
            self._data[title] = []
            self._save()
        return LocalWorksheet(self, title)

    def worksheets(self):
        return [LocalWorksheet(self, t) for t in self._data]

    def add_worksheet(self, title: str, rows=None, cols=None) -> LocalWorksheet:
        if title not in self._data:
            self._data[title] = []
            self._save()
        return LocalWorksheet(self, title)

    def get_worksheet(self, index: int):
        titles = list(self._data.keys())
        if index < len(titles):
            return LocalWorksheet(self, titles[index])
        return None


# ── LocalClient ────────────────────────────────────────────

class LocalClient:
    def __init__(self, data_dir: str = None):
        self._dir = data_dir or LOCAL_DATA_DIR
        self._cache: dict[str, LocalSpreadsheet] = {}

    def open_by_key(self, sheet_id: str) -> LocalSpreadsheet:
        if sheet_id not in self._cache:
            path = os.path.join(self._dir, f"{sheet_id}.json")
            self._cache[sheet_id] = LocalSpreadsheet(path, sheet_id)
        return self._cache[sheet_id]


_client: LocalClient | None = None


def get_local_client() -> LocalClient:
    global _client
    if _client is None:
        _client = LocalClient()
    return _client


def local_data_exists() -> bool:
    """data/local/ 에 JSON 파일이 하나라도 있으면 True"""
    if not os.path.isdir(LOCAL_DATA_DIR):
        return False
    return any(f.endswith(".json") for f in os.listdir(LOCAL_DATA_DIR))
