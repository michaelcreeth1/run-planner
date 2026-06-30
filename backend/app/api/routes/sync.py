from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import require_current_profile
from app.db.session import get_db
from app.models.planning import AthleteAccount
from app.schemas.activities import StravaBackfillRequest, SyncJobRead
from app.services import strava

router = APIRouter(tags=["sync"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentProfile = Annotated[AthleteAccount, Depends(require_current_profile)]


@router.post("/strava/backfill", response_model=SyncJobRead)
def strava_backfill(
    payload: StravaBackfillRequest,
    db: DbSession,
    profile: CurrentProfile,
):
    return strava.backfill_activities(db, profile.id, payload.days, job_type="initial_backfill")


@router.post("/strava/incremental", response_model=SyncJobRead)
def strava_incremental(db: DbSession, profile: CurrentProfile):
    return strava.backfill_activities(db, profile.id, 14, job_type="incremental_poll")


@router.get("/jobs", response_model=list[SyncJobRead])
def sync_jobs(db: DbSession, profile: CurrentProfile):
    return strava.list_jobs(db, profile.id)
