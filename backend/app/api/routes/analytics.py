from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import require_current_profile
from app.db.session import get_db
from app.models.planning import AthleteAccount
from app.schemas.analytics import AnalyticsPlanningRead
from app.services import analytics

router = APIRouter(tags=["analytics"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentProfile = Annotated[AthleteAccount, Depends(require_current_profile)]


@router.get("/analytics/planning", response_model=AnalyticsPlanningRead)
def planning_analytics(
    db: DbSession,
    profile: CurrentProfile,
    lookback_weeks: Annotated[int, Query(alias="lookbackWeeks", ge=1, le=52)] = 12,
    future_weeks: Annotated[int, Query(alias="futureWeeks", ge=1, le=26)] = 4,
    anchor_week_start_date: Annotated[
        date | None, Query(alias="anchorWeekStartDate")
    ] = None,
) -> dict:
    return analytics.planning_analytics(
        db,
        profile.id,
        lookback_weeks=lookback_weeks,
        future_weeks=future_weeks,
        anchor_week_start_date=anchor_week_start_date,
    )
