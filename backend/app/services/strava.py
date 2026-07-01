import json
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from cryptography.fernet import InvalidToken
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.models.planning import AthleteAccount
from app.models.strava import StravaActivity, StravaOAuthToken, StravaWebhookEvent, SyncJob

AUTH_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"
ACTIVITY_URL = "https://www.strava.com/api/v3/activities/{activity_id}"
REQUIRED_SCOPES = ["read", "activity:read", "activity:read_all"]
MAX_BACKFILL_DAYS = 365
MANUAL_SYNC_COOLDOWN_SECONDS = 5 * 60
RUNNING_SYNC_STALE_SECONDS = 60 * 60
MANUAL_SYNC_JOB_TYPES = {"initial_backfill", "incremental_poll"}


def strava_configured() -> bool:
    return bool(settings.strava_client_id and settings.strava_client_secret)


def authorization_url(state: str) -> str:
    if not strava_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Strava client credentials are not configured.",
        )

    query = urlencode(
        {
            "client_id": settings.strava_client_id,
            "redirect_uri": settings.strava_redirect_uri,
            "response_type": "code",
            "approval_prompt": "force",
            "scope": ",".join(REQUIRED_SCOPES),
            "state": state,
        }
    )
    return f"{AUTH_URL}?{query}"


def get_token(db: Session, athlete_account_id: str) -> StravaOAuthToken | None:
    return db.scalars(
        select(StravaOAuthToken)
        .where(
            StravaOAuthToken.athlete_account_id == athlete_account_id,
            StravaOAuthToken.revoked_at.is_(None),
        )
        .order_by(StravaOAuthToken.created_at.desc())
    ).first()


def exchange_code(
    db: Session,
    athlete_account_id: str,
    code: str,
    scope: str,
) -> StravaOAuthToken:
    athlete = db.get(AthleteAccount, athlete_account_id)
    if not athlete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    with httpx.Client(timeout=20) as client:
        response = client.post(
            TOKEN_URL,
            data={
                "client_id": settings.strava_client_id,
                "client_secret": settings.strava_client_secret,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Strava token exchange failed.",
        )

    payload = response.json()
    update_athlete_from_payload(athlete, payload)
    existing = get_token(db, athlete.id)
    if existing:
        existing.revoked_at = datetime.now(timezone.utc)

    token = StravaOAuthToken(
        athlete_account_id=athlete.id,
        access_token_encrypted=encrypt_secret(payload["access_token"]),
        refresh_token_encrypted=encrypt_secret(payload["refresh_token"]),
        expires_at=datetime.fromtimestamp(payload["expires_at"], tz=timezone.utc),
        scope=payload.get("scope") or scope,
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return token


def update_athlete_from_payload(athlete: AthleteAccount, payload: dict[str, Any]) -> None:
    athlete_payload = payload.get("athlete") or {}
    if athlete_payload:
        firstname = athlete_payload.get("firstname") or ""
        lastname = athlete_payload.get("lastname") or ""
        display_name = f"{firstname} {lastname}".strip()
        athlete.display_name = display_name or athlete.display_name
        athlete.strava_athlete_id = str(athlete_payload.get("id") or athlete.strava_athlete_id)


def get_valid_access_token(db: Session, athlete_account_id: str) -> tuple[str, StravaOAuthToken]:
    token = get_token(db, athlete_account_id)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Strava is not connected.",
        )

    try:
        expires_at = token.expires_at.replace(tzinfo=timezone.utc)
        refresh_threshold = datetime.now(timezone.utc) + timedelta(minutes=5)
        if expires_at <= refresh_threshold:
            token = refresh_token(db, token)

        return decrypt_secret(token.access_token_encrypted), token
    except InvalidToken as exc:
        revoke_unreadable_token(db, token)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stored Strava tokens could not be decrypted. Reconnect Strava.",
        ) from exc


