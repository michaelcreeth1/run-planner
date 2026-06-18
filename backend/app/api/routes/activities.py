from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.activities import StravaActivityRead
from app.services import strava

router = APIRouter(tags=["activities"])
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/activities", response_model=list[StravaActivityRead])
def list_activities(db: DbSession):
    return [strava.activity_to_read(activity) for activity in strava.list_activities(db)]
