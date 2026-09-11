"""Offline access-gate tests: no real configuration, Sheets, or app imports."""
import base64
import os
import sys
import types
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.staging_auth import install_staging_auth


PASSWORD = 'offline-test-password-123'


def basic(user='tester', password=PASSWORD):
    return 'Basic ' + base64.b64encode(f'{user}:{password}'.encode()).decode()


def make_app(staging=True, password=PASSWORD):
    app = FastAPI()

    @app.get('/health')
    def health():
        return {'status': 'ok'}

    @app.get('/api/admin/env-status')
    def environment():
        return {'is_staging': staging}

    @app.get('/{page:path}')
    def page(page):
        return {'page': page}

    config = types.ModuleType('config')
    config.IS_STAGING = staging
    env = {'STAGING_ACCESS_USER': 'tester'}
    if password is not None:
        env['STAGING_ACCESS_PASSWORD'] = password
    with patch.dict(sys.modules, {'config': config}), patch.dict(os.environ, env, clear=True):
        install_staging_auth(app)
    return app


class StagingAuthTests(unittest.TestCase):
    def test_missing_malformed_and_wrong_credentials_are_rejected(self):
        invalid = [None, '', 'Basic', 'Basic !!!', 'Bearer token',
                   'Basic ' + base64.b64encode(b'no-colon').decode(),
                   'Basic ' + base64.b64encode(b'\xff:bad').decode(),
                   basic('wrong'), basic(password='wrong')]
        with TestClient(make_app()) as client:
            for auth in invalid:
                for path in ['/dashboard', '/api/admin/env-status']:
                    with self.subTest(auth=auth, path=path):
                        response = client.get(path, headers={} if auth is None else {'Authorization': auth})
                        self.assertEqual(response.status_code, 401)
                        self.assertIn('Basic realm=', response.headers['WWW-Authenticate'])
                        self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_authenticated_environment_and_all_ui_routes_are_allowed(self):
        with TestClient(make_app()) as client:
            for path in ['/api/admin/env-status', '/dashboard', '/register', '/public-consumables', '/static/app.js']:
                with self.subTest(path=path):
                    response = client.get(path, headers={'Authorization': basic()})
                    self.assertEqual(response.status_code, 200)
            self.assertEqual(client.get('/api/admin/env-status', headers={'Authorization': basic()}).json(), {'is_staging': True})

    def test_health_is_public(self):
        with TestClient(make_app()) as client:
            response = client.get('/health')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {'status': 'ok'})

    def test_missing_or_short_password_prevents_installation(self):
        for password in [None, '', 'short', 'a' * 15]:
            with self.subTest(password=password), self.assertRaisesRegex(RuntimeError, 'at least 16'):
                make_app(password=password)

    def test_production_unchanged_without_password(self):
        with TestClient(make_app(staging=False, password=None)) as client:
            for path in ['/health', '/dashboard', '/api/admin/env-status']:
                with self.subTest(path=path):
                    response = client.get(path)
                    self.assertEqual(response.status_code, 200)
                    self.assertNotIn('WWW-Authenticate', response.headers)


if __name__ == '__main__':
    unittest.main()