def refresh_token(db: Session, token: StravaOAuthToken) -> StravaOAuthToken:
    with httpx.Client(timeout=20) as client:
        response = client.post(
            TOKEN_URL,
            data={
                "client_id": settings.strava_client_id,
                "client_secret": settings.strava_client_secret,
                "refresh_token": decrypt_secret(token.refresh_token_encrypted),
                "grant_type": "refresh_token",
            },
        )
    if response.status_code >= 400:
        token.revoked_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Strava token refresh failed.",
        )

    payload = response.json()
    token.access_token_encrypted = encrypt_secret(payload["access_token"])
    token.refresh_token_encrypted = encrypt_secret(payload["refresh_token"])
    token.expires_at = datetime.fromtimestamp(payload["expires_at"], tz=timezone.utc)
    token.last_refresh_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(token)
    return token


def revoke_unreadable_token(db: Session, token: StravaOAuthToken) -> None:
    token.revoked_at = datetime.now(timezone.utc)
    db.commit()


def disconnect(db: Session, athlete_account_id: str) -> None:
    token = get_token(db, athlete_account_id)
    if token:
        token.revoked_at = datetime.now(timezone.utc)
        db.commit()


def connection_status(db: Session, athlete_account_id: str) -> dict[str, Any]:
    athlete = db.get(AthleteAccount, athlete_account_id)
    if not athlete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    token = get_token(db, athlete_account_id)
    configured = strava_configured()
    if not token:
        if configured:
            message = "Strava is configured but not connected."
        else:
            message = "Strava is not configured."
        return {
            "connected": False,
            "configured": configured,
            "athlete_name": athlete.display_name if athlete.strava_athlete_id else None,
            "granted_scopes": [],
            "expires_at": None,
            "message": message,
        }

    try:
        decrypt_secret(token.access_token_encrypted)
        decrypt_secret(token.refresh_token_encrypted)
    except InvalidToken:
        revoke_unreadable_token(db, token)
        return {
            "connected": False,
            "configured": configured,
            "athlete_name": athlete.display_name if athlete.strava_athlete_id else None,
            "granted_scopes": [],
            "expires_at": None,
            "message": "Stored Strava tokens could not be decrypted. Reconnect Strava.",
        }

    return {
        "connected": True,
        "configured": configured,
        "athlete_name": athlete.display_name,
        "granted_scopes": [scope for scope in token.scope.replace(",", " ").split() if scope],
        "expires_at": token.expires_at,
        "message": "Connected to Strava.",
    }


def backfill_activities(
    db: Session,
    athlete_account_id: str,
    days: int = 180,
    job_type: str = "initial_backfill",
    enforce_manual_guard: bool = False,
) -> SyncJob:
    days = validate_backfill_days(days)
    if enforce_manual_guard:
        ensure_manual_sync_allowed(db, athlete_account_id)

    job = SyncJob(athlete_account_id=athlete_account_id, job_type=job_type, status="running")
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        access_token, _ = get_valid_access_token(db, athlete_account_id)
        after = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())
        fetched = 0
        created = 0
        updated = 0
        unchanged = 0
        rate_limit_remaining: int | None = None

        with httpx.Client(timeout=30) as client:
            for page in range(1, 20):
                response = client.get(
                    ACTIVITIES_URL,
                    headers={"Authorization": f"Bearer {access_token}"},
                    params={"after": after, "page": page, "per_page": 200},
                )
                if response.status_code >= 400:
                    raise RuntimeError("Strava activity fetch failed.")

                rate_limit_remaining = parse_rate_limit_remaining(
                    response.headers.get("x-ratelimit-usage"),
                    response.headers.get("x-ratelimit-limit"),
                )
                activities = response.json()
                if not activities:
                    break

                fetched += len(activities)
                for activity in activities:
                    result = upsert_activity(db, athlete_account_id, activity)
                    if result == "created":
                        created += 1
                    elif result == "updated":
                        updated += 1
                    else:
                        unchanged += 1

                if len(activities) < 200:
                    break

        job.status = "succeeded"
        job.activities_fetched = fetched
        job.activities_created = created
        job.activities_updated = updated
        job.activities_unchanged = unchanged
        job.rate_limit_remaining = rate_limit_remaining
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)
        return job
    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise


