import copy
import unittest
from unittest.mock import Mock, patch
from backend.services import inventory_snapshots as snapshots


class NamedInventoryTests(unittest.TestCase):
    def setUp(self):
        self.rows = [snapshots.USER_HEADERS[:]]
        self.ws = Mock()
        self.ws.get_all_values.side_effect = lambda: copy.deepcopy(self.rows)
        self.ws.append_rows.side_effect = lambda rows, **kw: self.rows.extend(copy.deepcopy(rows))
        self.svc = Mock()
        self.svc._get_items_list_impl.return_value = [
            dict(item_name='M240', category='Mouse', price='25000', current_stock=14, is_tracked=True),
            dict(item_name='zero', current_stock=0, is_tracked=True),
            dict(item_name='negative', current_stock=-2, is_tracked=True),
            dict(item_name='excluded', current_stock=9, is_tracked=False)]
        self.addCleanup(patch.stopall)
        patch.object(snapshots, '_named_worksheet', return_value=self.ws).start()
        patch.object(snapshots, '_service', return_value=self.svc).start()

    def test_save_read_is_frozen_and_duplicate_labels_do_not_overwrite(self):
        first = snapshots.save_named_current_inventory('9월 실사')
        self.assertEqual([x['current_stock'] for x in first['items']], [14, 0, -2])
        self.svc._get_items_list_impl.return_value[0]['current_stock'] = 11
        second = snapshots.save_named_current_inventory('9월 실사')
        self.assertNotEqual(first['save_id'], second['save_id'])
        self.svc._get_items_list_impl.side_effect = AssertionError('live data read')
        self.assertEqual(snapshots.get_named_inventory_save(first['save_id']), first)
        self.assertEqual(len(snapshots.list_named_inventory_saves()), 2)

    def test_incomplete_save_not_listed(self):
        def append(rows, **kw):
            if rows[0][7] == 'COMMIT': raise RuntimeError('write failure')
            self.rows.extend(copy.deepcopy(rows))
        self.ws.append_rows.side_effect = append
        with self.assertRaises(RuntimeError): snapshots.save_named_current_inventory('partial')
        self.assertEqual(snapshots.list_named_inventory_saves(), [])

    def test_invalid_names_rejected_before_writes(self):
        for name in (None, [], '', '  ', 'x' * 81):
            with self.assertRaises(ValueError): snapshots.save_named_current_inventory(name)
        self.ws.append_rows.assert_not_called()

    def test_missing_save_is_not_found(self):
        with self.assertRaises(KeyError): snapshots.get_named_inventory_save('missing')
