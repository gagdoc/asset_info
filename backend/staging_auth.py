"""Shared test access gate; no additional Google account is needed."""
import base64
import binascii
import os
import secrets

from starlette.responses import Response


def install_staging_auth(app):
    from config import IS_STAGING
    if not IS_STAGING:
        return
    username = os.environ.get("STAGING_ACCESS_USER", "tester")
    password = os.environ.get("STAGING_ACCESS_PASSWORD", "")
    if len(password) < 16:
        raise RuntimeError("Staging requires an access password of at least 16 characters")

    @app.middleware("http")
    async def staging_access(request, call_next):
        if request.url.path == "/health":
            return await call_next(request)
        supplied_user = supplied_password = ""
        try:
            scheme, encoded = request.headers.get("authorization", "").split(" ", 1)
            if scheme.lower() == "basic":
                supplied_user, supplied_password = base64.b64decode(
                    encoded, validate=True
                ).decode("utf-8").split(":", 1)
        except (ValueError, UnicodeError, binascii.Error):
            pass
        user_ok = secrets.compare_digest(supplied_user.encode(), username.encode())
        password_ok = secrets.compare_digest(supplied_password.encode(), password.encode())
        if not (user_ok and password_ok):
            return Response(status_code=401, headers={
                "WWW-Authenticate": 'Basic realm="Asset Info Test", charset="UTF-8"',
                "Cache-Control": "no-store",
            })
        return await call_next(request)
