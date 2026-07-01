from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

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
