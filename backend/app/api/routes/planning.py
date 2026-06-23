from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.planning import (
    PlannedWorkoutCreate,
    PlannedWorkoutMove,
    PlannedWorkoutRead,
    PlannedWorkoutUpdate,
    TrainingTimelineRead,
    TrainingWeekPatch,
    TrainingWeekRead,
    WeekGoalCreate,
    WeekGoalRead,
    WeekGoalUpdate,
    WeekListRead,
)
from app.services import planning

router = APIRouter(tags=["planning"])
DbSession = Annotated[Session, Depends(get_db)]


@router.get("/weeks", response_model=WeekListRead)
def list_weeks(db: DbSession) -> dict[str, list[dict]]:
    weeks = [planning.serialize_week(week, db) for week in planning.list_weeks(db)]
    return {"weeks": weeks}


@router.get("/training-timeline", response_model=TrainingTimelineRead)
def training_timeline(db: DbSession) -> dict:
    return planning.training_timeline(db)


@router.get("/weeks/current", response_model=TrainingWeekRead)
def current_week(db: DbSession) -> dict:
    today = date.today()
    week = planning.get_or_create_week(db, planning.week_start_for(today))
    return planning.serialize_week(week, db)


@router.get("/weeks/{week_start_date}", response_model=TrainingWeekRead)
def get_week(week_start_date: date, db: DbSession) -> dict:
    week = planning.get_or_create_week(db, planning.week_start_for(week_start_date))
    return planning.serialize_week(week, db)


@router.patch("/weeks/{week_id}", response_model=TrainingWeekRead)
def update_week(
    week_id: str,
    payload: TrainingWeekPatch,
    db: DbSession,
) -> dict:
    week = planning.update_week(db, week_id, payload)
    return planning.serialize_week(week, db)


@router.post("/weeks/{week_id}/recalculate", response_model=TrainingWeekRead)
def recalculate_week(week_id: str, db: DbSession) -> dict:
    week = planning.get_week_by_id(db, week_id)
    planning.recalculate_week(db, week)
    return planning.serialize_week(week, db)


@router.post("/weeks/{week_id}/copy-prior", response_model=TrainingWeekRead)
def copy_prior_week(week_id: str, db: DbSession) -> dict:
    week = planning.copy_prior_week(db, week_id)
    return planning.serialize_week(week, db)


@router.post(
    "/weeks/{week_id}/goals", response_model=WeekGoalRead, status_code=status.HTTP_201_CREATED
)
def create_week_goal(
    week_id: str,
    payload: WeekGoalCreate,
    db: DbSession,
):
    return planning.serialize_goal(planning.create_week_goal(db, week_id, payload))


@router.post("/weeks/{week_id}/goals/derive", response_model=TrainingWeekRead)
def derive_week_goals(week_id: str, db: DbSession) -> dict:
    week = planning.derive_week_goals(db, week_id)
    return planning.serialize_week(week, db)


@router.patch("/week-goals/{goal_id}", response_model=WeekGoalRead)
def update_week_goal(
    goal_id: str,
    payload: WeekGoalUpdate,
    db: DbSession,
):
    return planning.serialize_goal(planning.update_week_goal(db, goal_id, payload))


@router.delete("/week-goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_week_goal(goal_id: str, db: DbSession) -> Response:
    planning.delete_week_goal(db, goal_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/planned-workouts", response_model=list[PlannedWorkoutRead])
def list_planned_workouts(db: DbSession) -> list:
    return planning.list_workouts(db)


@router.post(
    "/planned-workouts",
    response_model=PlannedWorkoutRead,
    status_code=status.HTTP_201_CREATED,
)
def create_planned_workout(
    payload: PlannedWorkoutCreate,
    db: DbSession,
):
    return planning.create_workout(db, payload)


@router.get("/planned-workouts/{workout_id}", response_model=PlannedWorkoutRead)
def get_planned_workout(workout_id: str, db: DbSession):
    return planning.get_workout(db, workout_id)


@router.patch("/planned-workouts/{workout_id}", response_model=PlannedWorkoutRead)
def update_planned_workout(
    workout_id: str,
    payload: PlannedWorkoutUpdate,
    db: DbSession,
):
    return planning.update_workout(db, workout_id, payload)


@router.delete("/planned-workouts/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_planned_workout(workout_id: str, db: DbSession) -> Response:
    planning.delete_workout(db, workout_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/planned-workouts/{workout_id}/move", response_model=PlannedWorkoutRead)
def move_planned_workout(
    workout_id: str,
    payload: PlannedWorkoutMove,
    db: DbSession,
):
    return planning.move_workout(db, workout_id, payload.planned_date)


@router.post("/planned-workouts/{workout_id}/duplicate", response_model=PlannedWorkoutRead)
def duplicate_planned_workout(workout_id: str, db: DbSession):
    return planning.duplicate_workout(db, workout_id)
