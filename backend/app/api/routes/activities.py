from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import require_current_profile
from app.db.session import get_db
from app.models.planning import AthleteAccount
from app.schemas.activities import StravaActivityRead
from app.services import strava

router = APIRouter(tags=["activities"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentProfile = Annotated[AthleteAccount, Depends(require_current_profile)]


@router.get("/activities", response_model=list[StravaActivityRead])
def list_activities(db: DbSession, profile: CurrentProfile):
    return [
        strava.activity_to_read(activity)
        for activity in strava.list_activities(db, profile.id)
    ]
