from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.goal_metrics import GOAL_METRICS, infer_goal_metric, normalized_goal_thresholds
from app.models.planning import (
    AthleteAccount,
    PlannedWorkout,
    PlannedWorkoutStep,
    RecurringGoal,
    TrainingWeek,
    WeekGoal,
    WeeklyMetricSnapshot,
)
from app.models.strava import StravaActivity
from app.schemas.planning import (
    PlannedWorkoutCreate,
    PlannedWorkoutUpdate,
    PlanWeekSave,
    RecurringGoalSpec,
    TrainingWeekPatch,
    WeekGoalCreate,
    WeekGoalUpdate,
)
from app.services import weekly_metrics

VIRTUAL_WEEK_ID_PREFIX = "virtual-week:"
VIRTUAL_GOAL_ID_PREFIX = "virtual-goal:"
DEFAULT_ATHLETE_GOALS: list[dict] = [
    {
        "metric_key": "rest_day_count",
        "category": "recovery",
        "goal_type": "achievement",
        "label": "Preserve at least 1 rest day",
        "target_value": 1,
        "min_acceptable": 1,
        "max_acceptable": None,
        "unit": "days",
        "evaluation_mode": "at_least",
        "priority": "secondary",
    },
    {
        "metric_key": "long_run_share",
        "category": "long_run",
        "goal_type": "guardrail",
        "label": "Long run no more than 30% of week",
        "target_value": 30,
        "min_acceptable": None,
        "max_acceptable": 30,
        "unit": "percent",
        "evaluation_mode": "at_most",
        "priority": "guardrail",
    },
    {
        "metric_key": "hard_training_day_count",
        "category": "quality",
        "goal_type": "guardrail",
        "label": "No more than 2 hard days",
        "target_value": 2,
        "min_acceptable": None,
        "max_acceptable": 2,
        "unit": "days",
        "evaluation_mode": "at_most",
        "priority": "guardrail",
    },
]
WEEK_PURPOSE_IDS = frozenset(
    {
        "aerobic_build",
        "maintain",
        "down_week",
        "workout_focus",
        "long_run_focus",
        "recovery",
        "race_week",
        "custom",
    }
)


def week_start_for(day: date) -> date:
    return day - timedelta(days=day.weekday())


def week_end_for(week_start: date) -> date:
    return week_start + timedelta(days=6)


def today_for_timezone(timezone_name: str | None, now: datetime | None = None) -> date:
    if timezone_name:
        instant = now or datetime.now(timezone.utc)
        if instant.tzinfo is None:
            instant = instant.replace(tzinfo=timezone.utc)
        try:
            return instant.astimezone(ZoneInfo(timezone_name)).date()
        except ZoneInfoNotFoundError:
            pass
    if now is not None:
        return now.date()
    return date.today()


def virtual_week_id(athlete_account_id: str, week_start: date) -> str:
    return f"{VIRTUAL_WEEK_ID_PREFIX}{athlete_account_id}:{week_start.isoformat()}"


def virtual_goal_id(week_id: str, index: int) -> str:
    return f"{VIRTUAL_GOAL_ID_PREFIX}{week_id}:{index}"


def week_start_from_virtual_id(
    week_id: str,
    athlete_account_id: str | None = None,
) -> date | None:
    if not week_id.startswith(VIRTUAL_WEEK_ID_PREFIX):
        return None

    try:
        encoded_athlete_id, week_start_raw = week_id.removeprefix(VIRTUAL_WEEK_ID_PREFIX).rsplit(
            ":", 1
        )
        if athlete_account_id is not None and encoded_athlete_id != athlete_account_id:
            return None
        return week_start_for(date.fromisoformat(week_start_raw))
    except ValueError:
        return None


def ensure_default_athlete(db: Session) -> AthleteAccount:
    athlete = db.scalars(select(AthleteAccount).limit(1)).first()
    if athlete:
        return athlete

    athlete = AthleteAccount(display_name="Michael Creeth", timezone="America/Denver")
    db.add(athlete)
    db.flush()
    seed_default_goals(db, athlete.id)
    db.commit()
    db.refresh(athlete)
    return athlete


def get_or_create_week(
    db: Session,
    week_start: date,
    athlete_account_id: str | None = None,
) -> TrainingWeek:
    athlete = ensure_default_athlete(db) if athlete_account_id is None else None
    active_athlete_id = athlete_account_id or athlete.id
    week = db.scalars(
        select(TrainingWeek)
        .where(
            TrainingWeek.athlete_account_id == active_athlete_id,
            TrainingWeek.week_start_date == week_start,
        )
        .options(selectinload(TrainingWeek.workouts).selectinload(PlannedWorkout.steps))
        .options(selectinload(TrainingWeek.goals))
    ).first()
    if week:
        recalculate_week(db, week)
        return week

    week = TrainingWeek(
        athlete_account_id=active_athlete_id,
        week_start_date=week_start,
        week_end_date=week_end_for(week_start),
    )
    db.add(week)
    db.commit()
    db.refresh(week)
    return load_week(db, week.week_start_date, active_athlete_id)


def find_week(
    db: Session,
    week_start: date,
    athlete_account_id: str,
) -> TrainingWeek | None:
    return db.scalars(
        select(TrainingWeek)
        .where(
            TrainingWeek.athlete_account_id == athlete_account_id,
            TrainingWeek.week_start_date == week_start,
        )
        .options(selectinload(TrainingWeek.workouts).selectinload(PlannedWorkout.steps))
        .options(selectinload(TrainingWeek.goals))
    ).first()


def week_read(
    db: Session,
    week_start: date,
    athlete_account_id: str,
) -> dict:
    normalized_start = week_start_for(week_start)
    week = find_week(db, normalized_start, athlete_account_id)
    if week:
        return serialize_week(week, db)
    return serialize_virtual_week(db, normalized_start, athlete_account_id)


def load_week(
    db: Session,
    week_start: date,
    athlete_account_id: str | None = None,
) -> TrainingWeek:
    athlete = ensure_default_athlete(db) if athlete_account_id is None else None
    active_athlete_id = athlete_account_id or athlete.id
    week = db.scalars(
        select(TrainingWeek)
        .where(
            TrainingWeek.athlete_account_id == active_athlete_id,
            TrainingWeek.week_start_date == week_start,
        )
        .options(selectinload(TrainingWeek.workouts).selectinload(PlannedWorkout.steps))
        .options(selectinload(TrainingWeek.goals))
    ).first()
    if not week:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training week not found.",
        )
    recalculate_week(db, week)
    return week


def list_weeks(db: Session, athlete_account_id: str | None = None) -> list[TrainingWeek]:
    athlete = ensure_default_athlete(db) if athlete_account_id is None else None
    active_athlete_id = athlete_account_id or athlete.id
    return list(
        db.scalars(
            select(TrainingWeek)
            .where(TrainingWeek.athlete_account_id == active_athlete_id)
            .options(selectinload(TrainingWeek.workouts).selectinload(PlannedWorkout.steps))
            .options(selectinload(TrainingWeek.goals))
            .order_by(TrainingWeek.week_start_date.desc())
        )
    )


