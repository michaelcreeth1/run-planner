from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal, get_db
from app.services import strava

router = APIRouter(tags=["webhooks"])
DbSession = Annotated[Session, Depends(get_db)]


class StravaWebhookEventPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    object_type: str
    object_id: int | str
    aspect_type: str
    owner_id: int | str
    subscription_id: int | str | None = None
    event_time: int | None = None
    updates: dict[str, Any] = Field(default_factory=dict)


def process_webhook_event(event_id: str) -> None:
    with SessionLocal() as db:
        strava.process_webhook_event(db, event_id)


@router.get("/strava")
def strava_webhook_challenge(
    mode: Annotated[str | None, Query(alias="hub.mode")] = None,
    verify_token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
    challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
) -> dict[str, str]:
    if not settings.strava_webhook_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Strava webhooks are not enabled.",
        )
    if mode != "subscribe" or not challenge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Strava webhook challenge.",
        )
    if (
        not settings.strava_webhook_verify_token
        or verify_token != settings.strava_webhook_verify_token
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Strava webhook verify token.",
        )
    return {"hub.challenge": challenge}


@router.post("/strava")
def strava_webhook_event(
    payload: StravaWebhookEventPayload,
    background_tasks: BackgroundTasks,
    db: DbSession,
) -> dict[str, str]:
    if not settings.strava_webhook_enabled:
        return {"status": "ignored"}
    if not strava.valid_webhook_subscription(payload.subscription_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid Strava webhook subscription.",
        )

    event = strava.enqueue_webhook_event(db, payload.model_dump(mode="json"))
    if (
        event.status in {"queued", "failed"}
        and event.attempts < settings.strava_webhook_max_attempts
    ):
        background_tasks.add_task(process_webhook_event, event.id)
    return {"status": event.status, "event_id": event.id}