def validate_backfill_days(days: int) -> int:
    if days < 1 or days > MAX_BACKFILL_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Strava backfill days must be between 1 and {MAX_BACKFILL_DAYS}.",
        )
    return days


def ensure_manual_sync_allowed(db: Session, athlete_account_id: str) -> None:
    now = datetime.now(timezone.utc)
    manual_jobs = list(
        db.scalars(
            select(SyncJob)
            .where(
                SyncJob.athlete_account_id == athlete_account_id,
                SyncJob.job_type.in_(MANUAL_SYNC_JOB_TYPES),
            )
            .order_by(SyncJob.started_at.desc())
            .limit(10)
        )
    )

    for job in manual_jobs:
        started_at = ensure_utc(job.started_at)
        if (
            job.status == "running"
            and started_at >= now - timedelta(seconds=RUNNING_SYNC_STALE_SECONDS)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A Strava sync is already running for this profile.",
            )

    for job in manual_jobs:
        started_at = ensure_utc(job.started_at)
        if started_at >= now - timedelta(seconds=MANUAL_SYNC_COOLDOWN_SECONDS):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Manual Strava sync is throttled. Try again in a few minutes.",
            )


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def valid_webhook_subscription(subscription_id: int | str | None) -> bool:
    expected = settings.strava_webhook_subscription_id.strip()
    if not expected:
        return True
    return str(subscription_id or "") == expected