def training_timeline(db: Session, athlete_account_id: str | None = None) -> dict:
    athlete = ensure_default_athlete(db) if athlete_account_id is None else None
    active_athlete_id = athlete_account_id or athlete.id
    month_summaries: dict[tuple[int, int], dict] = defaultdict(new_timeline_month_summary)
    data_week_starts: set[date] = set()

    workouts = db.scalars(
        select(PlannedWorkout).where(PlannedWorkout.athlete_account_id == active_athlete_id)
    ).all()
    for workout in workouts:
        week_start = week_start_for(workout.planned_date)
        month_key = (workout.planned_date.year, workout.planned_date.month)
        summary = month_summaries[month_key]
        summary["has_plan"] = True
        if workout.sport == "run":
            summary["planned_miles"] += workout.planned_distance or 0
        data_week_starts.add(week_start)

    activities = db.scalars(
        select(StravaActivity).where(
            StravaActivity.athlete_account_id == active_athlete_id,
            StravaActivity.deleted_at.is_(None),
        )
    ).all()
    for activity in activities:
        activity_date = activity.start_date_local.date()
        week_start = week_start_for(activity_date)
        month_key = (activity_date.year, activity_date.month)
        summary = month_summaries[month_key]
        summary["has_activities"] = True
        summary["actual_miles"] += activity.distance / 1609.344
        data_week_starts.add(week_start)

    metadata_weeks = db.scalars(
        select(TrainingWeek).where(
            TrainingWeek.athlete_account_id == active_athlete_id,
            (TrainingWeek.notes != "")
            | (TrainingWeek.purpose != "")
            | TrainingWeek.target_mileage.is_not(None)
            | TrainingWeek.target_long_run_distance.is_not(None)
            | (TrainingWeek.is_down_week == 1),
        )
    ).all()
    for week in metadata_weeks:
        month_key = (week.week_start_date.year, week.week_start_date.month)
        month_summaries[month_key]["has_plan"] = True
        data_week_starts.add(week.week_start_date)

    goal_weeks = db.scalars(
        select(WeekGoal.week_start_date).where(
            WeekGoal.athlete_account_id == active_athlete_id,
            WeekGoal.is_enabled == 1,
        )
    ).all()
    for week_start in goal_weeks:
        month_key = (week_start.year, week_start.month)
        month_summaries[month_key]["has_plan"] = True
        data_week_starts.add(week_start)

    months = [
        {
            "year": year,
            "month": month,
            "has_plan": summary["has_plan"],
            "has_activities": summary["has_activities"],
            "planned_miles": round_optional_miles(summary["planned_miles"]),
            "actual_miles": round_optional_miles(summary["actual_miles"]),
        }
        for (year, month), summary in sorted(month_summaries.items())
    ]

    return {
        "oldest_week_start_date": min(data_week_starts) if data_week_starts else None,
        "newest_week_start_date": max(data_week_starts) if data_week_starts else None,
        "months": months,
    }


def new_timeline_month_summary() -> dict:
    return {
        "has_plan": False,
        "has_activities": False,
        "planned_miles": 0,
        "actual_miles": 0,
    }


def round_optional_miles(value: float) -> float | None:
    return round(value, 1) if value > 0 else None


def update_week(
    db: Session,
    week_id: str,
    payload: TrainingWeekPatch,
    athlete_account_id: str | None = None,
) -> TrainingWeek:
    week = get_or_create_week_for_mutation(db, week_id, athlete_account_id)
    updates = payload.model_dump(exclude_unset=True)
    if "purpose" in updates:
        updates["purpose"] = normalize_week_purpose(updates["purpose"])
        week.purpose_source = "manual"
        if "is_down_week" not in updates:
            week.is_down_week = int(updates["purpose"] == "down_week")
    if "is_down_week" in updates:
        week.purpose_source = "manual"
        updates["is_down_week"] = int(bool(updates["is_down_week"]))
    if "target_mileage" in updates:
        week.target_mileage_source = "manual"
    if "target_long_run_distance" in updates:
        week.target_long_run_source = "manual"
    for field, value in updates.items():
        setattr(week, field, value)
    db.commit()
    return load_week(db, week.week_start_date, week.athlete_account_id)


def create_week_goal(
    db: Session,
    week_id: str,
    payload: WeekGoalCreate,
    athlete_account_id: str | None = None,
) -> WeekGoal:
    week = get_or_create_week_for_mutation(db, week_id, athlete_account_id)
    goal = WeekGoal(
        training_week_id=week.id,
        athlete_account_id=week.athlete_account_id,
        week_start_date=week.week_start_date,
        **payload.model_dump(),
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def update_week_goal(
    db: Session,
    goal_id: str,
    payload: WeekGoalUpdate,
    athlete_account_id: str | None = None,
) -> WeekGoal:
    goal = get_week_goal(db, goal_id, athlete_account_id)
    updates = payload.model_dump(exclude_unset=True)
    current = {
        field: getattr(goal, field)
        for field in (
            "metric_key",
            "category",
            "goal_type",
            "label",
            "description",
            "target_value",
            "min_acceptable",
            "max_acceptable",
            "unit",
            "evaluation_mode",
            "priority",
            "status",
            "source",
            "is_editable",
            "is_enabled",
        )
    }
    validated = WeekGoalCreate.model_validate({**current, **updates})
    for field, value in validated.model_dump().items():
        setattr(goal, field, value)
    if updates:
        goal.source = "manual"
    db.commit()
    db.refresh(goal)
    return goal


def delete_week_goal(db: Session, goal_id: str, athlete_account_id: str | None = None) -> None:
    goal = get_week_goal(db, goal_id, athlete_account_id)
    db.delete(goal)
    db.commit()


def get_week_goal(
    db: Session,
    goal_id: str,
    athlete_account_id: str | None = None,
) -> WeekGoal:
    conditions = [WeekGoal.id == goal_id]
    if athlete_account_id is not None:
        conditions.append(WeekGoal.athlete_account_id == athlete_account_id)
    goal = db.scalars(select(WeekGoal).where(*conditions)).first()
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Week goal not found.",
        )
    return goal


def derive_week_goals(
    db: Session,
    week_id: str,
    replace_derived: bool = True,
    athlete_account_id: str | None = None,
) -> TrainingWeek:
    week = get_or_create_week_for_mutation(db, week_id, athlete_account_id)
    if replace_derived:
        replace_workout_derived_goals(db, week)
    else:
        add_workout_derived_goals(db, week)

    db.commit()
    return load_week(db, week.week_start_date, week.athlete_account_id)


def replace_workout_derived_goals(db: Session, week: TrainingWeek) -> None:
    for goal in list(week.goals):
        if goal.source in {"workouts", "default"}:
            week.goals.remove(goal)
            db.delete(goal)
    db.flush()
    add_workout_derived_goals(db, week)


def add_workout_derived_goals(db: Session, week: TrainingWeek) -> None:
    existing_metrics = {
        goal.metric_key or goal.category for goal in week.goals if goal.source in {"manual", "plan"}
    }

    for goal in default_goals_for_week(week):
        identity = goal.get("metric_key") or goal["category"]
        if identity in existing_metrics and goal["goal_type"] == "achievement":
            continue
        db.add(
            WeekGoal(
                training_week_id=week.id,
                athlete_account_id=week.athlete_account_id,
                week_start_date=week.week_start_date,
                **goal,
            )
        )


def list_default_goals(db: Session, athlete_account_id: str) -> list[RecurringGoal]:
    return list(
        db.scalars(
            select(RecurringGoal)
            .where(
                RecurringGoal.athlete_account_id == athlete_account_id,
                RecurringGoal.training_plan_id.is_(None),
            )
            .order_by(RecurringGoal.created_at)
        )
    )


def replace_default_goals(
    db: Session,
    athlete_account_id: str,
    specs: list[RecurringGoalSpec],
) -> list[RecurringGoal]:
    for goal in list_default_goals(db, athlete_account_id):
        db.delete(goal)
    db.flush()
    for spec in specs:
        data = spec.model_dump()
        data.pop("id", None)
        db.add(RecurringGoal(athlete_account_id=athlete_account_id, **data))
    db.commit()
    return list_default_goals(db, athlete_account_id)


def seed_default_goals(db: Session, athlete_account_id: str) -> None:
    for spec in DEFAULT_ATHLETE_GOALS:
        db.add(RecurringGoal(athlete_account_id=athlete_account_id, **spec))


def serialize_recurring_goal(goal: RecurringGoal) -> dict:
    read_fields = normalized_goal_read_fields(goal)
    return {
        "id": goal.id,
        "athlete_account_id": goal.athlete_account_id,
        "training_plan_id": goal.training_plan_id,
        **read_fields,
        "goal_type": goal.goal_type,
        "label": goal.label,
        "description": goal.description,
        "priority": goal.priority,
        "notes": goal.notes,
        "created_at": goal.created_at.isoformat() if goal.created_at else "",
        "updated_at": goal.updated_at.isoformat() if goal.updated_at else "",
    }


