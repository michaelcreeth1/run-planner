from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.auth import require_current_profile
from app.db.session import get_db
from app.models.planning import AthleteAccount
from app.schemas.planning import (
    GoalRaceCreate,
    GoalRaceRead,
    GoalRaceUpdate,
    ScaffoldPreviewRead,
    TrainingPlanMetadataPatch,
    TrainingPlanRead,
    TrainingPlanSpec,
    TrainingPlanSummaryRead,
)
from app.services import plans

router = APIRouter(tags=["plans"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentProfile = Annotated[AthleteAccount, Depends(require_current_profile)]


@router.get("/goal-races", response_model=list[GoalRaceRead])
def list_goal_races(db: DbSession, profile: CurrentProfile) -> list[dict]:
    return plans.list_goal_races(db, profile.id)


@router.post("/goal-races", response_model=GoalRaceRead, status_code=status.HTTP_201_CREATED)
def create_goal_race(payload: GoalRaceCreate, db: DbSession, profile: CurrentProfile) -> dict:
    return plans.create_goal_race(db, payload, profile.id)


@router.patch("/goal-races/{goal_race_id}", response_model=GoalRaceRead)
def update_goal_race(
    goal_race_id: str,
    payload: GoalRaceUpdate,
    db: DbSession,
    profile: CurrentProfile,
) -> dict:
    return plans.update_goal_race(db, goal_race_id, payload, profile.id)


@router.delete("/goal-races/{goal_race_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal_race(goal_race_id: str, db: DbSession, profile: CurrentProfile) -> Response:
    plans.delete_goal_race(db, goal_race_id, profile.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/plans", response_model=list[TrainingPlanSummaryRead])
def list_plans(db: DbSession, profile: CurrentProfile) -> list[dict]:
    return plans.list_plans(db, profile.id)


@router.post("/plans/preview", response_model=ScaffoldPreviewRead)
def preview_plan(payload: TrainingPlanSpec, db: DbSession, profile: CurrentProfile) -> dict:
    return plans.preview_plan(db, payload, profile.id)


@router.post("/plans", response_model=TrainingPlanRead, status_code=status.HTTP_201_CREATED)
def create_plan(payload: TrainingPlanSpec, db: DbSession, profile: CurrentProfile) -> dict:
    return plans.create_plan(db, payload, profile.id)


@router.get("/plans/{plan_id}", response_model=TrainingPlanRead)
def get_plan(plan_id: str, db: DbSession, profile: CurrentProfile) -> dict:
    return plans.get_plan(db, plan_id, profile.id)


@router.post("/plans/{plan_id}/preview", response_model=ScaffoldPreviewRead)
def preview_plan_edit(plan_id: str, payload: TrainingPlanSpec, db: DbSession, profile: CurrentProfile) -> dict:
    return plans.preview_plan(db, payload, profile.id, existing_plan_id=plan_id)


@router.put("/plans/{plan_id}", response_model=TrainingPlanRead)
def replace_plan(plan_id: str, payload: TrainingPlanSpec, db: DbSession, profile: CurrentProfile) -> dict:
    return plans.replace_plan(db, plan_id, payload, profile.id)


@router.patch("/plans/{plan_id}", response_model=TrainingPlanRead)
def patch_plan(
    plan_id: str,
    payload: TrainingPlanMetadataPatch,
    db: DbSession,
    profile: CurrentProfile,
) -> dict:
    return plans.patch_plan(db, plan_id, payload, profile.id)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: str,
    db: DbSession,
    profile: CurrentProfile,
    clear_scaffolding: bool = Query(default=False, alias="clearScaffolding"),
) -> Response:
    plans.delete_plan(db, plan_id, profile.id, clear_scaffolding=clear_scaffolding)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
