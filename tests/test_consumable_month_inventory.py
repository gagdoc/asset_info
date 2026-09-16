"""Offline regressions for fixed-basis inventory and independent closing reports."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
import pandas as pd
from backend.services import consumables_service as svc
from backend.services import inventory_snapshots


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        self.master, self.outbound, self.items = Mock(), Mock(), Mock()
        self.items.get_values.return_value = [['일반', 'mouse', '10', 'O', '100', '10']]
        self.master.worksheet.return_value = self.items
        self.outbound.worksheets.return_value = [SimpleNamespace(title=m) for m in ('2026년 8월', '2026년 9월', '2026년 10월')]
        quantities = {'2026년 8월':100, '2026년 9월':10, '2026년 10월':5}
        self.outbound.values_batch_get.side_effect = lambda ranges: {'valueRanges': [
            {'values': [['2026-01-01','mouse',str(quantities[r.split('!')[0]]),'user','일반']]} for r in ranges]}
        self.client = patch.object(svc, '_get_consumables_client', side_effect=lambda sid: (Mock(), self.master if sid == svc.CONSUMABLES_MASTER_SPREADSHEET_ID else self.outbound)).start()
        self.basis = patch.object(svc, 'get_inventory_basis_month', return_value='2026년 9월').start()
        patch.object(svc, '_get_toner_inventory_impl', return_value={'items':[]}).start()
        self.rentals = patch('backend.services.database.load_from_db', return_value={'Rental':pd.DataFrame()}).start()
        patch.object(svc, 'invalidate_cache').start()

    def test_fixed_basis_excludes_old_month_and_includes_all_new_months(self):
        item = svc._get_items_list_impl()[0]
        self.assertEqual(item['current_stock'], 95)
        self.assertEqual(item['dispatched_qty'], 15)
        self.outbound.values_batch_get.assert_called_with(['2026년 9월!A2:E','2026년 10월!A2:E'])
        self.assertEqual(svc._get_items_list_impl(month='2026년 8월', dispatch_mode='monthly')[0]['current_stock'],95)

    def test_rentals_subtracted_even_without_target_month(self):
        self.rentals.return_value = {'Rental':pd.DataFrame([{'상태':'대여중','품목명':'mouse','수량':'7'}])}
        self.assertEqual(svc._get_items_list_impl()[0]['current_stock'],88)
        self.outbound.worksheets.return_value = []
        self.assertEqual(svc._get_items_list_impl()[0]['current_stock'],103)

    def test_new_future_month_does_not_change_master(self):
        self.assertTrue(svc.create_month_sheet('2027년 1월','2027-01-01'))
        self.master.assert_not_called()
        self.assertEqual(self.master.mock_calls, [])
        self.assertEqual(self.items.mock_calls, [])
        self.client.assert_called_once_with(svc.CONSUMABLES_OUTBOUND_SPREADSHEET_ID)

    def test_monthly_items_only_reads_snapshot(self):
        frozen = [{'item_name':'removed','current_stock':4}]
        with patch.object(inventory_snapshots,'get_report',return_value={'tracked_items':frozen}) as get_report, patch.object(svc,'_get_items_list_impl',side_effect=AssertionError('live read')):
            self.assertEqual(svc.get_items_list('2026년 9월','monthly'), frozen)
            get_report.assert_called_once_with('2026년 9월')

    def test_close_only_writes_snapshot_and_status(self):
        with patch.object(svc,'_get_month_close_status_impl',return_value={'status':'open'}), patch.object(svc,'_validate_closing_period'), patch.object(inventory_snapshots,'capture_snapshot',return_value={'closed_at':'timestamp'}) as capture, patch.object(svc,'_ensure_snapshot_sheets',return_value=(Mock(), 'status-sheet')), patch.object(svc,'_upsert_close_status') as status:
            self.assertTrue(svc.close_month('2026년 9월')['success'])
            capture.assert_called_once_with('2026년 9월',recapture=True)
            status.assert_called_once_with('status-sheet','2026년 9월','closed','','timestamp')
            self.assertEqual(self.items.mock_calls, [])
            self.assertEqual(self.master.mock_calls, [])
            self.assertEqual(self.outbound.mock_calls, [])

    def test_capture_failure_does_not_mark_closed(self):
        with patch.object(svc,'_get_month_close_status_impl',return_value={'status':'open'}), patch.object(svc,'_validate_closing_period'), patch.object(inventory_snapshots,'capture_snapshot',side_effect=RuntimeError('outage')), patch.object(svc,'_upsert_close_status') as status:
            self.assertFalse(svc.close_month('2026년 9월')['success'])
            status.assert_not_called()

    def test_missing_basis_fails(self):
        self.basis.stop() if hasattr(self.basis, 'stop') else None
        # patch.stopall restores real basis getter while keeping call fully mocked.
        patch.stopall()
        with patch.object(svc,'_get_consumables_client',return_value=(None,None)):
            with self.assertRaises((ValueError, RuntimeError)):
                svc.get_inventory_basis_month()


if __name__ == '__main__':
    unittest.main()