def sync_plan_sourced_goals(week: TrainingWeek, recurring_goals: list[dict]) -> None:
    """Materialize a plan's recurring goals onto a week as plan-sourced WeekGoals.

    Manually created goals win: a recurring achievement goal is skipped when the
    week already has a manual goal of the same category. Workout-derived goals
    in a colliding category are replaced.
    """
    protected_metrics = {
        goal.metric_key or goal.category for goal in week.goals if goal.source == "manual"
    }
    incoming_metrics = {spec.get("metric_key") or spec["category"] for spec in recurring_goals}
    clear_plan_sourced_goals(week)
    for goal in list(week.goals):
        if (
            goal.source in {"workouts", "default"}
            and (goal.metric_key or goal.category) in incoming_metrics
        ):
            week.goals.remove(goal)
    for spec in recurring_goals:
        identity = spec.get("metric_key") or spec["category"]
        if identity in protected_metrics and spec["goal_type"] == "achievement":
            continue
        week.goals.append(
            WeekGoal(
                athlete_account_id=week.athlete_account_id,
                week_start_date=week.week_start_date,
                metric_key=spec.get("metric_key"),
                category=spec["category"],
                goal_type=spec["goal_type"],
                label=spec["label"],
                description=spec["description"],
                target_value=spec["target_value"],
                min_acceptable=spec["min_acceptable"],
                max_acceptable=spec["max_acceptable"],
                unit=spec["unit"],
                evaluation_mode=spec["evaluation_mode"],
                priority=spec["priority"],
                status="not_started",
                source="plan",
                is_editable=1,
                is_enabled=1,
            )
        )


def clear_plan_sourced_goals(week: TrainingWeek) -> None:
    for goal in list(week.goals):
        if goal.source == "plan":
            week.goals.remove(goal)


def get_week_by_id(
    db: Session,
    week_id: str,
    athlete_account_id: str | None = None,
) -> TrainingWeek:
    conditions = [TrainingWeek.id == week_id]
    if athlete_account_id is not None:
        conditions.append(TrainingWeek.athlete_account_id == athlete_account_id)
    week = db.scalars(
        select(TrainingWeek)
        .where(*conditions)
        .options(selectinload(TrainingWeek.workouts).selectinload(PlannedWorkout.steps))
        .options(selectinload(TrainingWeek.goals))
    ).first()
    if not week:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training week not found.",
        )
    return week


def get_or_create_week_for_mutation(
    db: Session,
    week_id: str,
    athlete_account_id: str | None = None,
) -> TrainingWeek:
    virtual_week_start = week_start_from_virtual_id(week_id, athlete_account_id)
    if virtual_week_start is not None:
        return get_or_create_week(db, virtual_week_start, athlete_account_id)
    return get_week_by_id(db, week_id, athlete_account_id)


def recalculate_week(
    db: Session,
    week: TrainingWeek,
    *,
    refresh_existing_workout_goals: bool = False,
) -> TrainingWeek:
    totals = week_totals(list(week.workouts), activities_for_week(db, week))
    week.planned_mileage = totals["planned_mileage"]
    week.planned_time = totals["planned_time"]
    week.actual_mileage = totals["actual_mileage"]
    week.actual_time = totals["actual_time"]
    if refresh_existing_workout_goals and has_workout_derived_goals(week):
        replace_workout_derived_goals(db, week)
    db.add(week)
    db.commit()
    db.refresh(week)
    return week


def has_workout_derived_goals(week: TrainingWeek) -> bool:
    return any(goal.source in {"workouts", "default"} for goal in week.goals)


def create_workout(
    db: Session,
    payload: PlannedWorkoutCreate,
    athlete_account_id: str | None = None,
) -> PlannedWorkout:
    athlete = ensure_default_athlete(db) if athlete_account_id is None else None
    active_athlete_id = athlete_account_id or athlete.id
    week = get_or_create_week(db, week_start_for(payload.planned_date), active_athlete_id)
    workout = PlannedWorkout(
        athlete_account_id=active_athlete_id,
        training_week_id=week.id,
        **payload.model_dump(),
    )
    db.add(workout)
    db.commit()
    db.refresh(workout)
    recalculate_week(db, week, refresh_existing_workout_goals=True)
    return get_workout(db, workout.id, active_athlete_id)


def list_workouts(db: Session, athlete_account_id: str | None = None) -> list[PlannedWorkout]:
    athlete = ensure_default_athlete(db) if athlete_account_id is None else None
    active_athlete_id = athlete_account_id or athlete.id
    return list(
        db.scalars(
            select(PlannedWorkout)
            .where(PlannedWorkout.athlete_account_id == active_athlete_id)
            .options(selectinload(PlannedWorkout.steps))
            .order_by(PlannedWorkout.planned_date, PlannedWorkout.created_at)
        )
    )


def get_workout(
    db: Session,
    workout_id: str,
    athlete_account_id: str | None = None,
) -> PlannedWorkout:
    conditions = [PlannedWorkout.id == workout_id]
    if athlete_account_id is not None:
        conditions.append(PlannedWorkout.athlete_account_id == athlete_account_id)
    workout = db.scalars(
        select(PlannedWorkout).where(*conditions).options(selectinload(PlannedWorkout.steps))
    ).first()
    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Planned workout not found.",
        )
    return workout


def update_workout(
    db: Session,
    workout_id: str,
    payload: PlannedWorkoutUpdate,
    athlete_account_id: str | None = None,
) -> PlannedWorkout:
    workout = get_workout(db, workout_id, athlete_account_id)
    original_week_id = workout.training_week_id
    updates = payload.model_dump(exclude_unset=True)

    for field, value in updates.items():
        setattr(workout, field, value)

    if payload.planned_date is not None:
        new_week = get_or_create_week(
            db,
            week_start_for(payload.planned_date),
            workout.athlete_account_id,
        )
        workout.training_week_id = new_week.id

    db.commit()
    db.refresh(workout)
    recalculate_impacted_weeks(
        db,
        {original_week_id, workout.training_week_id},
        workout.athlete_account_id,
    )
    return get_workout(db, workout.id, workout.athlete_account_id)


def move_workout(
    db: Session,
    workout_id: str,
    planned_date: date,
    athlete_account_id: str | None = None,
) -> PlannedWorkout:
    return update_workout(
        db,
        workout_id,
        PlannedWorkoutUpdate(planned_date=planned_date, status="moved"),
        athlete_account_id,
    )


def duplicate_workout(
    db: Session,
    workout_id: str,
    athlete_account_id: str | None = None,
) -> PlannedWorkout:
    source = get_workout(db, workout_id, athlete_account_id)
    clone = clone_workout(
        source,
        source.training_week_id,
        source.planned_date,
        title=f"{source.title} copy",
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    recalculate_week(
        db,
        get_week_by_id(db, source.training_week_id, source.athlete_account_id),
        refresh_existing_workout_goals=True,
    )
    return get_workout(db, clone.id, source.athlete_account_id)


def copy_prior_week(
    db: Session,
    week_id: str,
    athlete_account_id: str | None = None,
) -> TrainingWeek:
    target = get_or_create_week_for_mutation(db, week_id, athlete_account_id)
    source_start = target.week_start_date - timedelta(days=7)
    source = get_or_create_week(db, source_start, target.athlete_account_id)

    if not source.workouts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prior week has no planned workouts to copy.",
        )

    if not target.purpose:
        target.purpose = source.purpose
        target.purpose_source = "manual"
        target.is_down_week = source.is_down_week
    if target.target_mileage is None and source.target_mileage is not None:
        target.target_mileage = source.target_mileage
        target.target_mileage_source = "manual"
    if target.target_long_run_distance is None:
        target.target_long_run_distance = source.target_long_run_distance
        if source.target_long_run_distance is not None:
            target.target_long_run_source = "manual"
    if not target.notes:
        target.notes = source.notes

    for source_workout in source.workouts:
        day_offset = (source_workout.planned_date - source.week_start_date).days
        db.add(
            clone_workout(
                source_workout,
                target.id,
                target.week_start_date + timedelta(days=day_offset),
            )
        )

    if not target.goals:
        for source_goal in source.goals:
            db.add(clone_week_goal(source_goal, target))

    db.add(target)
    db.commit()
    return load_week(db, target.week_start_date, target.athlete_account_id)


