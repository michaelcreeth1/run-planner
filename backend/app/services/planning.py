from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.planning import (
    AthleteAccount,
    PlannedWorkout,
    PlannedWorkoutStep,
    TrainingWeek,
    WeekGoal,
)
from app.models.strava import StravaActivity
from app.schemas.planning import (
    PlannedWorkoutCreate,
    PlannedWorkoutUpdate,
    PlanWeekSave,
    TrainingWeekPatch,
    WeekGoalCreate,
    WeekGoalUpdate,
)

RUN_SPORTS = {"run", "trailrun", "virtualrun"}
QUALITY_WORKOUT_TYPES = {
    "tempo",
    "threshold",
    "interval",
    "hill",
    "race",
    "time_trial",
    "progression",
    "strides",
}
QUALITY_KEYWORDS = (
    "tempo",
    "threshold",
    "interval",
    "hill",
    "race",
    "workout",
    "reps",
    "repeat",
    "fartlek",
)


def week_start_for(day: date) -> date:
    return day - timedelta(days=day.weekday())


def week_end_for(week_start: date) -> date:
    return week_start + timedelta(days=6)


def ensure_default_athlete(db: Session) -> AthleteAccount:
    athlete = db.scalars(select(AthleteAccount).limit(1)).first()
    if athlete:
        return athlete

    athlete = AthleteAccount(display_name="Michael Creeth", timezone="America/Denver")
    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    return athlete


def get_or_create_week(db: Session, week_start: date) -> TrainingWeek:
    athlete = ensure_default_athlete(db)
    week = db.scalars(
        select(TrainingWeek)
        .where(
            TrainingWeek.athlete_account_id == athlete.id,
            TrainingWeek.week_start_date == week_start,
        )
        .options(selectinload(TrainingWeek.workouts).selectinload(PlannedWorkout.steps))
        .options(selectinload(TrainingWeek.goals))
    ).first()
    if week:
        recalculate_week(db, week)
        return week

    week = TrainingWeek(
        athlete_account_id=athlete.id,
        week_start_date=week_start,
        week_end_date=week_end_for(week_start),
    )
    db.add(week)
    db.commit()
    db.refresh(week)
    return load_week(db, week.week_start_date)


