from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.db.session import SessionLocal
from app.models.planning import AthleteAccount
from app.models.strava import StravaOAuthToken
from app.services import strava


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
