"""Offline checks: isolated imports and mocked Google clients only."""
import importlib
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
TEST_ENV = {
    "APP_ENV": "staging",
    "TEST_SPREADSHEET_ID": "test-assets",
    "TEST_CONSUMABLES_MASTER_ID": "test-master",
    "TEST_CONSUMABLES_OUTBOUND_ID": "test-outbound",
    "TEST_TONER_ID": "test-toner",
}
PRODUCTION = (
    "1__8NXfK6ruhlQtnomhIi_sjdkHgLD0C2N1Mw4P3GW7g",
    "1A4RvrDn_I3wev6UaqEGBRoADYRYwtQty0TPo-x6ehtw",
    "1MgYUINr7T1t80MUlv-RRaL7GkK7NSNxuKmAzvqNGe-M",
    "19AMXwNtrF8BcA_BqXpBcy-vWKX8Wu2IkbFTYNPZORc0",
)


class StagingIsolationTests(unittest.TestCase):
    def config_run(self, changes=None, code="import config"):
        env = {k: v for k, v in os.environ.items()
               if not k.startswith(("TEST_", "PROD_", "GOOGLE_CREDENTIALS"))}
        env.update(TEST_ENV)
        env.update(changes or {})
        return subprocess.run([sys.executable, "-c", code], cwd=ROOT,
                              env=env, capture_output=True, text=True)

    def test_valid_configuration_and_credentials_override(self):
        result = self.config_run({"GOOGLE_CREDENTIALS_FILE": "/tmp/test-key.json"},
            "import config; assert config.GOOGLE_CREDENTIALS_FILE == '/tmp/test-key.json'; "
            "assert config.SPREADSHEET_ID == 'test-assets'")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_duplicate_whitespace_ids_rejected(self):
        for value in ("", "test-assets", "   ", " test-toner"):
            with self.subTest(value=value):
                self.assertNotEqual(self.config_run({"TEST_TONER_ID": value}).returncode, 0)

    def test_every_canonical_production_id_blocked_in_every_slot(self):
        for key in TEST_ENV:
            if key == "APP_ENV":
                continue
            for value in PRODUCTION:
                with self.subTest(key=key, value=value):
                    self.assertNotEqual(self.config_run({key: value,
                        "PROD_SPREADSHEET_ID": "override-assets",
                        "PROD_CONSUMABLES_MASTER_ID": "override-master",
                        "PROD_CONSUMABLES_OUTBOUND_ID": "override-outbound",
                        "PROD_TONER_ID": "override-toner"}).returncode, 0)

    def test_overridden_production_id_blocked_cross_slot(self):
        result = self.config_run({"PROD_TONER_ID": "test-assets"})
        self.assertNotEqual(result.returncode, 0)

    def test_unknown_environment_rejected(self):
        self.assertNotEqual(self.config_run({"APP_ENV": "stagng"}).returncode, 0)

    def test_services_use_google_client_and_deny_arbitrary_ids(self):
        code = '''
from unittest.mock import MagicMock, patch
from backend.services import sheets_service as assets, consumables_service as consumables
import config
with patch('backend.services.local_sheets.get_local_client', side_effect=AssertionError('staging used local storage')):
    for service, get_client, sheet_id in (
        (assets, assets._get_client, 'test-assets'),
        (consumables, consumables._get_consumables_client, 'test-master'),
    ):
        client = MagicMock()
        service._cached_client = client
        service._cached_spreadsheets = {}
        with patch.object(assets, 'GSPREAD_AVAILABLE', True):
            actual, sheet = get_client()
        assert actual is client
        client.open_by_key.assert_called_once_with(sheet_id)
    for sheet_id in ['arbitrary-id', *config.CANONICAL_PRODUCTION_SHEET_IDS]:
        consumables._cached_client.reset_mock()
        try:
            consumables._get_consumables_client(sheet_id)
        except ValueError:
            pass
        else:
            raise AssertionError('unapproved spreadsheet accepted')
        consumables._cached_client.open_by_key.assert_not_called()
    assets.SPREADSHEET_ID = 'arbitrary-id'
    assets._cached_client.reset_mock()
    try:
        assets._get_client()
    except ValueError:
        pass
    else:
        raise AssertionError('unapproved asset spreadsheet accepted')
    assets._cached_client.open_by_key.assert_not_called()
'''
        result = self.config_run(code=code)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_staging_database_never_uses_sqlite(self):
        code = """
from unittest.mock import patch
import pandas as pd
from backend.services import database as db
with patch.object(db, 'get_connection', side_effect=AssertionError('SQLite access forbidden')) as sqlite:
    with patch.object(db, 'load_from_sheets', return_value={'All_User': pd.DataFrame({'email': [' x@y.test ']})}):
        assert db.load_from_db()['All_User'].iloc[0]['email'] == 'x@y.test'
    with patch.object(db, 'update_sheet', return_value=True) as write:
        db.update_db('All_User', pd.DataFrame({'email': [' x@y.test ']}))
        write.assert_called_once()
    for method, mocked_name, result in (
        (db.load_from_db, 'load_from_sheets', None),
        (lambda: db.update_db('All_User', pd.DataFrame()), 'update_sheet', False),
    ):
        for error in (False, True):
            kwargs = {'side_effect': RuntimeError('mock outage')} if error else {'return_value': result}
            with patch.object(db, mocked_name, **kwargs):
                try:
                    method()
                except RuntimeError:
                    pass
                else:
                    raise AssertionError('failed Sheets operation reported success')
    with patch.object(db, 'SHEETS_AVAILABLE', False):
        for method in (db.load_from_db, lambda: db.update_db('All_User', pd.DataFrame())):
            try:
                method()
            except RuntimeError:
                pass
            else:
                raise AssertionError('unavailable Sheets service reported success')
    sqlite.assert_not_called()
"""
        result = self.config_run(code=code)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_production_configuration_retains_behavior(self):
        result = self.config_run({"APP_ENV": "production", "PROD_SPREADSHEET_ID": "prod-override"},
                                "import config; assert config.SPREADSHEET_ID == 'prod-override'; config.validate_sheet_access('arbitrary')")
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