def load_week(db: Session, week_start: date) -> TrainingWeek:
    week = db.scalars(
        select(TrainingWeek)
        .where(TrainingWeek.week_start_date == week_start)
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


def list_weeks(db: Session) -> list[TrainingWeek]:
    ensure_default_athlete(db)
    weeks = list(
        db.scalars(
            select(TrainingWeek)
            .options(selectinload(TrainingWeek.workouts).selectinload(PlannedWorkout.steps))
            .options(selectinload(TrainingWeek.goals))
            .order_by(TrainingWeek.week_start_date.desc())
        )
    )
    for week in weeks:
        recalculate_week(db, week)
    return weeks


def training_timeline(db: Session) -> dict:
    athlete = ensure_default_athlete(db)
    month_summaries: dict[tuple[int, int], dict] = defaultdict(new_timeline_month_summary)
    data_week_starts: set[date] = set()

    workouts = db.scalars(
        select(PlannedWorkout).where(PlannedWorkout.athlete_account_id == athlete.id)
    ).all()
    for workout in workouts:
        week_start = week_start_for(workout.planned_date)
        month_key = (workout.planned_date.year, workout.planned_date.month)
        summary = month_summaries[month_key]
        summary["has_plan"] = True
        summary["planned_miles"] += workout.planned_distance or 0
        data_week_starts.add(week_start)

    activities = db.scalars(
        select(StravaActivity).where(
            StravaActivity.athlete_account_id == athlete.id,
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
            TrainingWeek.athlete_account_id == athlete.id,
            (TrainingWeek.notes != "") | TrainingWeek.target_long_run_distance.is_not(None),
        )
    ).all()
    for week in metadata_weeks:
        month_key = (week.week_start_date.year, week.week_start_date.month)
        month_summaries[month_key]["has_plan"] = True
        data_week_starts.add(week.week_start_date)

    goal_weeks = db.scalars(
        select(WeekGoal.week_start_date).where(
            WeekGoal.athlete_account_id == athlete.id,
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


def update_week(db: Session, week_id: str, payload: TrainingWeekPatch) -> TrainingWeek:
    week = get_week_by_id(db, week_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(week, field, value)
    db.commit()
    return load_week(db, week.week_start_date)


def create_week_goal(db: Session, week_id: str, payload: WeekGoalCreate) -> WeekGoal:
    week = get_week_by_id(db, week_id)
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


def update_week_goal(db: Session, goal_id: str, payload: WeekGoalUpdate) -> WeekGoal:
    goal = get_week_goal(db, goal_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(goal, field, value)
    if updates:
        goal.source = "manual"
    db.commit()
    db.refresh(goal)
    return goal


def delete_week_goal(db: Session, goal_id: str) -> None:
    goal = get_week_goal(db, goal_id)
    db.delete(goal)
    db.commit()


def get_week_goal(db: Session, goal_id: str) -> WeekGoal:
    goal = db.scalars(select(WeekGoal).where(WeekGoal.id == goal_id)).first()
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Week goal not found.",
        )
    return goal


def derive_week_goals(db: Session, week_id: str, replace_derived: bool = True) -> TrainingWeek:
    week = get_week_by_id(db, week_id)
    if replace_derived:
        for goal in list(week.goals):
            if goal.source == "derived_from_plan":
                db.delete(goal)
        db.flush()

    if any(goal.source != "derived_from_plan" for goal in week.goals):
        existing_categories = {
            goal.category for goal in week.goals if goal.source != "derived_from_plan"
        }
    else:
        existing_categories = set()

    for goal in default_goals_for_week(week):
        if goal["category"] in existing_categories and goal["goal_type"] == "achievement":
            continue
        db.add(
            WeekGoal(
                training_week_id=week.id,
                athlete_account_id=week.athlete_account_id,
                week_start_date=week.week_start_date,
                **goal,
            )
        )

    db.commit()
    return load_week(db, week.week_start_date)


def get_week_by_id(db: Session, week_id: str) -> TrainingWeek:
    week = db.scalars(
        select(TrainingWeek)
        .where(TrainingWeek.id == week_id)
        .options(selectinload(TrainingWeek.workouts).selectinload(PlannedWorkout.steps))
        .options(selectinload(TrainingWeek.goals))
    ).first()
    if not week:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training week not found.",
        )
    return week


def recalculate_week(db: Session, week: TrainingWeek) -> TrainingWeek:
    planned_mileage = sum(workout.planned_distance or 0 for workout in week.workouts)
    planned_time = sum(workout.planned_duration or 0 for workout in week.workouts)
    actual_mileage = sum(activity.distance / 1609.344 for activity in activities_for_week(db, week))
    actual_time = sum(activity.moving_time or 0 for activity in activities_for_week(db, week))
    week.planned_mileage = round(planned_mileage, 2)
    week.planned_time = planned_time or None
    week.actual_mileage = round(actual_mileage, 2)
    week.actual_time = actual_time or None
    db.add(week)
    db.commit()
    db.refresh(week)
    return week


def create_workout(db: Session, payload: PlannedWorkoutCreate) -> PlannedWorkout:
    athlete = ensure_default_athlete(db)
    week = get_or_create_week(db, week_start_for(payload.planned_date))
    workout = PlannedWorkout(
        athlete_account_id=athlete.id,
        training_week_id=week.id,
        **payload.model_dump(),
    )
    db.add(workout)
    db.commit()
    db.refresh(workout)
    recalculate_week(db, week)
    return get_workout(db, workout.id)


def list_workouts(db: Session) -> list[PlannedWorkout]:
    ensure_default_athlete(db)
    return list(
        db.scalars(
            select(PlannedWorkout)
            .options(selectinload(PlannedWorkout.steps))
            .order_by(PlannedWorkout.planned_date, PlannedWorkout.created_at)
        )
    )


def get_workout(db: Session, workout_id: str) -> PlannedWorkout:
    workout = db.scalars(
        select(PlannedWorkout)
        .where(PlannedWorkout.id == workout_id)
        .options(selectinload(PlannedWorkout.steps))
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
) -> PlannedWorkout:
    workout = get_workout(db, workout_id)
    original_week_id = workout.training_week_id
    updates = payload.model_dump(exclude_unset=True)

    for field, value in updates.items():
        setattr(workout, field, value)

    if payload.planned_date is not None:
        new_week = get_or_create_week(db, week_start_for(payload.planned_date))
        workout.training_week_id = new_week.id

    db.commit()
    db.refresh(workout)
    recalculate_impacted_weeks(db, {original_week_id, workout.training_week_id})
    return get_workout(db, workout.id)


def move_workout(db: Session, workout_id: str, planned_date: date) -> PlannedWorkout:
    return update_workout(
        db,
        workout_id,
        PlannedWorkoutUpdate(planned_date=planned_date, status="moved"),
    )


def duplicate_workout(db: Session, workout_id: str) -> PlannedWorkout:
    source = get_workout(db, workout_id)
    clone = clone_workout(
        source,
        source.training_week_id,
        source.planned_date,
        title=f"{source.title} copy",
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    recalculate_week(db, get_week_by_id(db, source.training_week_id))
    return get_workout(db, clone.id)


def copy_prior_week(db: Session, week_id: str) -> TrainingWeek:
    target = get_week_by_id(db, week_id)
    source_start = target.week_start_date - timedelta(days=7)
    source = get_or_create_week(db, source_start)

    if not source.workouts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prior week has no planned workouts to copy.",
        )

    if target.target_long_run_distance is None:
        target.target_long_run_distance = source.target_long_run_distance
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
    return load_week(db, target.week_start_date)


def save_week_plan(db: Session, week_id: str, payload: PlanWeekSave) -> TrainingWeek:
    week = get_week_by_id(db, week_id)
    week.notes = payload.purpose
    week.target_long_run_distance = payload.target_long_run_distance

    for workout in list(week.workouts):
        db.delete(workout)
    for goal in list(week.goals):
        db.delete(goal)
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
    return load_week(db, week.week_start_date)


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


def delete_workout(db: Session, workout_id: str) -> None:
    workout = get_workout(db, workout_id)
    week_id = workout.training_week_id
    db.delete(workout)
    db.commit()
    recalculate_week(db, get_week_by_id(db, week_id))


def recalculate_impacted_weeks(db: Session, week_ids: set[str]) -> None:
    for week_id in week_ids:
        recalculate_week(db, get_week_by_id(db, week_id))


def activities_for_week(db: Session, week: TrainingWeek) -> list[StravaActivity]:
    start = datetime.combine(week.week_start_date, time.min)
    end = datetime.combine(week.week_end_date + timedelta(days=1), time.min)
    return list(
        db.scalars(
            select(StravaActivity)
            .where(
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


def serialize_week(week: TrainingWeek, db: Session) -> dict:
    workouts = list(week.workouts)
    actual_activities = activities_for_week(db, week)
    planned_mileage = sum(workout.planned_distance or 0 for workout in workouts)
    hard_days = {
        workout.planned_date
        for workout in workouts
        if workout.intensity_category in {"workout", "race"}
    }
    long_run_distance = max((workout.planned_distance or 0 for workout in workouts), default=0)
    long_run_percentage = (
        round((long_run_distance / planned_mileage) * 100, 1) if planned_mileage else 0
    )
    if not week.goals and workouts:
        for goal in default_goals_for_week(week):
            db.add(
                WeekGoal(
                    training_week_id=week.id,
                    athlete_account_id=week.athlete_account_id,
                    week_start_date=week.week_start_date,
                    **goal,
                )
            )
        db.commit()
        db.refresh(week)
        db.expire(week, ["goals"])

    week_state = get_week_state(week)
    goals = [goal for goal in week.goals if goal.is_enabled]
    goal_evaluations = [
        evaluate_goal(goal, week, workouts, actual_activities, week_state) for goal in goals
    ]
    return {
        "id": week.id,
        "week_start_date": week.week_start_date,
        "week_end_date": week.week_end_date,
        "planned_mileage": week.planned_mileage,
        "actual_mileage": week.actual_mileage,
        "planned_time": week.planned_time,
        "actual_time": week.actual_time,
        "target_long_run_distance": week.target_long_run_distance,
        "notes": week.notes,
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


def serialize_goal(goal: WeekGoal) -> dict:
    return {
        "id": goal.id,
        "training_week_id": goal.training_week_id,
        "athlete_account_id": goal.athlete_account_id,
        "week_start_date": goal.week_start_date,
        "category": goal.category,
        "goal_type": goal.goal_type,
        "label": goal.label,
        "description": goal.description,
        "target_value": goal.target_value,
        "min_acceptable": goal.min_acceptable,
        "max_acceptable": goal.max_acceptable,
        "unit": goal.unit,
        "evaluation_mode": goal.evaluation_mode,
        "priority": goal.priority,
        "status": goal.status,
        "source": goal.source,
        "is_editable": bool(goal.is_editable),
        "is_enabled": bool(goal.is_enabled),
        "created_at": goal.created_at.isoformat() if goal.created_at else "",
        "updated_at": goal.updated_at.isoformat() if goal.updated_at else "",
    }


def default_goals_for_week(week: TrainingWeek) -> list[dict]:
    workouts = list(week.workouts)
    run_workouts = [workout for workout in workouts if workout.sport == "run"]
    planned_mileage = round(sum(workout.planned_distance or 0 for workout in run_workouts), 1)
    planned_sessions = len([workout for workout in workouts if workout.sport != "rest"])
    hard_dates = {
        workout.planned_date
        for workout in workouts
        if workout.intensity_category in {"workout", "race"}
        or workout.workout_type in QUALITY_WORKOUT_TYPES
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
            f"Complete {strength_sessions} strength "
            f"session{'s' if strength_sessions != 1 else ''}"
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
            f"Complete {mobility_sessions} mobility "
            f"session{'s' if mobility_sessions != 1 else ''}"
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

    goals.append(
        new_default_goal(
            "recovery",
            "achievement",
            "Preserve at least 1 rest day",
            target_value=1,
            min_acceptable=1,
            unit="days",
            evaluation_mode="at_least",
            priority="secondary",
        )
    )
    goals.append(
        new_default_goal(
            "long_run",
            "guardrail",
            "Long run no more than 30% of week",
            target_value=30,
            max_acceptable=30,
            unit="percent",
            evaluation_mode="at_most",
            priority="guardrail",
        )
    )
    goals.append(
        new_default_goal(
            "quality",
            "guardrail",
            "No more than 2 hard days",
            target_value=2,
            max_acceptable=2,
            unit="days",
            evaluation_mode="at_most",
            priority="guardrail",
        )
    )
    return goals


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
    return {
        "category": category,
        "goal_type": goal_type,
        "label": label,
        "description": "",
        "target_value": target_value,
        "min_acceptable": min_acceptable,
        "max_acceptable": max_acceptable,
        "unit": unit,
        "evaluation_mode": evaluation_mode,
        "priority": priority,
        "status": "not_started",
        "source": "derived_from_plan",
        "is_editable": True,
        "is_enabled": True,
    }


def get_week_state(week: TrainingWeek) -> str:
    today = date.today()
    if today < week.week_start_date:
        return "future"
    if today > week.week_end_date:
        return "past"
    return "current"


def evaluate_goal(
    goal: WeekGoal,
    week: TrainingWeek,
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    week_state: str,
) -> dict:
    if goal.status == "waived":
        return goal_evaluation(
            goal, "waived", "Waived", "This goal was intentionally waived.", severity="info"
        )

    if goal.goal_type == "guardrail":
        return evaluate_guardrail(goal, week, workouts, activities, week_state)

    if goal.category == "mileage":
        return evaluate_mileage_goal(goal, week, workouts, activities, week_state)
    if goal.category == "sessions":
        return evaluate_sessions_goal(goal, workouts, activities, week_state)
    if goal.category == "long_run":
        return evaluate_long_run_goal(goal, workouts, activities, week_state)
    if goal.category == "quality":
        return evaluate_quality_goal(goal, workouts, activities, week_state)
    if goal.category == "recovery":
        return evaluate_recovery_goal(goal, workouts, activities, week_state)
    if goal.category == "strength":
        return evaluate_strength_goal(goal, workouts, activities, week_state)

    return goal_evaluation(
        goal,
        goal.status,
        goal.label,
        goal.description or "Manual goal status.",
        severity=status_severity(goal.status),
    )


def evaluate_mileage_goal(
    goal: WeekGoal,
    week: TrainingWeek,
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    week_state: str,
) -> dict:
    remaining = remaining_planned_mileage(workouts)
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
) -> dict:
    actual = count_training_activities(activities)
    planned = len([workout for workout in workouts if workout.sport != "rest"])
    remaining = len(
        [
            workout
            for workout in workouts
            if workout.sport != "rest" and workout.planned_date >= date.today()
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
                if workout.planned_date >= date.today()
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
) -> dict:
    hard_workouts = [workout for workout in workouts if is_quality_workout(workout)]
    hard_activities = [activity for activity in activities if is_quality_activity(activity)]
    actual = len({activity.start_date_local.date() for activity in hard_activities})
    planned = len({workout.planned_date for workout in hard_workouts})
    remaining = len(
        {workout.planned_date for workout in hard_workouts if workout.planned_date >= date.today()}
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
        contributing_activity_ids=[activity.id for activity in hard_activities],
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
    remaining = len(
        [workout for workout in strength_workouts if workout.planned_date >= date.today()]
    )
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
) -> dict:
    return {
        "goal_id": goal.id,
        "week_start_date": goal.week_start_date,
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


def remaining_planned_mileage(workouts: list[PlannedWorkout]) -> float:
    today = date.today()
    return round(
        sum(
            workout.planned_distance or 0
            for workout in workouts
            if workout.sport == "run" and workout.planned_date >= today
        ),
        1,
    )


def is_run_activity(activity: StravaActivity) -> bool:
    return normalized_sport(activity.sport_type) in RUN_SPORTS


def is_training_activity(activity: StravaActivity) -> bool:
    return is_run_activity(activity) or is_strength_activity(activity)


def is_strength_activity(activity: StravaActivity) -> bool:
    sport = normalized_sport(activity.sport_type)
    name = activity.name.lower()
    return (
        "strength" in sport
        or "weight" in sport
        or "workout" in sport
        or "strength" in name
        or "mobility" in name
    )


def is_quality_activity(activity: StravaActivity) -> bool:
    name = activity.name.lower()
    return is_run_activity(activity) and any(keyword in name for keyword in QUALITY_KEYWORDS)


def is_quality_workout(workout: PlannedWorkout) -> bool:
    return (
        workout.intensity_category in {"workout", "race"}
        or workout.workout_type in QUALITY_WORKOUT_TYPES
    )


def normalized_sport(value: str) -> str:
    return value.replace("_", "").replace(" ", "").lower()


def count_training_activities(activities: list[StravaActivity]) -> int:
    return len([activity for activity in activities if is_training_activity(activity)])


def has_back_to_back_dates(values: set[date]) -> bool:
    return any(day + timedelta(days=1) in values for day in values)


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
