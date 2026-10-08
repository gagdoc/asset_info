"""
Standard unittest test suite for Monthly Inventory Close & Consumables Integrity.
Tests all requirements and defect scenarios:
1. Base formula: Start(10) + Inbound(5) - Outbound(3) = 12 at monthly close.
2. Next month: Outbound(2) makes current stock 10, but previous month closed snapshot remains 12 (immutability).
3. Next month carryover: links previous month's final stock 12 as start stock without double deductions.
4. Duplicate deletion idempotency: deleting an already deleted inbound record does not deduct stock twice.
5. Inbound item change: changing item from A to B transfers stock (cancels A, adds B).
6. Outbound history edit: changing quantity or item adjusts toner stock differential.
7. Month close persistence failure propagation: re-raises exception instead of returning silent success.
8. Blocking closed month mutations: add/update/delete on closed month are rejected with False.
9. Cache invalidation on valid empty results: does not resurrect stale cache data.
"""

import unittest
import os
import sys

# Ensure backend can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.services import consumables_service as cs

class FakeSheet:
    def __init__(self, title, rows=None):
        self.title = title
        self.rows = [list(r) for r in (rows or [])]
        self.writes = []

    def get_all_values(self):
        return [list(r) for r in self.rows]

    def get_values(self, range_expr=None):
        if not self.rows:
            return []
        return [list(r) for r in self.rows[1:]]

    def row_values(self, row_idx):
        if 1 <= row_idx <= len(self.rows):
            return list(self.rows[row_idx - 1])
        return []

    def update(self, range_expr, values):
        self.writes.append(("update", range_expr, values))
        import re
        m = re.match(r"([A-Z])(\d+):?([A-Z])?(\d+)?", range_expr)
        if m and values:
            start_row = int(m.group(2))
            for r_offset, row_val in enumerate(values):
                target_idx = start_row + r_offset - 1
                while len(self.rows) <= target_idx:
                    self.rows.append([])
                start_col = ord(m.group(1)) - ord('A')
                row_list = self.rows[target_idx]
                while len(row_list) < start_col + len(row_val):
                    row_list.append("")
                for c_offset, c_val in enumerate(row_val):
                    row_list[start_col + c_offset] = str(c_val)

    def update_cell(self, row, col, val):
        self.writes.append(("update_cell", row, col, val))
        while len(self.rows) < row:
            self.rows.append([])
        row_list = self.rows[row - 1]
        while len(row_list) < col:
            row_list.append("")
        row_list[col - 1] = str(val)

    def append_row(self, row, **kwargs):
        self.writes.append(("append_row", list(row)))
        self.rows.append([str(x) for x in row])

    def append_rows(self, rows, **kwargs):
        self.writes.append(("append_rows", [list(r) for r in rows]))
        for r in rows:
            self.rows.append([str(x) for x in r])

    def delete_rows(self, row_idx):
        self.writes.append(("delete_rows", row_idx))
        if 1 <= row_idx <= len(self.rows):
            self.rows.pop(row_idx - 1)

    def col_values(self, col_idx):
        return [r[col_idx - 1] for r in self.rows if len(r) >= col_idx and str(r[col_idx - 1]).strip()]


class FakeSpreadsheet:
    def __init__(self):
        self.sheets = {}

    def worksheet(self, title):
        if title not in self.sheets:
            raise Exception(f"Worksheet {title} not found")
        return self.sheets[title]

    def worksheets(self):
        return list(self.sheets.values())

    def add_worksheet(self, title, rows=100, cols=10):
        sheet = FakeSheet(title)
        self.sheets[title] = sheet
        return sheet


