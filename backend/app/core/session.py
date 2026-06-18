import base64
import binascii
import hashlib
import hmac
import time

from app.core.config import settings

COOKIE_NAME = "running_planner_session"


def create_session_token(username: str) -> str:
    expires_at = int(time.time()) + settings.session_ttl_seconds
    payload = f"{username}|{expires_at}"
    signature = hmac.new(
        settings.session_secret.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    token = f"{payload}|{signature}"
    return base64.urlsafe_b64encode(token.encode()).decode()


def verify_session_token(token: str | None) -> str | None:
    if not token:
        return None

    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        username, expires_at_raw, signature = decoded.split("|", 2)
        payload = f"{username}|{expires_at_raw}"
        expected = hmac.new(
            settings.session_secret.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        if int(expires_at_raw) < int(time.time()):
            return None
        return username
    except (binascii.Error, ValueError, TypeError):
        return None
