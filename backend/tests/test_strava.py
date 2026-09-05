from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.crypto import encrypt_secret
from app.db.session import Base, SessionLocal, engine
from app.models.planning import AthleteAccount
from app.models.strava import StravaOAuthToken, SyncJob
from app.schemas.activities import StravaBackfillRequest
from app.services import strava


@pytest.fixture(autouse=True)
def ensure_schema() -> None:
    Base.metadata.create_all(engine)


def test_connection_status_revokes_unreadable_token() -> None:
    with SessionLocal() as db:
        athlete = AthleteAccount(display_name="Key Rotation", strava_athlete_id="owner-key")
        db.add(athlete)
        db.commit()
        db.refresh(athlete)
        token = StravaOAuthToken(
            athlete_account_id=athlete.id,
            access_token_encrypted="not-a-fernet-token",
            refresh_token_encrypted="not-a-fernet-token",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            scope="read,activity:read",
        )
        db.add(token)
        db.commit()

        status = strava.connection_status(db, athlete.id)

        assert status["connected"] is False
        assert "Reconnect Strava" in status["message"]
        assert token.revoked_at is not None


def test_get_valid_access_token_revokes_unreadable_token() -> None:
    with SessionLocal() as db:
        athlete = AthleteAccount(
            display_name="Worker Key Rotation",
            strava_athlete_id="owner-worker",
        )
        db.add(athlete)
        db.commit()
        db.refresh(athlete)
        token = StravaOAuthToken(
            athlete_account_id=athlete.id,
            access_token_encrypted="not-a-fernet-token",
            refresh_token_encrypted="not-a-fernet-token",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            scope="read,activity:read",
        )
        db.add(token)
        db.commit()

        with pytest.raises(HTTPException) as exc:
            strava.get_valid_access_token(db, athlete.id)

        assert exc.value.status_code == 409
        assert token.revoked_at is not None


def create_refreshable_token(db: Session) -> StravaOAuthToken:
    athlete = AthleteAccount(display_name="Refresh Runner")
    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    token = StravaOAuthToken(
        athlete_account_id=athlete.id,
        access_token_encrypted=encrypt_secret("access-token"),
        refresh_token_encrypted=encrypt_secret("refresh-token"),
        expires_at=datetime.now(timezone.utc),
        scope="read,activity:read",
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return token


class FakeRefreshClient:
    response: httpx.Response

    def __init__(self, *args, **kwargs) -> None:
        pass

    def __enter__(self) -> "FakeRefreshClient":
        return self

    def __exit__(self, *args) -> None:
        return None

    def post(self, *args, **kwargs) -> httpx.Response:
        return self.response


def test_transient_refresh_failure_preserves_token(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeRefreshClient.response = httpx.Response(503, json={"message": "unavailable"})
    monkeypatch.setattr(strava.httpx, "Client", FakeRefreshClient)

    with SessionLocal() as db:
        token = create_refreshable_token(db)

        with pytest.raises(HTTPException) as exc:
            strava.refresh_token(db, token)

        db.refresh(token)
        assert exc.value.status_code == 502
        assert token.revoked_at is None


def test_invalid_refresh_credential_revokes_token(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeRefreshClient.response = httpx.Response(
        400,
        json={"errors": [{"resource": "RefreshToken", "code": "invalid"}]},
    )
    monkeypatch.setattr(strava.httpx, "Client", FakeRefreshClient)

    with SessionLocal() as db:
        token = create_refreshable_token(db)

        with pytest.raises(HTTPException) as exc:
            strava.refresh_token(db, token)

        db.refresh(token)
        assert exc.value.status_code == 409
        assert token.revoked_at is not None


def test_strava_account_cannot_connect_to_multiple_profiles(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeRefreshClient.response = httpx.Response(
        200,
        json={
            "access_token": "new-access-token",
            "refresh_token": "new-refresh-token",
            "expires_at": int((datetime.now(timezone.utc) + timedelta(hours=6)).timestamp()),
            "scope": "read,activity:read",
            "athlete": {"id": 12345, "firstname": "Shared", "lastname": "Runner"},
        },
    )
    monkeypatch.setattr(strava.httpx, "Client", FakeRefreshClient)

    with SessionLocal() as db:
        first = AthleteAccount(display_name="First Profile")
        second = AthleteAccount(display_name="Second Profile")
        db.add_all([first, second])
        db.commit()
        db.refresh(first)
        db.refresh(second)

        strava.exchange_code(db, first.id, "first-code", "read,activity:read")
        with pytest.raises(HTTPException) as exc:
            strava.exchange_code(db, second.id, "second-code", "read,activity:read")

        db.refresh(second)
        assert exc.value.status_code == 409
        assert second.strava_athlete_id is None
        assert strava.get_token(db, second.id) is None


def test_backfill_request_rejects_unbounded_days() -> None:
    with pytest.raises(ValueError):
        StravaBackfillRequest(days=strava.MAX_BACKFILL_DAYS + 1)


def test_manual_backfill_rejects_running_sync() -> None:
    with SessionLocal() as db:
        athlete = AthleteAccount(display_name="Manual Sync")
        db.add(athlete)
        db.commit()
        db.refresh(athlete)
        db.add(
            SyncJob(
                athlete_account_id=athlete.id,
                job_type="initial_backfill",
                status="running",
                started_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        with pytest.raises(HTTPException) as exc:
            strava.backfill_activities(
                db,
                athlete.id,
                days=14,
                enforce_manual_guard=True,
            )

        assert exc.value.status_code == 409


def test_manual_backfill_is_throttled_after_recent_sync() -> None:
    with SessionLocal() as db:
        athlete = AthleteAccount(display_name="Recent Manual Sync")
        db.add(athlete)
        db.commit()
        db.refresh(athlete)
        db.add(
            SyncJob(
                athlete_account_id=athlete.id,
                job_type="initial_backfill",
                status="succeeded",
                started_at=datetime.now(timezone.utc),
                finished_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        with pytest.raises(HTTPException) as exc:
            strava.backfill_activities(
                db,
                athlete.id,
                days=14,
                enforce_manual_guard=True,
            )

        assert exc.value.status_code == 429
