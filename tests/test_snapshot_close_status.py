"""A persisted snapshot must lock its month despite a status-sheet failure."""
import unittest
from unittest.mock import Mock, patch

from backend.services import consumables_service as svc
from backend.services import inventory_snapshots


class SnapshotCloseStatusTests(unittest.TestCase):
    def test_snapshot_commit_locks_month_without_legacy_status_write(self):
        with patch.object(inventory_snapshots, 'get_report', return_value={
            'snapshot_available': True, 'closed_at': 'saved-time'
        }), patch.object(svc, '_get_consumables_client', side_effect=AssertionError('legacy read')):
            self.assertEqual(svc._get_month_close_status_impl('2026년 9월'), {
                'month': '2026년 9월', 'status': 'closed',
                'confirmed_at': None, 'closed_at': 'saved-time'
            })

    def test_snapshot_read_failure_does_not_return_open(self):
        with patch.object(inventory_snapshots, 'get_report', side_effect=RuntimeError('outage')):
            with self.assertRaises(RuntimeError):
                svc._get_month_close_status_impl('2026년 9월')

    def test_legacy_closed_month_stays_closed_without_v2_snapshot(self):
        ws = Mock()
        ws.get_all_values.return_value = [['월', '상태'], ['2026년 8월', 'closed']]
        with patch.object(inventory_snapshots, 'get_report', return_value={'snapshot_available': False}), \
             patch.object(svc, '_get_consumables_client', return_value=(None, Mock())), \
             patch.object(svc, '_get_worksheet_safe', return_value=ws):
            self.assertEqual(svc._get_month_close_status_impl('2026년 8월')['status'], 'closed')

    def test_reopen_is_rejected_without_writes(self):
        with patch.object(svc, '_get_consumables_client') as client:
            self.assertFalse(svc.reopen_month('2026년 9월')['success'])
            client.assert_not_called()

    def test_direct_service_calls_cannot_change_closed_outbounds(self):
        with patch.object(svc, '_get_month_close_status_impl', return_value={'status': 'closed'}), \
             patch.object(svc, '_get_consumables_client') as client:
            self.assertFalse(svc.add_outbound('2026년 9월', {}))
            self.assertFalse(svc.update_outbound_history('2026년 9월', 2, {}))
            self.assertFalse(svc.delete_outbound_history('2026년 9월', 2))
            client.assert_not_called()
