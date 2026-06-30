import base64
import binascii
import hashlib
import hmac
import time
from dataclasses import dataclass

from app.core.config import settings

COOKIE_NAME = "running_planner_session"
OAUTH_STATE_TTL_SECONDS = 10 * 60


@dataclass(frozen=True)
class SessionIdentity:
    user_id: str
    athlete_account_id: str
    expires_at: int


def encode_signed_payload(payload: str) -> str:
    signature = hmac.new(
        settings.session_secret.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    token = f"{payload}|{signature}"
    return base64.urlsafe_b64encode(token.encode()).decode()


def decode_signed_payload(token: str | None) -> str | None:
    if not token:
        return None

    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        payload, signature = decoded.rsplit("|", 1)
        expected = hmac.new(
            settings.session_secret.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        return payload
    except (binascii.Error, ValueError, TypeError):
        return None


def create_session_token(user_id: str, athlete_account_id: str) -> str:
    expires_at = int(time.time()) + settings.session_ttl_seconds
    return encode_signed_payload(f"session|{user_id}|{athlete_account_id}|{expires_at}")


def verify_session_token(token: str | None) -> SessionIdentity | None:
    payload = decode_signed_payload(token)
    if not payload:
        return None

    try:
        kind, user_id, athlete_account_id, expires_at_raw = payload.split("|", 3)
        if kind != "session":
            return None
        expires_at = int(expires_at_raw)
        if expires_at < int(time.time()):
            return None
        return SessionIdentity(
            user_id=user_id,
            athlete_account_id=athlete_account_id,
            expires_at=expires_at,
        )
    except ValueError:
        return None


def create_oauth_state(user_id: str, athlete_account_id: str) -> str:
    expires_at = int(time.time()) + OAUTH_STATE_TTL_SECONDS
    return encode_signed_payload(f"strava|{user_id}|{athlete_account_id}|{expires_at}")


def verify_oauth_state(state: str | None) -> tuple[str, str] | None:
    payload = decode_signed_payload(state)
    if not payload:
        return None

    try:
        kind, user_id, athlete_account_id, expires_at_raw = payload.split("|", 3)
        if kind != "strava":
            return None
        if int(expires_at_raw) < int(time.time()):
            return None
        return user_id, athlete_account_id
    except ValueError:
        return None
