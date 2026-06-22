import json
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.models.planning import AthleteAccount
from app.models.strava import StravaActivity, StravaOAuthToken, SyncJob
from app.services.planning import ensure_default_athlete

AUTH_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"
REQUIRED_SCOPES = ["read", "activity:read", "activity:read_all"]


def strava_configured() -> bool:
    return bool(settings.strava_client_id and settings.strava_client_secret)


def authorization_url() -> str:
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
            "approval_prompt": "auto",
            "scope": ",".join(REQUIRED_SCOPES),
        }
    )
    return f"{AUTH_URL}?{query}"


def get_token(db: Session) -> StravaOAuthToken | None:
    athlete = ensure_default_athlete(db)
    return db.scalars(
        select(StravaOAuthToken)
        .where(
            StravaOAuthToken.athlete_account_id == athlete.id,
            StravaOAuthToken.revoked_at.is_(None),
        )
        .order_by(StravaOAuthToken.created_at.desc())
    ).first()


def exchange_code(db: Session, code: str, scope: str) -> StravaOAuthToken:
    athlete = ensure_default_athlete(db)
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
    existing = get_token(db)
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


def get_valid_access_token(db: Session) -> tuple[str, StravaOAuthToken]:
    token = get_token(db)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Strava is not connected.",
        )

    expires_at = token.expires_at.replace(tzinfo=timezone.utc)
    refresh_threshold = datetime.now(timezone.utc) + timedelta(minutes=5)
    if expires_at <= refresh_threshold:
        token = refresh_token(db, token)

    return decrypt_secret(token.access_token_encrypted), token


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


def disconnect(db: Session) -> None:
    token = get_token(db)
    if token:
        token.revoked_at = datetime.now(timezone.utc)
        db.commit()


def connection_status(db: Session) -> dict[str, Any]:
    athlete = ensure_default_athlete(db)
    token = get_token(db)
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
    days: int = 180,
    job_type: str = "initial_backfill",
) -> SyncJob:
    athlete = ensure_default_athlete(db)
    job = SyncJob(athlete_account_id=athlete.id, job_type=job_type, status="running")
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        access_token, _ = get_valid_access_token(db)
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
                    result = upsert_activity(db, athlete.id, activity)
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


def upsert_activity(db: Session, athlete_account_id: str, payload: dict[str, Any]) -> str:
    strava_id = str(payload["id"])
    activity = db.scalars(
        select(StravaActivity).where(StravaActivity.strava_activity_id == strava_id)
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


def list_activities(db: Session, limit: int = 100) -> list[StravaActivity]:
    return list(
        db.scalars(
            select(StravaActivity)
            .where(StravaActivity.deleted_at.is_(None))
            .order_by(StravaActivity.start_date_local.desc())
            .limit(limit)
        )
    )


def list_jobs(db: Session, limit: int = 25) -> list[SyncJob]:
    return list(db.scalars(select(SyncJob).order_by(SyncJob.started_at.desc()).limit(limit)))


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
