from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.planning import AthleteAccount, PlannedWorkout, PlannedWorkoutStep, TrainingWeek
from app.models.strava import StravaActivity
from app.schemas.planning import PlannedWorkoutCreate, PlannedWorkoutUpdate, TrainingWeekPatch


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


def get_week_by_id(db: Session, week_id: str) -> TrainingWeek:
    week = db.scalars(
        select(TrainingWeek)
        .where(TrainingWeek.id == week_id)
        .options(selectinload(TrainingWeek.workouts).selectinload(PlannedWorkout.steps))
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

    db.add(target)
    db.commit()
    return load_week(db, target.week_start_date)


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
        "hard_days": len(hard_days),
        "long_run_distance": long_run_distance,
        "long_run_percentage": long_run_percentage,
    }