def save_week_plan(
    db: Session,
    week_id: str,
    payload: PlanWeekSave,
    athlete_account_id: str | None = None,
) -> TrainingWeek:
    week = get_or_create_week_for_mutation(db, week_id, athlete_account_id)
    if get_week_state(week) == "past":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Past weeks are read-only. Complete a review instead.",
        )
    normalized_purpose = normalize_week_purpose(payload.purpose)
    week.purpose = normalized_purpose
    week.purpose_source = "manual"
    week.is_down_week = int(normalized_purpose == "down_week")
    if normalized_purpose == "custom":
        week.notes = payload.custom_purpose.strip()
    week.target_long_run_distance = payload.target_long_run_distance
    week.target_long_run_source = "manual"

    week.workouts.clear()
    week.goals.clear()
    db.flush()

    for workout_payload in payload.workouts:
        db.add(
            PlannedWorkout(
                athlete_account_id=week.athlete_account_id,
                training_week_id=week.id,
                **workout_payload.model_dump(),
            )
        )

    for goal_payload in payload.goals:
        db.add(
            WeekGoal(
                training_week_id=week.id,
                athlete_account_id=week.athlete_account_id,
                week_start_date=week.week_start_date,
                **goal_payload.model_dump(),
            )
        )

    db.add(week)
    db.commit()
    return load_week(db, week.week_start_date, week.athlete_account_id)


def complete_week_review(
    db: Session,
    week_id: str,
    athlete_account_id: str | None = None,
) -> TrainingWeek:
    """Persist a past-week review without modifying its plan or outcomes."""
    week = get_or_create_week_for_mutation(db, week_id, athlete_account_id)
    if get_week_state(week) != "past":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only completed weeks can be reviewed.",
        )

    reviewed_at = datetime.now(timezone.utc)
    week.reviewed_at = reviewed_at
    actual_activities = activities_for_week(db, week)
    metric_values = weekly_metrics.calculate_weekly_metrics(
        list(week.workouts),
        actual_activities,
        today=today_for_timezone(week.athlete.timezone if week.athlete else None),
    )
    existing = {
        (snapshot.metric_key, snapshot.basis): snapshot
        for snapshot in db.scalars(
            select(WeeklyMetricSnapshot).where(WeeklyMetricSnapshot.training_week_id == week.id)
        )
    }
    for metric_key, measurement in metric_values.items():
        snapshot = existing.get((metric_key, "actual"))
        if snapshot is None:
            snapshot = WeeklyMetricSnapshot(
                athlete_account_id=week.athlete_account_id,
                training_week_id=week.id,
                week_start_date=week.week_start_date,
                metric_key=metric_key,
                basis="actual",
                value=measurement.actual,
                calculator_version=weekly_metrics.CALCULATOR_VERSION,
                calculated_at=reviewed_at,
            )
            db.add(snapshot)
        else:
            snapshot.value = measurement.actual
            snapshot.calculator_version = weekly_metrics.CALCULATOR_VERSION
            snapshot.calculated_at = reviewed_at
    db.commit()
    return load_week(db, week.week_start_date, week.athlete_account_id)


def clone_workout(
    source: PlannedWorkout,
    training_week_id: str,
    planned_date: date,
    title: str | None = None,
) -> PlannedWorkout:
    clone = PlannedWorkout(
        training_week_id=training_week_id,
        athlete_account_id=source.athlete_account_id,
        planned_date=planned_date,
        title=title or source.title,
        sport=source.sport,
        workout_type=source.workout_type,
        intensity_category=source.intensity_category,
        planned_distance=source.planned_distance,
        planned_duration=source.planned_duration,
        planned_pace=source.planned_pace,
        planned_elevation=source.planned_elevation,
        planned_tss=source.planned_tss,
        purpose=source.purpose,
        instructions=source.instructions,
        notes=source.notes,
        status="planned",
    )
    clone.steps = [
        PlannedWorkoutStep(
            step_order=step.step_order,
            label=step.label,
            duration=step.duration,
            distance=step.distance,
            target_pace_min=step.target_pace_min,
            target_pace_max=step.target_pace_max,
            target_hr_min=step.target_hr_min,
            target_hr_max=step.target_hr_max,
            target_rpe=step.target_rpe,
            repetition_group=step.repetition_group,
            notes=step.notes,
        )
        for step in source.steps
    ]
    return clone


def clone_week_goal(source: WeekGoal, target: TrainingWeek) -> WeekGoal:
    return WeekGoal(
        training_week_id=target.id,
        athlete_account_id=target.athlete_account_id,
        week_start_date=target.week_start_date,
        metric_key=source.metric_key,
        category=source.category,
        goal_type=source.goal_type,
        label=source.label,
        description=source.description,
        target_value=source.target_value,
        min_acceptable=source.min_acceptable,
        max_acceptable=source.max_acceptable,
        unit=source.unit,
        evaluation_mode=source.evaluation_mode,
        priority=source.priority,
        status="not_started" if source.status != "waived" else "waived",
        source="template" if source.source == "manual" else source.source,
        is_editable=source.is_editable,
        is_enabled=source.is_enabled,
    )


def delete_workout(db: Session, workout_id: str, athlete_account_id: str | None = None) -> None:
    workout = get_workout(db, workout_id, athlete_account_id)
    week_id = workout.training_week_id
    active_athlete_id = workout.athlete_account_id
    db.delete(workout)
    db.commit()
    recalculate_week(
        db,
        get_week_by_id(db, week_id, active_athlete_id),
        refresh_existing_workout_goals=True,
    )


def recalculate_impacted_weeks(
    db: Session,
    week_ids: set[str],
    athlete_account_id: str | None = None,
) -> None:
    for week_id in week_ids:
        recalculate_week(
            db,
            get_week_by_id(db, week_id, athlete_account_id),
            refresh_existing_workout_goals=True,
        )


def activities_for_week(db: Session, week: TrainingWeek) -> list[StravaActivity]:
    return activities_for_date_range(
        db,
        week.athlete_account_id,
        week.week_start_date,
        week.week_end_date,
    )


def activities_for_date_range(
    db: Session,
    athlete_account_id: str,
    start_date: date,
    end_date: date,
) -> list[StravaActivity]:
    start = datetime.combine(start_date, time.min)
    end = datetime.combine(end_date + timedelta(days=1), time.min)
    return list(
        db.scalars(
            select(StravaActivity)
            .where(
                StravaActivity.athlete_account_id == athlete_account_id,
                StravaActivity.deleted_at.is_(None),
                StravaActivity.start_date_local >= start,
                StravaActivity.start_date_local < end,
            )
            .order_by(StravaActivity.start_date_local)
        )
    )


def serialize_activity(activity: StravaActivity) -> dict:
    activity_date = activity.start_date_local.date()
    return {
        "id": activity.id,
        "strava_activity_id": activity.strava_activity_id,
        "name": activity.name,
        "sport_type": activity.sport_type,
        "start_date_local": activity.start_date_local.isoformat(),
        "activity_date": activity_date,
        "distance": activity.distance,
        "distance_miles": round(activity.distance / 1609.344, 2),
        "moving_time": activity.moving_time,
        "average_heartrate": activity.average_heartrate,
    }


