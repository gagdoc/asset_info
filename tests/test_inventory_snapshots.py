import copy
import unittest
from unittest.mock import Mock, patch
from backend.services import inventory_snapshots as snapshots


class Worksheet:
    title = snapshots.SHEET_NAME

    def __init__(self):
        self.rows = [snapshots.HEADERS[:]]
        self.fail_commit = False

    def get_all_values(self):
        return copy.deepcopy(self.rows)

    def append_rows(self, rows, value_input_option):
        assert value_input_option == 'RAW'
        if self.fail_commit and rows[0][2] == 'COMMIT':
            raise RuntimeError('simulated write outage')
        self.rows.extend(copy.deepcopy(rows))


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.ws = Worksheet()
        self.svc = Mock()
        self.svc._get_items_list_impl.return_value = [
            dict(item_name='mouse', category='일반', price='=42', is_tracked=True, current_stock=0),
            dict(item_name='toner', category='토너', price='10', is_tracked=True, current_stock=-2),
            dict(item_name='untracked', category='일반', price='1', is_tracked=False, current_stock=100)]
        self.svc._get_outbound_history_impl.return_value = [dict(item_name='mouse', quantity='3')]
        self.addCleanup(patch.stopall)
        patch.object(snapshots, '_service', return_value=self.svc).start()
        patch.object(snapshots, '_worksheet', return_value=self.ws).start()

    def test_close_is_immutable_after_live_change_and_removal(self):
        first = snapshots.capture_snapshot('2026년 9월')
        self.assertEqual(len(first['tracked_items']), 2)
        self.assertEqual(first['general_items'][0]['closing_stock'], 0)
        self.assertEqual(first['general_items'][0]['outbound_qty'], 3)
        self.assertEqual(first['general_items'][0]['price'], '=42')
        self.assertEqual(first['toner_items'][0]['remaining'], -2)
        self.svc._get_items_list_impl.side_effect = AssertionError('historical report accessed live stock')
        self.svc._get_outbound_history_impl.side_effect = AssertionError('historical report accessed live history')
        self.assertEqual(snapshots.get_report('2026년 9월'), first)
        self.assertEqual(snapshots.capture_snapshot('2026년 9월'), first)
        self.assertEqual(snapshots.get_closed_months(), ['2026년 9월'])

    def test_empty_tracked_close_is_committed(self):
        self.svc._get_items_list_impl.return_value = []
        result = snapshots.capture_snapshot('2026년 9월')
        self.assertTrue(result['snapshot_available'])
        self.assertEqual(result['items'], [])

    def test_missing_historical_month_is_unavailable(self):
        self.assertFalse(snapshots.get_report('2025년 1월')['has_snapshot'])
        self.svc._get_items_list_impl.assert_not_called()

    def test_partial_write_not_visible_and_retry_uses_new_batch(self):
        self.ws.fail_commit = True
        with self.assertRaises(RuntimeError):
            snapshots.capture_snapshot('2026년 9월')
        self.assertFalse(snapshots.get_report('2026년 9월')['has_snapshot'])
        self.ws.fail_commit = False
        result = snapshots.capture_snapshot('2026년 9월')
        self.assertEqual(len(result['items']), 2)

    def test_recapture_appends_new_generation(self):
        old = snapshots.capture_snapshot('2026년 9월')
        saved_rows = copy.deepcopy(self.ws.rows)
        self.svc._get_items_list_impl.return_value = []
        new = snapshots.capture_snapshot('2026년 9월', recapture=True)
        self.assertNotEqual(old['batch_id'], new['batch_id'])
        self.assertEqual(self.ws.rows[:len(saved_rows)], saved_rows)
        self.assertEqual(new['items'], [])

    def test_read_failure_and_validation_failure_do_not_commit(self):
        self.svc._get_items_list_impl.side_effect = RuntimeError('read failed')
        with self.assertRaises(RuntimeError):
            snapshots.capture_snapshot('2026년 9월')
        self.assertEqual(len(self.ws.rows), 1)
        with self.assertRaises(ValueError):
            snapshots.capture_snapshot('2026년 9월', validate=Mock(side_effect=ValueError('future movement')))
        self.assertEqual(len(self.ws.rows), 1)

    def test_committed_row_count_mismatch_fails_closed(self):
        snapshots.capture_snapshot('2026년 9월')
        del self.ws.rows[1]
        with self.assertRaises(RuntimeError):
            snapshots.get_report('2026년 9월')


if __name__ == '__main__':
    unittest.main()
