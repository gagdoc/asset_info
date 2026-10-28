import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.routers import assets

class ServiceNowFeaturesTests(unittest.TestCase):
    def test_feature_route_is_not_captured_as_asset_type(self):
        app = FastAPI()
        app.include_router(assets.router)
        with patch.object(assets, 'ENABLE_SERVICENOW_SYNC', True), patch.object(assets, 'APP_ENV', 'production'), patch.object(assets, 'load_from_db', side_effect=AssertionError('Features must not load asset data')):
            response = TestClient(app).get('/api/assets/features')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'enable_servicenow_sync': True, 'app_env': 'production'})