def enqueue_webhook_event(db: Session, payload: dict[str, Any]) -> StravaWebhookEvent:
    event = db.scalars(
        select(StravaWebhookEvent).where(
            StravaWebhookEvent.owner_id == str(payload["owner_id"]),
            StravaWebhookEvent.object_type == payload["object_type"],
            StravaWebhookEvent.object_id == str(payload["object_id"]),
            StravaWebhookEvent.aspect_type == payload["aspect_type"],
            StravaWebhookEvent.subscription_id == str(payload.get("subscription_id") or ""),
            StravaWebhookEvent.event_time == payload.get("event_time"),
        )
    ).first()
    if event:
        return event

    event = StravaWebhookEvent(
        owner_id=str(payload["owner_id"]),
        object_type=payload["object_type"],
        object_id=str(payload["object_id"]),
        aspect_type=payload["aspect_type"],
        subscription_id=str(payload.get("subscription_id") or ""),
        event_time=payload.get("event_time"),
        updates_json=payload.get("updates") or {},
        raw_payload_json=payload,
        status="queued",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def process_pending_webhook_events(db: Session, limit: int = 25) -> list[StravaWebhookEvent]:
    events = list(
        db.scalars(
            select(StravaWebhookEvent)
            .where(
                StravaWebhookEvent.status.in_(["queued", "failed"]),
                StravaWebhookEvent.attempts < settings.strava_webhook_max_attempts,
            )
            .order_by(StravaWebhookEvent.received_at.asc())
            .limit(limit)
        )
    )
    for event in events:
        process_webhook_event(db, event.id)
    return events


def process_webhook_event(db: Session, event_id: str) -> StravaWebhookEvent | None:
    event = db.get(StravaWebhookEvent, event_id)
    if not event:
        return None
    if event.status in {"succeeded", "ignored"}:
        return event

    event.status = "processing"
    event.attempts += 1
    event.error_message = None
    db.commit()
    db.refresh(event)

    job: SyncJob | None = None
    try:
        athlete = connected_athlete_for_strava_owner(db, event.owner_id)
        if not athlete:
            finish_webhook_event(
                db,
                event,
                "ignored",
                "No connected profile found for Strava owner.",
            )
            return event

        event.athlete_account_id = athlete.id
        if event.object_type != "activity":
            finish_webhook_event(db, event, "ignored", "Unsupported Strava object type.")
            return event
        if event.aspect_type not in {"create", "update", "delete"}:
            finish_webhook_event(db, event, "ignored", "Unsupported Strava event aspect.")
            return event

        job = SyncJob(
            athlete_account_id=athlete.id,
            job_type=f"strava_webhook_{event.aspect_type}",
            status="running",
            metadata_json={
                "webhook_event_id": event.id,
                "strava_activity_id": event.object_id,
                "event_time": event.event_time,
            },
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        if event.aspect_type == "delete":
            deleted = mark_activity_deleted(db, athlete.id, event.object_id)
            job.activities_deleted = 1 if deleted else 0
        else:
            activity_payload, rate_limit_remaining = fetch_activity(db, athlete.id, event.object_id)
            result = upsert_activity(db, athlete.id, activity_payload)
            job.activities_fetched = 1
            job.activities_created = 1 if result == "created" else 0
            job.activities_updated = 1 if result == "updated" else 0
            job.activities_unchanged = 1 if result == "unchanged" else 0
            job.rate_limit_remaining = rate_limit_remaining

        job.status = "succeeded"
        job.finished_at = datetime.now(timezone.utc)
        finish_webhook_event(db, event, "succeeded")
        return event
    except Exception as exc:
        if job:
            job.status = "failed"
            job.error_message = str(exc)
            job.finished_at = datetime.now(timezone.utc)
        event.status = "failed"
        event.error_message = str(exc)
        event.processed_at = datetime.now(timezone.utc)
        db.commit()
        return event


def finish_webhook_event(
    db: Session,
    event: StravaWebhookEvent,
    status_value: str,
    error_message: str | None = None,
) -> None:
    event.status = status_value
    event.error_message = error_message
    event.processed_at = datetime.now(timezone.utc)
    db.commit()


def connected_athlete_for_strava_owner(db: Session, owner_id: str) -> AthleteAccount | None:
    return db.scalars(
        select(AthleteAccount)
        .join(StravaOAuthToken, StravaOAuthToken.athlete_account_id == AthleteAccount.id)
        .where(
            AthleteAccount.strava_athlete_id == owner_id,
            StravaOAuthToken.revoked_at.is_(None),
        )
        .order_by(StravaOAuthToken.created_at.desc())
    ).first()


def fetch_activity(
    db: Session,
    athlete_account_id: str,
    strava_activity_id: str,
) -> tuple[dict[str, Any], int | None]:
    access_token, _ = get_valid_access_token(db, athlete_account_id)
    with httpx.Client(timeout=20) as client:
        response = client.get(
            ACTIVITY_URL.format(activity_id=strava_activity_id),
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if response.status_code >= 400:
        raise RuntimeError("Strava activity fetch failed.")

    return response.json(), parse_rate_limit_remaining(
        response.headers.get("x-ratelimit-usage"),
        response.headers.get("x-ratelimit-limit"),
    )


def mark_activity_deleted(db: Session, athlete_account_id: str, strava_activity_id: str) -> bool:
    activity = db.scalars(
        select(StravaActivity).where(
            StravaActivity.strava_activity_id == strava_activity_id,
            StravaActivity.athlete_account_id == athlete_account_id,
            StravaActivity.deleted_at.is_(None),
        )
    ).first()
    if not activity:
        return False
    activity.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return True


def upsert_activity(db: Session, athlete_account_id: str, payload: dict[str, Any]) -> str:
    strava_id = str(payload["id"])
    activity = db.scalars(
        select(StravaActivity).where(
            StravaActivity.strava_activity_id == strava_id,
            StravaActivity.athlete_account_id == athlete_account_id,
        )
    ).first()
    created = activity is None
    if activity is None:
        activity = StravaActivity(
            strava_activity_id=strava_id,
            athlete_account_id=athlete_account_id,
        )
        db.add(activity)

    if not created and raw_payload_matches(activity.raw_payload_json, payload):
        return "unchanged"

    activity.name = payload.get("name") or "Untitled activity"
    activity.sport_type = payload.get("sport_type") or payload.get("type") or "Unknown"
    activity.start_date = parse_strava_datetime(payload["start_date"])
    activity.start_date_local = parse_strava_datetime(payload["start_date_local"])
    activity.timezone = payload.get("timezone")
    activity.distance = float(payload.get("distance") or 0)
    activity.moving_time = payload.get("moving_time")
    activity.elapsed_time = payload.get("elapsed_time")
    activity.total_elevation_gain = payload.get("total_elevation_gain")
    activity.average_speed = payload.get("average_speed")
    activity.max_speed = payload.get("max_speed")
    activity.average_heartrate = payload.get("average_heartrate")
    activity.max_heartrate = payload.get("max_heartrate")
    activity.average_cadence = payload.get("average_cadence")
    activity.average_watts = payload.get("average_watts")
    activity.perceived_exertion = payload.get("perceived_exertion")
    activity.private = bool(payload.get("private"))
    activity.trainer = bool(payload.get("trainer"))
    activity.commute = bool(payload.get("commute"))
    activity.manual = bool(payload.get("manual"))
    activity.raw_payload_json = payload
    db.commit()
    return "created" if created else "updated"


def raw_payload_matches(
    existing_raw: dict[str, Any] | str,
    incoming_payload: dict[str, Any],
) -> bool:
    if isinstance(existing_raw, dict):
        return existing_raw == incoming_payload
    try:
        return json.loads(existing_raw) == incoming_payload
    except json.JSONDecodeError:
        return False


def list_activities(db: Session, athlete_account_id: str, limit: int = 100) -> list[StravaActivity]:
    return list(
        db.scalars(
            select(StravaActivity)
            .where(
                StravaActivity.athlete_account_id == athlete_account_id,
                StravaActivity.deleted_at.is_(None),
            )
            .order_by(StravaActivity.start_date_local.desc())
            .limit(limit)
        )
    )


def list_jobs(db: Session, athlete_account_id: str, limit: int = 25) -> list[SyncJob]:
    return list(
        db.scalars(
            select(SyncJob)
            .where(SyncJob.athlete_account_id == athlete_account_id)
            .order_by(SyncJob.started_at.desc())
            .limit(limit)
        )
    )


def connected_athlete_ids(db: Session) -> list[str]:
    return list(
        db.scalars(
            select(StravaOAuthToken.athlete_account_id)
            .where(StravaOAuthToken.revoked_at.is_(None))
            .distinct()
        )
    )


def parse_strava_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def parse_rate_limit_remaining(usage: str | None, limit: str | None) -> int | None:
    if not usage or not limit:
        return None
    try:
        usage_short = int(usage.split(",")[0])
        limit_short = int(limit.split(",")[0])
    except (ValueError, IndexError):
        return None
    return limit_short - usage_short


def activity_to_read(activity: StravaActivity) -> dict[str, Any]:
    return {
        "id": activity.id,
        "strava_activity_id": activity.strava_activity_id,
        "name": activity.name,
        "sport_type": activity.sport_type,
        "start_date": activity.start_date,
        "start_date_local": activity.start_date_local,
        "distance": activity.distance,
        "distance_miles": round(activity.distance / 1609.344, 2),
        "moving_time": activity.moving_time,
        "elapsed_time": activity.elapsed_time,
        "total_elevation_gain": activity.total_elevation_gain,
        "average_heartrate": activity.average_heartrate,
        "private": bool(activity.private),
        "trainer": bool(activity.trainer),
        "commute": bool(activity.commute),
        "manual": bool(activity.manual),
    }