def serialize_week(
    week: TrainingWeek,
    db: Session,
    default_goals: list[RecurringGoal] | None = None,
) -> dict:
    if default_goals is None:
        default_goals = list_default_goals(db, week.athlete_account_id)
    workouts = list(week.workouts)
    actual_activities = activities_for_week(db, week)
    totals = week_totals(workouts, actual_activities)
    hard_days = {
        workout.planned_date
        for workout in workouts
        if workout.intensity_category in {"workout", "race"}
    }
    planned_mileage = totals["planned_mileage"]
    run_workouts = [workout for workout in workouts if workout.sport == "run"]
    long_run_distance = max(
        (workout.planned_distance or 0 for workout in run_workouts),
        default=0,
    )
    long_run_percentage = (
        round((long_run_distance / planned_mileage) * 100, 1) if planned_mileage else 0
    )

    week_state = get_week_state(week)
    goals = enabled_goals_for_week(week, default_goals)
    current_day = today_for_timezone(week.athlete.timezone if week.athlete else None)
    metric_values = weekly_metrics.calculate_weekly_metrics(
        workouts,
        actual_activities,
        today=current_day,
    )
    goal_evaluations = [
        evaluate_goal(
            goal,
            week,
            workouts,
            actual_activities,
            week_state,
            metric_values=metric_values,
        )
        for goal in goals
    ]
    return {
        "id": week.id,
        "week_start_date": week.week_start_date,
        "week_end_date": week.week_end_date,
        "planned_mileage": totals["planned_mileage"],
        "actual_mileage": totals["actual_mileage"],
        "planned_time": totals["planned_time"],
        "actual_time": totals["actual_time"],
        "mesocycle_id": week.mesocycle_id,
        "purpose": week.purpose,
        "purpose_source": week.purpose_source,
        "target_mileage": week.target_mileage,
        "target_mileage_source": week.target_mileage_source,
        "target_long_run_distance": week.target_long_run_distance,
        "target_long_run_source": week.target_long_run_source,
        "is_down_week": bool(week.is_down_week),
        "notes": week.notes,
        "reviewed_at": week.reviewed_at.isoformat() if week.reviewed_at else None,
        "workouts": workouts,
        "actual_activities": [serialize_activity(activity) for activity in actual_activities],
        "goals": [serialize_goal(goal) for goal in goals],
        "goal_evaluations": goal_evaluations,
        "week_state": week_state,
        "goal_review_summary": summarize_goal_evaluations(goal_evaluations, week_state),
        "hard_days": len(hard_days),
        "long_run_distance": long_run_distance,
        "long_run_percentage": long_run_percentage,
    }


def serialize_virtual_week(db: Session, week_start: date, athlete_account_id: str) -> dict:
    week_end = week_end_for(week_start)
    actual_activities = activities_for_date_range(db, athlete_account_id, week_start, week_end)
    totals = week_totals([], actual_activities)
    athlete = db.get(AthleteAccount, athlete_account_id)
    return {
        "id": virtual_week_id(athlete_account_id, week_start),
        "week_start_date": week_start,
        "week_end_date": week_end,
        "planned_mileage": 0,
        "actual_mileage": totals["actual_mileage"],
        "planned_time": None,
        "actual_time": totals["actual_time"],
        "mesocycle_id": None,
        "purpose": "",
        "purpose_source": "manual",
        "target_mileage": None,
        "target_mileage_source": "manual",
        "target_long_run_distance": None,
        "target_long_run_source": "manual",
        "is_down_week": False,
        "notes": "",
        "reviewed_at": None,
        "workouts": [],
        "actual_activities": [serialize_activity(activity) for activity in actual_activities],
        "goals": [],
        "goal_evaluations": [],
        "week_state": get_week_state_from_dates(
            week_start,
            week_end,
            timezone_name=athlete.timezone if athlete else None,
        ),
        "goal_review_summary": "No weekly goals set yet.",
        "hard_days": 0,
        "long_run_distance": 0,
        "long_run_percentage": 0,
    }


def week_totals(workouts: list[PlannedWorkout], activities: list[StravaActivity]) -> dict:
    planned_mileage = sum(
        workout.planned_distance or 0 for workout in workouts if workout.sport == "run"
    )
    planned_time = sum(workout.planned_duration or 0 for workout in workouts)
    actual_mileage = sum(activity.distance / 1609.344 for activity in activities)
    actual_time = sum(activity.moving_time or 0 for activity in activities)
    return {
        "planned_mileage": round(planned_mileage, 2),
        "planned_time": planned_time or None,
        "actual_mileage": round(actual_mileage, 2),
        "actual_time": actual_time or None,
    }


def enabled_goals_for_week(
    week: TrainingWeek,
    default_goals: list[RecurringGoal] | None = None,
) -> list[WeekGoal]:
    """Stored goals plus a virtual overlay of the athlete's default goals.

    Defaults are never persisted per week: they are evaluated live so that a
    Settings edit applies everywhere at once. A default is hidden when any
    stored goal already covers its category and goal type.
    """
    goals = [goal for goal in week.goals if goal.is_enabled]
    if not goals and not week.workouts:
        return []

    def virtual_goal(index: int, spec: dict) -> WeekGoal:
        return WeekGoal(
            id=virtual_goal_id(week.id, index),
            training_week_id=week.id,
            athlete_account_id=week.athlete_account_id,
            week_start_date=week.week_start_date,
            **spec,
        )

    next_index = 1
    if not goals:
        derived = default_goals_for_week(week)
        goals = [virtual_goal(index, spec) for index, spec in enumerate(derived, start=1)]
        next_index = len(derived) + 1

    covered = {(goal.metric_key or goal.category, goal.goal_type) for goal in goals}
    for default in default_goals or []:
        identity = default.metric_key or default.category
        if (identity, default.goal_type) in covered:
            continue
        goals.append(
            virtual_goal(
                next_index,
                {
                    "metric_key": default.metric_key,
                    "category": default.category,
                    "goal_type": default.goal_type,
                    "label": default.label,
                    "description": default.description,
                    "target_value": default.target_value,
                    "min_acceptable": default.min_acceptable,
                    "max_acceptable": default.max_acceptable,
                    "unit": default.unit,
                    "evaluation_mode": default.evaluation_mode,
                    "priority": default.priority,
                    "status": "not_started",
                    "source": "default",
                    "is_editable": False,
                    "is_enabled": True,
                },
            )
        )
        next_index += 1
    return goals


def serialize_goal(goal: WeekGoal) -> dict:
    read_fields = normalized_goal_read_fields(goal)
    return {
        "id": goal.id,
        "training_week_id": goal.training_week_id,
        "athlete_account_id": goal.athlete_account_id,
        "week_start_date": goal.week_start_date,
        **read_fields,
        "goal_type": goal.goal_type,
        "label": goal.label,
        "description": goal.description,
        "priority": goal.priority,
        "status": goal.status,
        "source": goal.source,
        "is_editable": bool(goal.is_editable),
        "is_enabled": bool(goal.is_enabled),
        "created_at": goal.created_at.isoformat() if goal.created_at else "",
        "updated_at": goal.updated_at.isoformat() if goal.updated_at else "",
    }


def normalized_goal_read_fields(goal: WeekGoal | RecurringGoal) -> dict:
    """Return a response-safe representation for current and legacy goal rows."""
    metric_key = goal.metric_key or infer_goal_metric(goal.category, goal.unit)
    if metric_key in GOAL_METRICS:
        definition = GOAL_METRICS[metric_key]
        try:
            target, minimum, maximum = normalized_goal_thresholds(
                metric_key,
                goal.evaluation_mode,
                target_value=goal.target_value,
                min_acceptable=goal.min_acceptable,
                max_acceptable=goal.max_acceptable,
            )
        except ValueError:
            pass
        else:
            return {
                "metric_key": metric_key,
                "category": definition.category,
                "target_value": target,
                "min_acceptable": minimum,
                "max_acceptable": maximum,
                "unit": definition.unit,
                "evaluation_mode": goal.evaluation_mode,
            }

    # Pre-catalog goals can contain combinations that the current editor no
    # longer supports. Keep them readable and editable instead of failing the
    # entire week response during FastAPI response validation.
    return {
        "metric_key": None,
        "category": "custom",
        "target_value": goal.target_value,
        "min_acceptable": goal.min_acceptable,
        "max_acceptable": goal.max_acceptable,
        "unit": "custom",
        "evaluation_mode": "manual",
    }


