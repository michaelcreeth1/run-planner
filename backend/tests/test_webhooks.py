from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.api.routes import webhooks
from app.core.config import settings
from app.core.crypto import encrypt_secret
from app.db.session import SessionLocal
from app.main import app
from app.models.planning import AthleteAccount
from app.models.strava import StravaActivity, StravaOAuthToken, StravaWebhookEvent, SyncJob
from app.services import strava


def test_strava_webhook_challenge(monkeypatch) -> None:
    monkeypatch.setattr(settings, "strava_webhook_enabled", True)
    monkeypatch.setattr(settings, "strava_webhook_verify_token", "verify-me")

    with TestClient(app) as client:
        response = client.get(
            "/api/webhooks/strava",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "verify-me",
                "hub.challenge": "challenge-value",
            },
        )

    assert response.status_code == 200
    assert response.json() == {"hub.challenge": "challenge-value"}


def test_strava_webhook_challenge_rejects_wrong_token(monkeypatch) -> None:
    monkeypatch.setattr(settings, "strava_webhook_enabled", True)
    monkeypatch.setattr(settings, "strava_webhook_verify_token", "verify-me")

    with TestClient(app) as client:
        response = client.get(
            "/api/webhooks/strava",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong",
                "hub.challenge": "challenge-value",
            },
        )

    assert response.status_code == 403


def test_strava_webhook_event_enqueues_and_processes_in_background(monkeypatch) -> None:
    processed: list[str] = []
    monkeypatch.setattr(settings, "strava_webhook_enabled", True)
    monkeypatch.setattr(settings, "strava_webhook_subscription_id", "sub-1")
    monkeypatch.setattr(
        webhooks,
        "process_webhook_event",
        lambda event_id: processed.append(event_id),
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/webhooks/strava",
            json={
                "object_type": "activity",
                "object_id": 123,
                "aspect_type": "create",
                "owner_id": 456,
                "subscription_id": "sub-1",
                "event_time": 1810000000,
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert processed == [body["event_id"]]

    with SessionLocal() as db:
        event = db.get(StravaWebhookEvent, body["event_id"])
        assert event is not None
        assert event.owner_id == "456"
        assert event.object_id == "123"


def test_strava_webhook_event_rejects_wrong_subscription(monkeypatch) -> None:
    monkeypatch.setattr(settings, "strava_webhook_enabled", True)
    monkeypatch.setattr(settings, "strava_webhook_subscription_id", "sub-1")

    with TestClient(app) as client:
        response = client.post(
            "/api/webhooks/strava",
            json={
                "object_type": "activity",
                "object_id": 123,
                "aspect_type": "create",
                "owner_id": 456,
                "subscription_id": "other-sub",
                "event_time": 1810000001,
            },
        )

    assert response.status_code == 403


def test_process_webhook_event_imports_activity(monkeypatch) -> None:
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        athlete = AthleteAccount(display_name="Webhook Runner", strava_athlete_id="owner-1")
        db.add(athlete)
        db.commit()
        db.refresh(athlete)
        athlete_id = athlete.id
        token = StravaOAuthToken(
            athlete_account_id=athlete.id,
            access_token_encrypted=encrypt_secret("access-token"),
            refresh_token_encrypted=encrypt_secret("refresh-token"),
            expires_at=now + timedelta(hours=1),
            scope="read,activity:read,activity:read_all",
        )
        db.add(token)
        db.commit()

        event = strava.enqueue_webhook_event(
            db,
            {
                "object_type": "activity",
                "object_id": "activity-1",
                "aspect_type": "create",
                "owner_id": "owner-1",
                "subscription_id": "sub-1",
                "event_time": 1810000002,
            },
        )

    activity_payload = {
        "id": "activity-1",
        "name": "Morning Run",
        "sport_type": "Run",
        "start_date": "2026-06-29T12:00:00Z",
        "start_date_local": "2026-06-29T06:00:00Z",
        "distance": 8046.72,
        "moving_time": 2400,
        "elapsed_time": 2500,
    }
    monkeypatch.setattr(
        strava,
        "fetch_activity",
        lambda *_args, **_kwargs: (activity_payload, 98),
    )

    with SessionLocal() as db:
        processed = strava.process_webhook_event(db, event.id)

        assert processed is not None
        assert processed.status == "succeeded"
        activity = db.query(StravaActivity).filter_by(strava_activity_id="activity-1").one()
        assert activity.athlete_account_id == athlete_id
        assert activity.name == "Morning Run"
        job = db.query(SyncJob).filter_by(job_type="strava_webhook_create").one()
        assert job.status == "succeeded"
        assert job.activities_created == 1
        assert job.rate_limit_remaining == 98
