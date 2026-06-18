from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.activities import StravaBackfillRequest, SyncJobRead
from app.services import strava

router = APIRouter(tags=["sync"])
DbSession = Annotated[Session, Depends(get_db)]


@router.post("/strava/backfill", response_model=SyncJobRead)
def strava_backfill(
    payload: StravaBackfillRequest,
    db: DbSession,
):
    return strava.backfill_activities(db, payload.days, job_type="initial_backfill")


@router.post("/strava/incremental", response_model=SyncJobRead)
def strava_incremental(db: DbSession):
    return strava.backfill_activities(db, 14, job_type="incremental_poll")


@router.get("/jobs", response_model=list[SyncJobRead])
def sync_jobs(db: DbSession):
    return strava.list_jobs(db)