def default_goals_for_week(week: TrainingWeek) -> list[dict]:
    workouts = list(week.workouts)
    run_workouts = [workout for workout in workouts if workout.sport == "run"]
    planned_mileage = round(sum(workout.planned_distance or 0 for workout in run_workouts), 1)
    if planned_mileage <= 0 and week.target_mileage:
        planned_mileage = round(week.target_mileage, 1)
    planned_sessions = len([workout for workout in workouts if workout.sport != "rest"])
    hard_dates = {
        workout.planned_date
        for workout in workouts
        if weekly_metrics.is_quality_workout(workout)
    }
    strength_sessions = len(
        [
            workout
            for workout in workouts
            if workout.sport == "strength" or workout.workout_type == "strength"
        ]
    )
    mobility_sessions = len(
        [
            workout
            for workout in workouts
            if workout.sport == "mobility" or workout.workout_type == "mobility"
        ]
    )
    longest_run = max((workout.planned_distance or 0 for workout in run_workouts), default=0)
    long_run_target = week.target_long_run_distance or longest_run

    goals: list[dict] = []
    if planned_mileage > 0:
        goals.append(
            new_default_goal(
                "mileage",
                "achievement",
                f"Run {format_goal_number(planned_mileage)} miles",
                target_value=planned_mileage,
                min_acceptable=round(planned_mileage * 0.94, 1),
                max_acceptable=round(planned_mileage * 1.06, 1),
                unit="mi",
                evaluation_mode="range",
                priority="primary",
            )
        )

    if planned_sessions > 0:
        goals.append(
            new_default_goal(
                "sessions",
                "achievement",
                f"Complete {planned_sessions} sessions",
                target_value=planned_sessions,
                min_acceptable=planned_sessions,
                unit="sessions",
                evaluation_mode="at_least",
                priority="secondary",
            )
        )

    if long_run_target > 0:
        goals.append(
            new_default_goal(
                "long_run",
                "achievement",
                f"Long run near {format_goal_number(long_run_target)} miles",
                target_value=round(long_run_target, 1),
                min_acceptable=max(round(long_run_target - 1, 1), 0),
                max_acceptable=round(long_run_target + 1, 1),
                unit="mi",
                evaluation_mode="range",
                priority="primary",
            )
        )

    if hard_dates:
        goals.append(
            new_default_goal(
                "quality",
                "achievement",
                f"Complete {len(hard_dates)} quality session{'s' if len(hard_dates) != 1 else ''}",
                target_value=len(hard_dates),
                min_acceptable=len(hard_dates),
                max_acceptable=2,
                unit="sessions",
                evaluation_mode="at_least",
                priority="primary",
            )
        )

    if strength_sessions:
        strength_label = (
            f"Complete {strength_sessions} strength session{'s' if strength_sessions != 1 else ''}"
        )
        goals.append(
            new_default_goal(
                "strength",
                "achievement",
                strength_label,
                target_value=strength_sessions,
                min_acceptable=strength_sessions,
                unit="sessions",
                evaluation_mode="at_least",
                priority="secondary",
            )
        )

    if mobility_sessions:
        mobility_label = (
            f"Complete {mobility_sessions} mobility session{'s' if mobility_sessions != 1 else ''}"
        )
        goals.append(
            new_default_goal(
                "strength",
                "achievement",
                mobility_label,
                target_value=mobility_sessions,
                min_acceptable=mobility_sessions,
                unit="sessions",
                evaluation_mode="at_least",
                priority="secondary",
            )
        )

    return goals


def normalize_week_purpose(value: str) -> str:
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    normalized = normalized.replace("__", "_")
    if normalized not in WEEK_PURPOSE_IDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unknown week purpose.",
        )
    return normalized


def new_default_goal(
    category: str,
    goal_type: str,
    label: str,
    *,
    target_value: float | None = None,
    min_acceptable: float | None = None,
    max_acceptable: float | None = None,
    unit: str,
    evaluation_mode: str,
    priority: str,
) -> dict:
    metric_key = infer_goal_metric(category, unit)
    definition = GOAL_METRICS.get(metric_key) if metric_key else None
    return {
        "metric_key": metric_key,
        "category": definition.category if definition else category,
        "goal_type": goal_type,
        "label": label,
        "description": "",
        "target_value": target_value,
        "min_acceptable": min_acceptable,
        "max_acceptable": max_acceptable,
        "unit": definition.unit if definition else unit,
        "evaluation_mode": evaluation_mode,
        "priority": priority,
        "status": "not_started",
        "source": "workouts",
        "is_editable": True,
        "is_enabled": True,
    }


def get_week_state(week: TrainingWeek) -> str:
    return get_week_state_from_dates(
        week.week_start_date,
        week.week_end_date,
        timezone_name=week.athlete.timezone if week.athlete else None,
    )


def get_week_state_from_dates(
    week_start: date,
    week_end: date,
    *,
    timezone_name: str | None = None,
    today: date | None = None,
) -> str:
    current_day = today or today_for_timezone(timezone_name)
    if current_day < week_start:
        return "future"
    if current_day > week_end:
        return "past"
    return "current"


def evaluate_goal(
    goal: WeekGoal,
    week: TrainingWeek,
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    week_state: str,
    *,
    metric_values: dict | None = None,
) -> dict:
    if goal.status == "waived":
        return goal_evaluation(
            goal, "waived", "Waived", "This goal was intentionally waived.", severity="info"
        )

    metric_key = goal.metric_key or infer_goal_metric(goal.category, goal.unit)
    if metric_key:
        current_day = today_for_timezone(week.athlete.timezone if week.athlete else None)
        measurements = metric_values or weekly_metrics.calculate_weekly_metrics(
            workouts,
            activities,
            today=current_day,
        )
        return evaluate_metric_goal(goal, measurements[metric_key], week_state)

    return goal_evaluation(
        goal,
        goal.status,
        goal.label,
        goal.description or "Manual goal status.",
        severity=status_severity(goal.status),
    )


def evaluate_metric_goal(
    goal: WeekGoal,
    metric: weekly_metrics.WeeklyMetricMeasurement,
    week_state: str,
) -> dict:
    value = metric.value_for(week_state)
    status_value = evaluate_metric_status(value, goal, week_state)
    basis = (
        "actual" if week_state == "past" else "planned" if week_state == "future" else "projected"
    )
    summary = metric_goal_summary(goal, metric, value, basis)
    detail = (
        f"{format_goal_number(metric.actual)} actual, {format_goal_number(metric.planned)} planned."
    )
    guardrail_value = None
    if goal.goal_type == "guardrail":
        guardrail_value = (
            "ok"
            if status_value in {"achieved", "on_track"}
            else "warning"
            if status_value in {"at_risk", "partially_achieved"}
            else "danger"
        )
    return goal_evaluation(
        goal,
        status_value,
        summary,
        detail,
        actual_value=metric.actual,
        planned_value=metric.planned,
        remaining_planned_value=metric.remaining,
        severity=status_severity(status_value),
        guardrail_status=guardrail_value,
        contributing_workout_ids=list(metric.contributing_workout_ids),
        contributing_activity_ids=list(metric.contributing_activity_ids),
        metric_key=metric.metric_key,
        measured_value=value,
        basis=basis,
    )


def evaluate_metric_status(value: float, goal: WeekGoal, week_state: str) -> str:
    mode = goal.evaluation_mode
    passed = True
    exceeded = False
    if mode == "at_least":
        passed = goal.min_acceptable is not None and value >= goal.min_acceptable
    elif mode == "at_most":
        passed = goal.max_acceptable is not None and value <= goal.max_acceptable
        exceeded = not passed
    elif mode == "range":
        passed = (
            goal.min_acceptable is not None
            and goal.max_acceptable is not None
            and goal.min_acceptable <= value <= goal.max_acceptable
        )
        exceeded = goal.max_acceptable is not None and value > goal.max_acceptable
    elif mode == "exact-ish":
        passed = goal.target_value is not None and value == goal.target_value
        exceeded = goal.target_value is not None and value > goal.target_value

    if passed:
        return "achieved" if week_state == "past" else "on_track"
    if week_state != "past":
        return "at_risk"
    if exceeded:
        return "exceeded"
    return "partially_achieved" if value > 0 else "missed"


def metric_goal_summary(
    goal: WeekGoal,
    metric: weekly_metrics.WeeklyMetricMeasurement,
    value: float,
    basis: str,
) -> str:
    value_text = format_goal_number(value)
    if metric.metric_key == "weekly_run_distance":
        return f"{value_text} {basis} miles against {format_goal_range(goal)}"
    if metric.metric_key == "longest_run_distance":
        return f"Longest run {value_text} mi against {format_goal_range(goal)}"
    if metric.metric_key == "long_run_share":
        return f"Long run is {value_text}% of the week against {format_goal_target(goal)}"
    definition = GOAL_METRICS[metric.metric_key]
    return f"{definition.label}: {value_text} against {format_goal_target(goal)}"