class TestMonthlyClose(unittest.TestCase):
    def setUp(self):
        cs.invalidate_cache()
        self.ss_master = FakeSpreadsheet()
        self.ss_outbound = FakeSpreadsheet()
        self.ss_toner = FakeSpreadsheet()

        # Pre-populate sheets
        self.snap_sheet = self.ss_master.add_worksheet("월별스냅샷")
        self.snap_sheet.rows.append(["월", "분류", "품목명", "기초재고", "입고수량", "출고수량", "조정수량", "기말재고", "스냅샷일시", "이월여부"])

        self.close_sheet = self.ss_master.add_worksheet("월별마감")
        self.close_sheet.rows.append(["월", "상태", "확정일시", "마감일시"])

        self.master_items = self.ss_master.add_worksheet("품목리스트")
        self.master_items.rows.append(["분류", "품목", "가격", "관리여부", "구매수량", "추가수량"])
        self.master_items.rows.append(["사무용품", "A4용지", "1000", "O", "10", "0"])

        self.indiv_inbound = self.ss_master.add_worksheet(cs.INDIVIDUAL_INBOUND_SHEET)
        self.indiv_inbound.rows.append(["date", "item", "qty", "note", "source"])

        self.toner_ws = self.ss_toner.add_worksheet("토너재고")
        self.toner_ws.rows.append(["토너_품번", "실재고"])
        self.toner_ws.rows.append(["토너_검정", "10"])

        # Patch client getters
        def mock_get_client(ss_id=None):
            if ss_id == cs.CONSUMABLES_OUTBOUND_SPREADSHEET_ID:
                return None, self.ss_outbound
            return None, self.ss_master

        self.orig_get_client = cs._get_consumables_client
        self.orig_get_toner = cs._get_toner_worksheet
        self.orig_sync_inv = cs.sync_inventory_summary_sheet
        self.orig_ensure = cs._ensure_snapshot_sheets

        cs._get_consumables_client = mock_get_client
        cs._get_toner_worksheet = lambda: self.toner_ws
        cs.sync_inventory_summary_sheet = lambda: None

    def tearDown(self):
        cs._get_consumables_client = self.orig_get_client
        cs._get_toner_worksheet = self.orig_get_toner
        cs.sync_inventory_summary_sheet = self.orig_sync_inv
        cs._ensure_snapshot_sheets = self.orig_ensure
        cs.invalidate_cache()

    def test_monthly_close_formula_and_immutability(self):
        """
        핵심 검증 기준:
        기초 10 + 입고 5 - 출고 3 = 12 마감 스냅샷 고정 저장.
        다음 달 2개 출고 발생 시 현재 실재고는 10이 되지만, 지난달 마감 재고는 계속 12로 불변 유지.
        다음 달은 지난달 기말재고 12를 기초로 연결하여 중복 차감 없음.
        """
        month_9 = "2026년 9월"
        month_10 = "2026년 10월"

        ws_sep = self.ss_outbound.add_worksheet(month_9)
        ws_sep.rows.append(["날짜", "품목 명", "수량 (개)", "사용자 이름", "출고유형"])

        ws_oct = self.ss_outbound.add_worksheet(month_10)
        ws_oct.rows.append(["날짜", "품목 명", "수량 (개)", "사용자 이름", "출고유형"])

        # 1. 9월 재고 확정 (Confirm): 토너_검정 시작재고 = 10
        res_confirm = cs.confirm_month_snapshot(month_9)
        self.assertTrue(res_confirm["success"])

        # 2. 입고 5건 발생 -> 실재고 10 + 5 = 15
        res_in = cs.add_individual_inbound({
            "date": "2026-09-05",
            "item_name": "토너_검정",
            "quantity": "5",
            "note": "9월 입고",
            "source": "업체"
        })
        self.assertTrue(res_in)
        self.assertEqual(self.toner_ws.rows[1][1], "15")

        # 3. 출고 3건 발생 -> 실재고 15 - 3 = 12
        res_out = cs.add_outbound(month_9, {
            "date": "2026-09-10",
            "item_name": "토너_검정",
            "quantity": "3",
            "user_name": "홍길동"
        })
        self.assertTrue(res_out)
        self.assertEqual(self.toner_ws.rows[1][1], "12")

        # 4. 9월 마감 (Close): 기초 10 + 입고 5 - 출고 3 = 12 기말 스냅샷 고정
        res_close = cs.close_month(month_9)
        self.assertTrue(res_close["success"])

        rep_sep = cs.get_monthly_toner_report(month_9)
        self.assertEqual(rep_sep["status"], "closed")
        t_item_sep = next(it for it in rep_sep["toner_items"] if it["item_name"] == "토너_검정")
        self.assertEqual(t_item_sep["start_stock"], 10)
        self.assertEqual(t_item_sep["inbound_qty"], 5)
        self.assertEqual(t_item_sep["outbound_qty"], 3)
        self.assertEqual(t_item_sep["remaining"], 12)

        # 5. 다음 달 (10월) 2개 출고
        res_out_oct = cs.add_outbound(month_10, {
            "date": "2026-10-02",
            "item_name": "토너_검정",
            "quantity": "2",
            "user_name": "김철수"
        })
        self.assertTrue(res_out_oct)
        # 현재 실재고는 10
        self.assertEqual(self.toner_ws.rows[1][1], "10")

        # 6. 지난달(9월) 마감 재고는 계속 12 유지 (불변성)
        rep_sep_again = cs.get_monthly_toner_report(month_9)
        t_item_sep_again = next(it for it in rep_sep_again["toner_items"] if it["item_name"] == "토너_검정")
        self.assertEqual(t_item_sep_again["remaining"], 12)

        # 7. 10월 재고 확정 시: 9월 기말 12가 10월 기초재고로 1:1 연결
        res_confirm_oct = cs.confirm_month_snapshot(month_10)
        self.assertTrue(res_confirm_oct["success"])
        self.assertTrue(res_confirm_oct["is_carryover"])

        rep_oct = cs.get_monthly_toner_report(month_10)
        t_item_oct = next(it for it in rep_oct["toner_items"] if it["item_name"] == "토너_검정")
        self.assertEqual(t_item_oct["start_stock"], 12)
        self.assertEqual(t_item_oct["outbound_qty"], 2)
        self.assertEqual(t_item_oct["remaining"], 10)

    def test_closed_month_mutation_protection(self):
        """마감된 월의 거래 추가/수정/삭제 차단"""
        month = "2026년 8월"
        ws = self.ss_outbound.add_worksheet(month)
        ws.rows.append(["날짜", "품목 명", "수량 (개)", "사용자 이름", "출고유형"])
        ws.rows.append(["2026-08-01", "토너_검정", "1", "홍길동", "일반"])

        cs.confirm_month_snapshot(month)
        cs.close_month(month)

        # 신규 출고 등록 차단
        self.assertFalse(cs.add_outbound(month, {"item_name": "토너_검정", "quantity": 1}))
        # 기존 출고 수정 차단
        self.assertFalse(cs.update_outbound_history(month, 2, {"quantity": 5}))
        # 기존 출고 삭제 차단
        self.assertFalse(cs.delete_outbound_history(month, 2))

    def test_duplicate_individual_inbound_deletion_idempotent(self):
        """개별 입고 중복 삭제 시 재고가 두 번 차감되지 않는 멱등성"""
        cs.add_individual_inbound({"date": "2026-09-01", "item_name": "토너_검정", "quantity": "4"})
        self.assertEqual(self.toner_ws.rows[1][1], "14")

        # 1차 삭제: 실재고 14 -> 10
        res1 = cs.delete_individual_inbound(2, "토너_검정", 4)
        self.assertTrue(res1["success"])
        self.assertEqual(self.toner_ws.rows[1][1], "10")

        # 2차 중복 삭제 시도: 이미 삭제됨이므로 차감 방지
        res2 = cs.delete_individual_inbound(2, "토너_검정", 4)
        self.assertTrue(res2["success"])
        self.assertTrue(res2.get("already_deleted"))
        self.assertEqual(self.toner_ws.rows[1][1], "10")

    def test_inbound_item_change_transfers_stock(self):
        """입고 품목 변경 시 이전 품목 취소 및 새 품목 추가"""
        self.toner_ws.rows.append(["토너_노랑", "5"])

        cs.add_individual_inbound({"date": "2026-09-01", "item_name": "토너_검정", "quantity": "3"})
        self.assertEqual(self.toner_ws.rows[1][1], "13")
        self.assertEqual(self.toner_ws.rows[2][1], "5")

        # 품목을 토너_검정 -> 토너_노랑 (수량 3 동일)으로 변경
        res = cs.update_individual_inbound(2, {"item_name": "토너_노랑", "quantity": "3"})
        self.assertTrue(res["success"])

        # 토너_검정 13 -> 10, 토너_노랑 5 -> 8
        self.assertEqual(self.toner_ws.rows[1][1], "10")
        self.assertEqual(self.toner_ws.rows[2][1], "8")

    def test_outbound_edit_adjusts_toner_stock(self):
        """출고 수정 시 차액만큼 토너 실재고 자동 조정"""
        month = "2026년 7월"
        ws = self.ss_outbound.add_worksheet(month)
        ws.rows.append(["날짜", "품목 명", "수량 (개)", "사용자 이름", "출고유형"])

        cs.add_outbound(month, {"date": "2026-07-01", "item_name": "토너_검정", "quantity": "3"})
        self.assertEqual(self.toner_ws.rows[1][1], "7")

        # 3 -> 5 수정: 추가 2개 차감 -> 실재고 5
        res = cs.update_outbound_history(month, 2, {"date": "2026-07-01", "item_name": "토너_검정", "quantity": "5"})
        self.assertTrue(res)
        self.assertEqual(self.toner_ws.rows[1][1], "5")

        # 5 -> 2 수정: 3개 복원 -> 실재고 8
        res2 = cs.update_outbound_history(month, 2, {"date": "2026-07-01", "item_name": "토너_검정", "quantity": "2"})
        self.assertTrue(res2)
        self.assertEqual(self.toner_ws.rows[1][1], "8")

    def test_close_month_failure_propagation(self):
        """마감 시트 저장 실패 시 에러 반환"""
        month = "2026년 6월"
        # 1. 정상 상태에서 확정 먼저 수행
        cs.confirm_month_snapshot(month)

        # 2. 마감 시점에 append_row/update 실패 주입
        def broken_upsert(*args, **kwargs):
            raise RuntimeError("Simulated sheet access failure")

        orig_upsert = cs._upsert_close_status
        cs._upsert_close_status = broken_upsert
        try:
            res = cs.close_month(month)
            self.assertFalse(res["success"])
            self.assertIn("마감 처리 실패", res["error"])
        finally:
            cs._upsert_close_status = orig_upsert

    def test_cache_invalidation_does_not_resurrect_stale(self):
        """캐시 무효화 후 정상 빈 결과가 오래된 stale 캐시로 부활하지 않는지 검증"""
        # 1. 초기 캐시 채우기
        cs._get_cached("test_cache_key", lambda: ["item1", "item2"])
        # 2. 캐시 무효화
        cs.invalidate_cache()
        # 3. 정상적으로 빈 결과 반환 시 stale 데이터가 아니라 빈 리스트 반환
        result = cs._get_cached("test_cache_key", lambda: [])
        self.assertEqual(result, [])

    def test_delete_outbound_batch(self):
        """다중 선택 일괄 삭제 시 아래쪽 행부터 안전 삭제 및 토너 실재고 복원 검증"""
        month = "2026년 7월"
        # 토너 재고 시트에 토너_검정 10개 설정
        self.toner_ws.rows = [
            ["토너_품번", "실재고"],
            ["토너_검정", "10"],
        ]
        # 7월 출고 시트에 3건 등록
        out_ws = self.ss_outbound.add_worksheet(month)
        out_ws.rows = [
            ["날짜", "품목", "수량", "사용자", "유형", "담당", "수령"],
            ["2026-07-01", "토너_검정", "2", "홍길동", "일반", "관리자", "직접"],
            ["2026-07-02", "토너_검정", "3", "이순신", "일반", "관리자", "직접"],
            ["2026-07-03", "토너_검정", "1", "강감찬", "일반", "관리자", "직접"],
        ]

        # 2행(2개), 4행(1개) 선택 삭제 요청 (총 3개 삭제 -> 재고 10 -> 13)
        items_to_del = [
            {"row_index": 2, "verify_date": "2026-07-01", "verify_item": "토너_검정", "verify_user": "홍길동"},
            {"row_index": 4, "verify_date": "2026-07-03", "verify_item": "토너_검정", "verify_user": "강감찬"},
        ]

        res = cs.delete_outbound_batch(month, items_to_del)
        self.assertTrue(res["success"])
        self.assertEqual(res["deleted_count"], 2)

        # 남아있는 출고 내역 확인: 1건(이순신 3개)만 남아있어야 함
        self.assertEqual(len(out_ws.rows), 2)  # 헤더 + 이순신 행
        self.assertEqual(out_ws.rows[1][3], "이순신")

        # 토너 재고: 10 + 2 + 1 = 13개로 복원
        self.assertEqual(self.toner_ws.rows[1][1], "13")



if __name__ == "__main__":
    unittest.main()