def evaluate_mileage_goal(
    goal: WeekGoal,
    week: TrainingWeek,
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    week_state: str,
    today: date,
) -> dict:
    remaining = remaining_planned_mileage(workouts, activities, today)
    actual = round(
        sum(activity.distance / 1609.344 for activity in activities if is_run_activity(activity)), 1
    )
    planned = round(
        sum(workout.planned_distance or 0 for workout in workouts if workout.sport == "run"), 1
    )
    value = (
        actual
        if week_state == "past"
        else planned
        if week_state == "future"
        else round(actual + remaining, 1)
    )
    status_value = evaluate_numeric(value, goal, week_state)
    verb = (
        "actual" if week_state == "past" else "planned" if week_state == "future" else "projected"
    )
    summary = f"{format_goal_number(value)} {verb} miles against {format_goal_range(goal)}"
    return goal_evaluation(
        goal,
        status_value,
        summary,
        f"{format_goal_number(actual)} completed, {format_goal_number(remaining)} planned ahead.",
        actual_value=actual,
        planned_value=planned,
        remaining_planned_value=remaining,
        severity=status_severity(status_value),
        contributing_workout_ids=[workout.id for workout in workouts if workout.sport == "run"],
        contributing_activity_ids=[
            activity.id for activity in activities if is_run_activity(activity)
        ],
    )


def evaluate_sessions_goal(
    goal: WeekGoal,
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    week_state: str,
    today: date,
) -> dict:
    actual = count_training_activities(activities)
    planned = len([workout for workout in workouts if workout.sport != "rest"])
    remaining = len(
        [
            workout
            for workout in workouts
            if workout.sport != "rest" and workout.planned_date >= today
        ]
    )
    value = (
        actual
        if week_state == "past"
        else planned
        if week_state == "future"
        else actual + remaining
    )
    status_value = evaluate_numeric(value, goal, week_state)
    return goal_evaluation(
        goal,
        status_value,
        f"{format_goal_number(value)} sessions against {format_goal_target(goal)}",
        f"{actual} completed and {remaining} still planned.",
        actual_value=actual,
        planned_value=planned,
        remaining_planned_value=remaining,
        severity=status_severity(status_value),
        contributing_workout_ids=[workout.id for workout in workouts if workout.sport != "rest"],
        contributing_activity_ids=[
            activity.id for activity in activities if is_training_activity(activity)
        ],
    )


def evaluate_long_run_goal(
    goal: WeekGoal,
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    week_state: str,
    today: date,
) -> dict:
    actual_runs = [activity for activity in activities if is_run_activity(activity)]
    planned_runs = [workout for workout in workouts if workout.sport == "run"]
    actual = round(max((activity.distance / 1609.344 for activity in actual_runs), default=0), 1)
    planned = round(max((workout.planned_distance or 0 for workout in planned_runs), default=0), 1)
    remaining = round(
        max(
            (
                workout.planned_distance or 0
                for workout in planned_runs
                if workout.planned_date >= today
            ),
            default=0,
        ),
        1,
    )
    value = (
        actual
        if week_state == "past"
        else planned
        if week_state == "future"
        else max(actual, remaining)
    )
    status_value = evaluate_numeric(value, goal, week_state)
    summary = f"Longest run {format_goal_number(value)} mi against {format_goal_range(goal)}"
    return goal_evaluation(
        goal,
        status_value,
        summary,
        f"{format_goal_number(actual)} completed, {format_goal_number(remaining)} upcoming.",
        actual_value=actual,
        planned_value=planned,
        remaining_planned_value=remaining,
        severity=status_severity(status_value),
        contributing_workout_ids=[workout.id for workout in planned_runs],
        contributing_activity_ids=[activity.id for activity in actual_runs],
    )


def evaluate_quality_goal(
    goal: WeekGoal,
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    week_state: str,
    today: date,
) -> dict:
    hard_workouts = [workout for workout in workouts if is_quality_workout(workout)]
    hard_activities = [activity for activity in activities if is_quality_activity(activity)]
    hard_workout_dates = {workout.planned_date for workout in hard_workouts}
    run_activities_on_hard_days = [
        activity
        for activity in activities
        if is_run_activity(activity) and activity.start_date_local.date() in hard_workout_dates
    ]
    completed_quality_activities: list[StravaActivity] = []
    completed_quality_activity_ids: set[str] = set()
    for activity in [*hard_activities, *run_activities_on_hard_days]:
        if activity.id in completed_quality_activity_ids:
            continue
        completed_quality_activity_ids.add(activity.id)
        completed_quality_activities.append(activity)

    completed_quality_dates = {
        activity.start_date_local.date() for activity in completed_quality_activities
    }
    actual = len(completed_quality_dates)
    planned = len(hard_workout_dates)
    remaining = len(
        {
            planned_date
            for planned_date in hard_workout_dates
            if planned_date >= today and planned_date not in completed_quality_dates
        }
    )
    value = (
        actual
        if week_state == "past"
        else planned
        if week_state == "future"
        else actual + remaining
    )
    status_value = evaluate_numeric(value, goal, week_state)
    return goal_evaluation(
        goal,
        status_value,
        f"{format_goal_number(value)} quality days against {format_goal_target(goal)}",
        f"{actual} completed and {remaining} still planned.",
        actual_value=actual,
        planned_value=planned,
        remaining_planned_value=remaining,
        severity=status_severity(status_value),
        contributing_workout_ids=[workout.id for workout in hard_workouts],
        contributing_activity_ids=[activity.id for activity in completed_quality_activities],
    )


def evaluate_recovery_goal(
    goal: WeekGoal,
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    week_state: str,
) -> dict:
    workout_days = {workout.planned_date for workout in workouts if workout.sport != "rest"}
    activity_days = {
        activity.start_date_local.date()
        for activity in activities
        if is_training_activity(activity)
    }
    rest_days = 7 - len(activity_days if week_state == "past" else workout_days)
    status_value = evaluate_numeric(rest_days, goal, week_state)
    back_to_back_hard = has_back_to_back_dates(
        {workout.planned_date for workout in workouts if is_quality_workout(workout)}
    )
    if back_to_back_hard and status_value in {"on_track", "achieved"}:
        status_value = "at_risk" if week_state != "past" else "partially_achieved"
    detail = (
        "Hard days are spaced apart."
        if not back_to_back_hard
        else "Back-to-back hard days need attention."
    )
    return goal_evaluation(
        goal,
        status_value,
        f"{rest_days} rest days against {format_goal_target(goal)}",
        detail,
        actual_value=rest_days,
        planned_value=7 - len(workout_days),
        severity=status_severity(status_value),
    )


def evaluate_strength_goal(
    goal: WeekGoal,
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    week_state: str,
    today: date,
) -> dict:
    strength_workouts = [
        workout
        for workout in workouts
        if workout.sport in {"strength", "mobility"}
        or workout.workout_type in {"strength", "mobility"}
    ]
    strength_activities = [activity for activity in activities if is_strength_activity(activity)]
    actual = len(strength_activities)
    planned = len(strength_workouts)
    remaining = len([workout for workout in strength_workouts if workout.planned_date >= today])
    value = (
        actual
        if week_state == "past"
        else planned
        if week_state == "future"
        else actual + remaining
    )
    status_value = evaluate_numeric(value, goal, week_state)
    summary = (
        f"{format_goal_number(value)} strength or mobility sessions "
        f"against {format_goal_target(goal)}"
    )
    return goal_evaluation(
        goal,
        status_value,
        summary,
        f"{actual} completed and {remaining} still planned.",
        actual_value=actual,
        planned_value=planned,
        remaining_planned_value=remaining,
        severity=status_severity(status_value),
        contributing_workout_ids=[workout.id for workout in strength_workouts],
        contributing_activity_ids=[activity.id for activity in strength_activities],
    )


def evaluate_guardrail(
    goal: WeekGoal,
    week: TrainingWeek,
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    week_state: str,
) -> dict:
    if goal.category == "long_run":
        actual_miles = sum(
            activity.distance / 1609.344 for activity in activities if is_run_activity(activity)
        )
        planned_miles = sum(
            workout.planned_distance or 0 for workout in workouts if workout.sport == "run"
        )
        actual_long = max(
            (activity.distance / 1609.344 for activity in activities if is_run_activity(activity)),
            default=0,
        )
        planned_long = max(
            (workout.planned_distance or 0 for workout in workouts if workout.sport == "run"),
            default=0,
        )
        total = (
            actual_miles
            if week_state == "past"
            else planned_miles
            if week_state == "future"
            else max(planned_miles, actual_miles)
        )
        long_run = (
            actual_long
            if week_state == "past"
            else planned_long
            if week_state == "future"
            else max(actual_long, planned_long)
        )
        value = round((long_run / total) * 100, 1) if total else 0
        status_value = guardrail_goal_status(value, goal.max_acceptable)
        return goal_evaluation(
            goal,
            status_value,
            f"Long run is {format_goal_number(value)}% of the week",
            f"Threshold is {format_goal_number(goal.max_acceptable or 0)}%.",
            actual_value=value,
            planned_value=value,
            severity=status_severity(status_value),
            guardrail_status=guardrail_status(value, goal.max_acceptable),
        )

    if goal.category == "quality":
        hard_days = len(
            {workout.planned_date for workout in workouts if is_quality_workout(workout)}
        )
        value = hard_days
        status_value = guardrail_goal_status(value, goal.max_acceptable)
        return goal_evaluation(
            goal,
            status_value,
            f"{hard_days} hard days planned",
            f"Threshold is {format_goal_number(goal.max_acceptable or 0)}.",
            actual_value=value,
            planned_value=value,
            severity=status_severity(status_value),
            guardrail_status=guardrail_status(value, goal.max_acceptable),
            contributing_workout_ids=[
                workout.id for workout in workouts if is_quality_workout(workout)
            ],
        )

    return goal_evaluation(
        goal, "on_track", "Guardrail looks okay", severity="success", guardrail_status="ok"
    )


def evaluate_numeric(value: float, goal: WeekGoal, week_state: str) -> str:
    minimum = goal.min_acceptable
    maximum = goal.max_acceptable
    if maximum is not None and value > maximum:
        return "exceeded"
    if minimum is not None and value < minimum:
        if week_state == "past":
            return "partially_achieved" if value > 0 else "missed"
        return "at_risk"
    if week_state == "past":
        return "achieved"
    if value <= 0:
        return "not_started"
    return "on_track"


def guardrail_goal_status(value: float, maximum: float | None) -> str:
    if maximum is None:
        return "on_track"
    if value > maximum * 1.1:
        return "exceeded"
    if value > maximum:
        return "at_risk"
    return "on_track"


def guardrail_status(value: float, maximum: float | None) -> str:
    if maximum is None:
        return "not_applicable"
    if value > maximum * 1.1:
        return "danger"
    if value > maximum:
        return "warning"
    return "ok"


def goal_evaluation(
    goal: WeekGoal,
    status_value: str,
    summary: str,
    detail: str | None = None,
    *,
    actual_value: float | None = None,
    planned_value: float | None = None,
    remaining_planned_value: float | None = None,
    severity: str = "info",
    guardrail_status: str | None = None,
    contributing_workout_ids: list[str] | None = None,
    contributing_activity_ids: list[str] | None = None,
    metric_key: str | None = None,
    measured_value: float | None = None,
    basis: str | None = None,
) -> dict:
    return {
        "goal_id": goal.id,
        "week_start_date": goal.week_start_date,
        "metric_key": metric_key,
        "basis": basis,
        "measured_value": measured_value,
        "unit": GOAL_METRICS[metric_key].unit if metric_key in GOAL_METRICS else None,
        "evaluation_mode": goal.evaluation_mode if metric_key else None,
        "threshold_value": goal.target_value,
        "threshold_min": goal.min_acceptable,
        "threshold_max": goal.max_acceptable,
        "status": status_value,
        "guardrail_status": guardrail_status,
        "actual_value": round(actual_value, 1) if isinstance(actual_value, float) else actual_value,
        "planned_value": round(planned_value, 1)
        if isinstance(planned_value, float)
        else planned_value,
        "remaining_planned_value": round(remaining_planned_value, 1)
        if isinstance(remaining_planned_value, float)
        else remaining_planned_value,
        "summary": summary,
        "detail": detail,
        "severity": severity,
        "evaluated_at": datetime.utcnow().isoformat(),
        "contributing_workout_ids": contributing_workout_ids or [],
        "contributing_activity_ids": contributing_activity_ids or [],
    }


def remaining_planned_mileage(
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity] | None = None,
    today: date | None = None,
) -> float:
    current_day = today or date.today()
    completed_run_dates = {
        activity.start_date_local.date()
        for activity in activities or []
        if is_run_activity(activity)
    }
    return round(
        sum(
            workout.planned_distance or 0
            for workout in workouts
            if workout.sport == "run"
            and workout.planned_date >= current_day
            and workout.planned_date not in completed_run_dates
        ),
        1,
    )


def is_run_activity(activity: StravaActivity) -> bool:
    return weekly_metrics.is_run_activity(activity)


def is_training_activity(activity: StravaActivity) -> bool:
    return weekly_metrics.is_training_activity(activity)


def is_strength_activity(activity: StravaActivity) -> bool:
    return weekly_metrics.is_strength_activity(activity)


def is_quality_activity(activity: StravaActivity) -> bool:
    return weekly_metrics.is_quality_activity(activity)


def is_quality_workout(workout: PlannedWorkout) -> bool:
    return weekly_metrics.is_quality_workout(workout)


def normalized_sport(value: str) -> str:
    return weekly_metrics.normalized_sport(value)


def count_training_activities(activities: list[StravaActivity]) -> int:
    return len([activity for activity in activities if is_training_activity(activity)])


def has_back_to_back_dates(values: set[date]) -> bool:
    return weekly_metrics.has_back_to_back_dates(values)


def status_severity(status_value: str) -> str:
    if status_value in {"achieved", "on_track"}:
        return "success"
    if status_value in {"at_risk", "partially_achieved"}:
        return "warning"
    if status_value in {"missed", "exceeded"}:
        return "danger"
    return "info"


def summarize_goal_evaluations(evaluations: list[dict], week_state: str) -> str:
    achievements = [
        evaluation for evaluation in evaluations if evaluation["guardrail_status"] is None
    ]
    guardrail_warnings = [
        evaluation
        for evaluation in evaluations
        if evaluation["guardrail_status"] in {"warning", "danger"}
    ]
    achieved = len(
        [
            evaluation
            for evaluation in achievements
            if evaluation["status"] in {"achieved", "on_track"}
        ]
    )
    missed = len(
        [
            evaluation
            for evaluation in achievements
            if evaluation["status"] in {"missed", "exceeded", "at_risk"}
        ]
    )
    if not achievements:
        return "No weekly goals set yet."
    if week_state == "future":
        return f"{achieved} goals are designed well; {missed} need planning attention."
    if week_state == "current":
        return f"{achieved} goals are on track; {missed} need adjustment."
    warning_tail = (
        f" {len(guardrail_warnings)} guardrail "
        f"warning{'s' if len(guardrail_warnings) != 1 else ''}."
        if guardrail_warnings
        else ""
    )
    return f"{achieved} goals achieved; {missed} missed or exceeded.{warning_tail}"


def format_goal_range(goal: WeekGoal) -> str:
    if goal.min_acceptable is not None and goal.max_acceptable is not None:
        minimum = format_goal_number(goal.min_acceptable)
        maximum = format_goal_number(goal.max_acceptable)
        return f"{minimum}-{maximum} {goal.unit}"
    return format_goal_target(goal)


def format_goal_target(goal: WeekGoal) -> str:
    if goal.target_value is not None:
        return f"{format_goal_number(goal.target_value)} {goal.unit}"
    if goal.min_acceptable is not None:
        return f"at least {format_goal_number(goal.min_acceptable)} {goal.unit}"
    if goal.max_acceptable is not None:
        return f"at most {format_goal_number(goal.max_acceptable)} {goal.unit}"
    return goal.unit


def format_goal_number(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:.1f}"
