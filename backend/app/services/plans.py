from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.planning import GoalRace, Mesocycle, PlanGoal, TrainingPlan, TrainingWeek
from app.schemas.planning import (
    GoalRaceCreate,
    GoalRaceUpdate,
    MesocycleSpec,
    TrainingPlanMetadataPatch,
    TrainingPlanSpec,
)
from app.services import planning

DISTANCE_MILES = {
    "5k": 3.10686,
    "10k": 6.21371,
    "half_marathon": 13.1094,
    "marathon": 26.2188,
}
PHASE_DEFAULT_PURPOSE = {
    "base": "aerobic_build",
    "build": "aerobic_build",
    "specific": "workout_focus",
    "taper": "down_week",
    "race": "race_week",
    "recovery": "recovery",
    "maintenance": "maintain",
}
PLAN_RELATIONSHIPS = (
    selectinload(TrainingPlan.athlete),
    selectinload(TrainingPlan.goal_race),
    selectinload(TrainingPlan.mesocycles).selectinload(Mesocycle.weeks),
    selectinload(TrainingPlan.plan_goals),
)


@dataclass
class ScaffoldWeek:
    week_start_date: date
    week_end_date: date
    mesocycle_id: str
    mesocycle_name: str
    mesocycle_phase: str
    week_index_in_mesocycle: int
    mesocycle_week_count: int
    purpose: str
    is_down_week: bool
    target_mileage: float | None
    target_long_run_distance: float | None


def list_goal_races(db: Session, athlete_account_id: str) -> list[dict[str, Any]]:
    races = db.scalars(
        select(GoalRace)
        .where(GoalRace.athlete_account_id == athlete_account_id)
        .order_by(GoalRace.race_date, GoalRace.created_at)
    ).all()
    return [serialize_goal_race(race) for race in races]


def create_goal_race(db: Session, payload: GoalRaceCreate, athlete_account_id: str) -> dict[str, Any]:
    race = GoalRace(athlete_account_id=athlete_account_id, **validated_goal_race_data(payload))
    db.add(race)
    db.commit()
    db.refresh(race)
    return serialize_goal_race(race)


def update_goal_race(
    db: Session,
    goal_race_id: str,
    payload: GoalRaceUpdate,
    athlete_account_id: str,
) -> dict[str, Any]:
    race = get_goal_race_model(db, goal_race_id, athlete_account_id)
    updates = payload.model_dump(exclude_unset=True)
    if "distance" in updates or "distance_miles" in updates:
        merged = {
            "name": race.name,
            "race_date": race.race_date,
            "distance": updates.get("distance", race.distance),
            "distance_miles": updates.get("distance_miles", race.distance_miles),
            "target_time": updates.get("target_time", race.target_time),
            "priority": updates.get("priority", race.priority),
            "location": updates.get("location", race.location),
            "altitude_context": updates.get("altitude_context", race.altitude_context),
            "notes": updates.get("notes", race.notes),
        }
        updates = validated_goal_race_data(GoalRaceCreate(**merged))
    for field, value in updates.items():
        setattr(race, field, value)
    db.commit()
    db.refresh(race)
    return serialize_goal_race(race)


def delete_goal_race(db: Session, goal_race_id: str, athlete_account_id: str) -> None:
    race = get_goal_race_model(db, goal_race_id, athlete_account_id)
    for plan in db.scalars(
        select(TrainingPlan).where(TrainingPlan.goal_race_id == race.id)
    ).all():
        plan.goal_race_id = None
        db.add(plan)
    db.delete(race)
    db.commit()


def list_plans(db: Session, athlete_account_id: str) -> list[dict[str, Any]]:
    plans = db.scalars(
        select(TrainingPlan)
        .where(TrainingPlan.athlete_account_id == athlete_account_id)
        .options(*PLAN_RELATIONSHIPS)
        .order_by(TrainingPlan.start_date.desc(), TrainingPlan.created_at.desc())
    ).all()
    return [serialize_plan_summary(plan) for plan in plans]


def preview_plan(
    db: Session,
    payload: TrainingPlanSpec,
    athlete_account_id: str,
    existing_plan_id: str | None = None,
) -> dict[str, Any]:
    normalized = normalize_plan_spec(db, payload, athlete_account_id, existing_plan_id=existing_plan_id)
    existing_weeks = weeks_for_preview(
        db,
        athlete_account_id,
        normalized["start_date"],
        normalized["end_date"],
        existing_plan_id=existing_plan_id,
    )
    return scaffold_weeks(
        db,
        athlete_account_id,
        normalized["mesocycles"],
        existing_weeks,
        linked_weeks_by_start=linked_weeks_by_start(db, existing_plan_id, athlete_account_id),
        apply_changes=False,
    )


def create_plan(db: Session, payload: TrainingPlanSpec, athlete_account_id: str) -> dict[str, Any]:
    normalized = normalize_plan_spec(db, payload, athlete_account_id)
    goal_race_id = resolve_goal_race_id(db, normalized, athlete_account_id)
    plan = TrainingPlan(
        athlete_account_id=athlete_account_id,
        name=normalized["name"],
        description=normalized["description"],
        goal_race_id=goal_race_id,
        start_date=normalized["start_date"],
        end_date=normalized["end_date"],
        status=normalized["status"],
        notes=normalized["notes"],
    )
    db.add(plan)
    db.flush()
    replace_plan_children(db, plan, normalized, athlete_account_id)
    scaffold_weeks(
        db,
        athlete_account_id,
        normalized["mesocycles"],
        weeks_for_preview(db, athlete_account_id, plan.start_date, plan.end_date),
        linked_weeks_by_start={},
        apply_changes=True,
    )
    db.commit()
    return get_plan(db, plan.id, athlete_account_id)


def get_plan(db: Session, plan_id: str, athlete_account_id: str) -> dict[str, Any]:
    plan = get_plan_model(db, plan_id, athlete_account_id)
    return serialize_plan(plan)


def replace_plan(db: Session, plan_id: str, payload: TrainingPlanSpec, athlete_account_id: str) -> dict[str, Any]:
    plan = get_plan_model(db, plan_id, athlete_account_id)
    normalized = normalize_plan_spec(db, payload, athlete_account_id, existing_plan_id=plan_id)
    old_linked = linked_weeks_by_start(db, plan_id, athlete_account_id)
    plan.name = normalized["name"]
    plan.description = normalized["description"]
    plan.start_date = normalized["start_date"]
    plan.end_date = normalized["end_date"]
    plan.status = normalized["status"]
    plan.notes = normalized["notes"]
    plan.goal_race_id = resolve_goal_race_id(db, normalized, athlete_account_id)
    db.add(plan)
    replace_plan_children(db, plan, normalized, athlete_account_id)
    weeks = weeks_for_preview(
        db,
        athlete_account_id,
        plan.start_date,
        plan.end_date,
        existing_plan_id=plan_id,
    )
    scaffold_weeks(
        db,
        athlete_account_id,
        normalized["mesocycles"],
        weeks,
        linked_weeks_by_start=old_linked,
        apply_changes=True,
    )
    db.commit()
    return get_plan(db, plan.id, athlete_account_id)


def patch_plan(
    db: Session,
    plan_id: str,
    payload: TrainingPlanMetadataPatch,
    athlete_account_id: str,
) -> dict[str, Any]:
    plan = get_plan_model(db, plan_id, athlete_account_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(plan, field, value)
    db.commit()
    return get_plan(db, plan.id, athlete_account_id)


def delete_plan(
    db: Session,
    plan_id: str,
    athlete_account_id: str,
    *,
    clear_scaffolding: bool,
) -> None:
    plan = get_plan_model(db, plan_id, athlete_account_id)
    weeks = list(linked_weeks_by_start(db, plan_id, athlete_account_id).values())
    for week in weeks:
        week.mesocycle_id = None
        if clear_scaffolding:
            clear_plan_owned_fields(week)
        db.add(week)
    db.delete(plan)
    db.commit()


def get_goal_race_model(db: Session, goal_race_id: str, athlete_account_id: str) -> GoalRace:
    race = db.scalars(
        select(GoalRace).where(
            GoalRace.id == goal_race_id,
            GoalRace.athlete_account_id == athlete_account_id,
        )
    ).first()
    if not race:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal race not found.")
    return race


def get_plan_model(db: Session, plan_id: str, athlete_account_id: str) -> TrainingPlan:
    plan = db.scalars(
        select(TrainingPlan)
        .where(TrainingPlan.id == plan_id, TrainingPlan.athlete_account_id == athlete_account_id)
        .options(*PLAN_RELATIONSHIPS)
    ).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training plan not found.")
    return plan


def validated_goal_race_data(payload: GoalRaceCreate) -> dict[str, Any]:
    data = payload.model_dump()
    if data["distance"] == "other":
        if not data["distance_miles"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Custom race distance requires distanceMiles.",
            )
    else:
        data["distance_miles"] = None
    return data


def normalize_plan_spec(
    db: Session,
    payload: TrainingPlanSpec,
    athlete_account_id: str,
    *,
    existing_plan_id: str | None = None,
) -> dict[str, Any]:
    data = payload.model_dump()
    data["start_date"] = normalize_to_monday(payload.start_date)
    data["end_date"] = normalize_to_sunday(payload.end_date)
    if data["end_date"] < data["start_date"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Plan end date must be on or after the start date.",
        )

    goal_race_date = None
    if payload.goal_race_id:
        goal_race = get_goal_race_model(db, payload.goal_race_id, athlete_account_id)
        goal_race_date = goal_race.race_date
    elif payload.goal_race is not None:
        validated_goal_race_data(payload.goal_race)
        goal_race_date = payload.goal_race.race_date

    if goal_race_date and not (data["start_date"] <= goal_race_date <= data["end_date"]):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Goal race date must fall within the training plan date range.",
        )

    validate_no_overlap(
        db,
        athlete_account_id,
        data["start_date"],
        data["end_date"],
        existing_plan_id=existing_plan_id,
        incoming_status=data["status"],
    )
    data["mesocycles"] = normalize_mesocycles(payload.mesocycles, data["start_date"], data["end_date"])
    data["plan_goals"] = [goal.model_dump() for goal in payload.plan_goals]
    return data


def normalize_mesocycles(
    mesocycles: list[MesocycleSpec],
    plan_start_date: date,
    plan_end_date: date,
) -> list[dict[str, Any]]:
    normalized = []
    for mesocycle in sorted(mesocycles, key=lambda item: item.order_index):
        data = mesocycle.model_dump()
        data["start_date"] = normalize_to_monday(mesocycle.start_date)
        data["end_date"] = normalize_to_sunday(mesocycle.end_date)
        normalized.append(data)

    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A training plan requires at least one mesocycle.",
        )

    if normalized[0]["start_date"] != plan_start_date or normalized[-1]["end_date"] != plan_end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mesocycles must tile the plan date range exactly.",
        )

    cursor = plan_start_date
    for expected_index, mesocycle in enumerate(normalized):
        if mesocycle["order_index"] != expected_index:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Mesocycle orderIndex values must be contiguous and zero-based.",
            )
        if mesocycle["start_date"] != cursor:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Mesocycles must be contiguous and non-overlapping.",
            )
        if mesocycle["end_date"] < mesocycle["start_date"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Mesocycle end date must be on or after the start date.",
            )
        cursor = mesocycle["end_date"] + timedelta(days=1)

    if cursor != plan_end_date + timedelta(days=1):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mesocycles must tile the plan date range exactly.",
        )
    return normalized


def validate_no_overlap(
    db: Session,
    athlete_account_id: str,
    start_date: date,
    end_date: date,
    *,
    existing_plan_id: str | None,
    incoming_status: str,
) -> None:
    if incoming_status == "archived":
        return

    conditions = [
        TrainingPlan.athlete_account_id == athlete_account_id,
        TrainingPlan.status != "archived",
        TrainingPlan.start_date <= end_date,
        TrainingPlan.end_date >= start_date,
    ]
    if existing_plan_id:
        conditions.append(TrainingPlan.id != existing_plan_id)
    overlap = db.scalars(select(TrainingPlan).where(*conditions)).first()
    if overlap:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This plan overlaps another non-archived training plan.",
        )


def resolve_goal_race_id(db: Session, normalized: dict[str, Any], athlete_account_id: str) -> str | None:
    if normalized["goal_race_id"]:
        return normalized["goal_race_id"]
    goal_race_payload = normalized.get("goal_race")
    if goal_race_payload is None:
        return None
    race = GoalRace(
        athlete_account_id=athlete_account_id,
        **validated_goal_race_data(GoalRaceCreate(**goal_race_payload)),
    )
    db.add(race)
    db.flush()
    return race.id


def replace_plan_children(
    db: Session,
    plan: TrainingPlan,
    normalized: dict[str, Any],
    athlete_account_id: str,
) -> None:
    plan.mesocycles.clear()
    plan.plan_goals.clear()
    db.flush()

    for mesocycle_data in normalized["mesocycles"]:
        plan.mesocycles.append(
            Mesocycle(
                athlete_account_id=athlete_account_id,
                **{
                    key: value
                    for key, value in mesocycle_data.items()
                    if key != "id"
                },
            )
        )
    db.flush()

    mesocycle_by_index = {mesocycle.order_index: mesocycle for mesocycle in plan.mesocycles}
    normalized["mesocycles"] = [
        {**data, "id": mesocycle_by_index[data["order_index"]].id}
        for data in normalized["mesocycles"]
    ]

    for goal_data in normalized["plan_goals"]:
        plan.plan_goals.append(
            PlanGoal(
                athlete_account_id=athlete_account_id,
                **{
                    key: value
                    for key, value in goal_data.items()
                    if key != "id"
                },
            )
        )
    db.flush()


def weeks_for_preview(
    db: Session,
    athlete_account_id: str,
    start_date: date,
    end_date: date,
    *,
    existing_plan_id: str | None = None,
) -> dict[date, TrainingWeek]:
    conditions = [
        TrainingWeek.athlete_account_id == athlete_account_id,
        TrainingWeek.week_start_date >= start_date,
        TrainingWeek.week_start_date <= end_date,
    ]
    linked = linked_weeks_by_start(db, existing_plan_id, athlete_account_id) if existing_plan_id else {}
    weeks = db.scalars(select(TrainingWeek).where(*conditions)).all()
    result = {week.week_start_date: week for week in weeks}
    result.update(linked)
    return result


def linked_weeks_by_start(
    db: Session,
    plan_id: str | None,
    athlete_account_id: str,
) -> dict[date, TrainingWeek]:
    if not plan_id:
        return {}
    weeks = db.scalars(
        select(TrainingWeek)
        .join(Mesocycle, TrainingWeek.mesocycle_id == Mesocycle.id)
        .where(
            TrainingWeek.athlete_account_id == athlete_account_id,
            Mesocycle.training_plan_id == plan_id,
        )
    ).all()
    return {week.week_start_date: week for week in weeks}


def scaffold_weeks(
    db: Session,
    athlete_account_id: str,
    mesocycles: list[dict[str, Any]],
    existing_weeks: dict[date, TrainingWeek],
    *,
    linked_weeks_by_start: dict[date, TrainingWeek],
    apply_changes: bool,
) -> dict[str, Any]:
    scheduled_weeks = materialize_scaffold_weeks(mesocycles)
    scheduled_by_start = {week.week_start_date: week for week in scheduled_weeks}
    diffs: list[dict[str, Any]] = []
    warnings: list[str] = []
    preserved_manual_count = 0

    for scheduled in scheduled_weeks:
        existing = existing_weeks.get(scheduled.week_start_date)
        change_list: list[dict[str, Any]] = []
        week_warnings = scaffold_week_warnings(existing, scheduled)
        manual_override = False
        action = "create" if existing is None else "annotate"

        if existing is None:
            # Build the week in memory for both preview and apply so the two
            # produce identical change lists; only apply adds it to the session.
            # planning.get_or_create_week is avoided here because it commits,
            # which would break the single-transaction scaffold.
            existing = blank_scaffold_week(athlete_account_id, scheduled)
            if apply_changes:
                db.add(existing)
                existing_weeks[scheduled.week_start_date] = existing

        if apply_changes:
            existing.mesocycle_id = scheduled.mesocycle_id

        purpose_action = apply_scaffolded_field(
            existing,
            "purpose",
            "purpose_source",
            scheduled.purpose,
            empty_value="",
            apply_changes=apply_changes,
        )
        if purpose_action["changed"]:
            change_list.append(change("purpose", purpose_action["from"], scheduled.purpose))
            if bool(existing.is_down_week) != scheduled.is_down_week:
                change_list.append(change("isDownWeek", bool(existing.is_down_week), scheduled.is_down_week))
            if apply_changes:
                existing.is_down_week = int(scheduled.is_down_week)
        elif purpose_action["blocked"]:
            manual_override = True
            preserved_manual_count += 1
            week_warnings.append("Manual purpose override will be preserved.")

        target_mileage_action = apply_scaffolded_field(
            existing,
            "target_mileage",
            "target_mileage_source",
            scheduled.target_mileage,
            empty_value=None,
            apply_changes=apply_changes,
        )
        if target_mileage_action["changed"] and target_mileage_action["from"] != scheduled.target_mileage:
            change_list.append(
                change("targetMileage", target_mileage_action["from"], scheduled.target_mileage)
            )
        elif target_mileage_action["blocked"]:
            manual_override = True
            preserved_manual_count += 1
            week_warnings.append("Manual target mileage override will be preserved.")

        long_run_action = apply_scaffolded_field(
            existing,
            "target_long_run_distance",
            "target_long_run_source",
            scheduled.target_long_run_distance,
            empty_value=None,
            apply_changes=apply_changes,
        )
        if long_run_action["changed"] and long_run_action["from"] != scheduled.target_long_run_distance:
            change_list.append(
                change(
                    "targetLongRunDistance",
                    long_run_action["from"],
                    scheduled.target_long_run_distance,
                )
            )
        elif long_run_action["blocked"]:
            manual_override = True
            preserved_manual_count += 1
            week_warnings.append("Manual long-run override will be preserved.")

        if action != "create":
            action = "skip_overridden" if manual_override and not change_list else "update" if change_list else "annotate"

        diffs.append(
            {
                "week_start_date": scheduled.week_start_date,
                "action": action,
                "changes": change_list,
                "warnings": week_warnings,
            }
        )

    for week_start_date, week in linked_weeks_by_start.items():
        if week_start_date in scheduled_by_start:
            continue
        unlink_changes = [change("mesocycleId", week.mesocycle_id, None), *plan_owned_reset_changes(week)]
        if apply_changes:
            week.mesocycle_id = None
            clear_plan_owned_fields(week)
            db.add(week)
        diffs.append(
            {
                "week_start_date": week_start_date,
                "action": "unlink",
                "changes": unlink_changes,
                "warnings": [],
            }
        )

    if preserved_manual_count:
        warnings.append(f"{preserved_manual_count} manual field overrides will be preserved.")
    return {"weeks": sorted(diffs, key=lambda item: item["week_start_date"]), "warnings": warnings}


def materialize_scaffold_weeks(mesocycles: list[dict[str, Any]]) -> list[ScaffoldWeek]:
    output: list[ScaffoldWeek] = []
    for mesocycle in mesocycles:
        week_starts = list(week_starts_in_range(mesocycle["start_date"], mesocycle["end_date"]))
        if not week_starts:
            continue
        down_week_flags = [
            bool(mesocycle["down_week_cadence"]) and ((index + 1) % mesocycle["down_week_cadence"] == 0)
            for index in range(len(week_starts))
        ]
        target_mileages = interpolate_targets(
            mesocycle["target_mileage_start"],
            mesocycle["target_mileage_end"],
            down_week_flags,
            mesocycle["down_week_reduction_pct"],
        )
        long_run_targets = interpolate_targets(
            mesocycle["long_run_start"],
            mesocycle["long_run_end"],
            down_week_flags,
            mesocycle["down_week_reduction_pct"],
        )
        for index, week_start_date in enumerate(week_starts):
            is_down_week = down_week_flags[index]
            purpose = default_week_purpose(mesocycle["phase"], is_down_week)
            output.append(
                ScaffoldWeek(
                    week_start_date=week_start_date,
                    week_end_date=planning.week_end_for(week_start_date),
                    mesocycle_id=mesocycle["id"],
                    mesocycle_name=mesocycle["name"],
                    mesocycle_phase=mesocycle["phase"],
                    week_index_in_mesocycle=index + 1,
                    mesocycle_week_count=len(week_starts),
                    purpose=purpose,
                    is_down_week=is_down_week,
                    target_mileage=target_mileages[index],
                    target_long_run_distance=long_run_targets[index],
                )
            )
    return output


def week_starts_in_range(start_date: date, end_date: date) -> list[date]:
    cursor = start_date
    starts = []
    while cursor <= end_date:
        starts.append(cursor)
        cursor += timedelta(days=7)
    return starts


def interpolate_targets(
    start_value: float | None,
    end_value: float | None,
    down_week_flags: list[bool],
    reduction_pct: float,
) -> list[float | None]:
    if start_value is None and end_value is None:
        return [None for _ in down_week_flags]
    baseline = start_value if start_value is not None else end_value
    peak = end_value if end_value is not None else start_value
    assert baseline is not None and peak is not None

    values: list[float | None] = [None for _ in down_week_flags]
    non_down_indices = [index for index, is_down_week in enumerate(down_week_flags) if not is_down_week]
    if not non_down_indices:
        non_down_indices = list(range(len(down_week_flags)))

    for position, index in enumerate(non_down_indices):
        values[index] = round(interpolate_value(baseline, peak, position, len(non_down_indices)), 1)

    reduction_multiplier = max(0, 1 - (reduction_pct / 100))
    prior_reference = values[non_down_indices[0]]
    for index, is_down_week in enumerate(down_week_flags):
        if not is_down_week:
            prior_reference = values[index]
            continue
        reference = prior_reference if prior_reference is not None else values[non_down_indices[0]]
        values[index] = round(reference * reduction_multiplier, 1) if reference is not None else None
    return values


def interpolate_value(start_value: float, end_value: float, index: int, count: int) -> float:
    if count <= 1:
        return start_value
    ratio = index / (count - 1)
    return start_value + ((end_value - start_value) * ratio)


def default_week_purpose(phase: str, is_down_week: bool) -> str:
    if phase == "race":
        return "race_week"
    if is_down_week:
        return "down_week"
    return PHASE_DEFAULT_PURPOSE.get(phase, "maintain")


def apply_scaffolded_field(
    week: TrainingWeek,
    field_name: str,
    source_field_name: str,
    next_value: Any,
    *,
    empty_value: Any,
    apply_changes: bool,
) -> dict[str, Any]:
    current_value = getattr(week, field_name)
    current_source = getattr(week, source_field_name)
    is_empty = current_value == empty_value
    can_write = current_source == "plan" or is_empty
    if not can_write:
        return {"changed": False, "blocked": current_value != next_value, "from": current_value}
    changed = current_value != next_value or current_source != "plan"
    if changed and apply_changes:
        setattr(week, field_name, next_value)
        setattr(week, source_field_name, "plan")
    return {"changed": changed, "blocked": False, "from": current_value}


def change(field: str, from_value: Any, to_value: Any) -> dict[str, Any]:
    return {"field": field, "from": from_value, "to": to_value}


def scaffold_week_warnings(existing: TrainingWeek | None, scheduled: ScaffoldWeek) -> list[str]:
    warnings: list[str] = []
    if (
        existing is not None
        and scheduled.target_mileage is not None
        and existing.planned_mileage > scheduled.target_mileage
    ):
        warnings.append(
            f"Week has {existing.planned_mileage:.1f} planned miles; plan target is {scheduled.target_mileage:.1f}."
        )
    return warnings


def clear_plan_owned_fields(week: TrainingWeek) -> None:
    if week.purpose_source == "plan":
        week.purpose = ""
        week.purpose_source = "manual"
        week.is_down_week = 0
    if week.target_mileage_source == "plan":
        week.target_mileage = None
        week.target_mileage_source = "manual"
    if week.target_long_run_source == "plan":
        week.target_long_run_distance = None
        week.target_long_run_source = "manual"


def plan_owned_reset_changes(week: TrainingWeek) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    if week.purpose_source == "plan":
        changes.append(change("purpose", week.purpose, ""))
        changes.append(change("isDownWeek", bool(week.is_down_week), False))
    if week.target_mileage_source == "plan":
        changes.append(change("targetMileage", week.target_mileage, None))
    if week.target_long_run_source == "plan":
        changes.append(change("targetLongRunDistance", week.target_long_run_distance, None))
    return changes


def blank_scaffold_week(athlete_account_id: str, scheduled: ScaffoldWeek) -> TrainingWeek:
    # Field defaults are set explicitly because ORM column defaults only apply
    # on flush, and preview-mode weeks are never flushed.
    return TrainingWeek(
        athlete_account_id=athlete_account_id,
        week_start_date=scheduled.week_start_date,
        week_end_date=scheduled.week_end_date,
        planned_mileage=0,
        actual_mileage=0,
        purpose="",
        purpose_source="manual",
        target_mileage=None,
        target_mileage_source="manual",
        target_long_run_distance=None,
        target_long_run_source="manual",
        is_down_week=0,
        notes="",
    )


def serialize_goal_race(race: GoalRace) -> dict[str, Any]:
    distance_miles = goal_race_distance_miles(race.distance, race.distance_miles)
    target_pace = round(race.target_time / distance_miles, 1) if race.target_time and distance_miles else None
    return {
        "id": race.id,
        "athlete_account_id": race.athlete_account_id,
        "name": race.name,
        "race_date": race.race_date,
        "distance": race.distance,
        "distance_miles": race.distance_miles,
        "target_time": race.target_time,
        "priority": race.priority,
        "location": race.location,
        "altitude_context": race.altitude_context,
        "notes": race.notes,
        "target_pace_seconds_per_mile": target_pace,
        "created_at": race.created_at.isoformat() if race.created_at else "",
        "updated_at": race.updated_at.isoformat() if race.updated_at else "",
    }


def serialize_plan_summary(plan: TrainingPlan) -> dict[str, Any]:
    today = today_for_plan_reads(plan)
    status = computed_plan_status(plan, today)
    return {
        "id": plan.id,
        "athlete_account_id": plan.athlete_account_id,
        "name": plan.name,
        "description": plan.description,
        "goal_race_id": plan.goal_race_id,
        "goal_race_name": plan.goal_race.name if plan.goal_race else None,
        "start_date": plan.start_date,
        "end_date": plan.end_date,
        "status": status,
        "notes": plan.notes,
        "is_current": plan.start_date <= today <= plan.end_date,
        "is_upcoming": today < plan.start_date,
        "created_at": plan.created_at.isoformat() if plan.created_at else "",
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else "",
    }


def serialize_plan(plan: TrainingPlan) -> dict[str, Any]:
    summary = serialize_plan_summary(plan)
    week_summaries = serialize_plan_week_summaries(plan)
    return {
        **summary,
        "goal_race": serialize_goal_race(plan.goal_race) if plan.goal_race else None,
        "mesocycles": [serialize_mesocycle(mesocycle) for mesocycle in plan.mesocycles],
        "plan_goals": [serialize_plan_goal(goal) for goal in plan.plan_goals],
        "week_summaries": week_summaries,
    }


def serialize_mesocycle(mesocycle: Mesocycle) -> dict[str, Any]:
    return {
        "id": mesocycle.id,
        "training_plan_id": mesocycle.training_plan_id,
        "athlete_account_id": mesocycle.athlete_account_id,
        "order_index": mesocycle.order_index,
        "name": mesocycle.name,
        "phase": mesocycle.phase,
        "start_date": mesocycle.start_date,
        "end_date": mesocycle.end_date,
        "target_mileage_start": mesocycle.target_mileage_start,
        "target_mileage_end": mesocycle.target_mileage_end,
        "long_run_start": mesocycle.long_run_start,
        "long_run_end": mesocycle.long_run_end,
        "down_week_cadence": mesocycle.down_week_cadence,
        "down_week_reduction_pct": mesocycle.down_week_reduction_pct,
        "notes": mesocycle.notes,
        "created_at": mesocycle.created_at.isoformat() if mesocycle.created_at else "",
        "updated_at": mesocycle.updated_at.isoformat() if mesocycle.updated_at else "",
    }


def serialize_plan_goal(goal: PlanGoal) -> dict[str, Any]:
    return {
        "id": goal.id,
        "training_plan_id": goal.training_plan_id,
        "athlete_account_id": goal.athlete_account_id,
        "category": goal.category,
        "label": goal.label,
        "target_value": goal.target_value,
        "unit": goal.unit,
        "flows_down": bool(goal.flows_down),
        "notes": goal.notes,
        "created_at": goal.created_at.isoformat() if goal.created_at else "",
        "updated_at": goal.updated_at.isoformat() if goal.updated_at else "",
    }


def serialize_plan_week_summaries(plan: TrainingPlan) -> list[dict[str, Any]]:
    weeks_by_start = {week.week_start_date: week for mesocycle in plan.mesocycles for week in mesocycle.weeks}
    scaffold_weeks = materialize_scaffold_weeks(
        [
            {
                "id": mesocycle.id,
                "name": mesocycle.name,
                "phase": mesocycle.phase,
                "start_date": mesocycle.start_date,
                "end_date": mesocycle.end_date,
                "target_mileage_start": mesocycle.target_mileage_start,
                "target_mileage_end": mesocycle.target_mileage_end,
                "long_run_start": mesocycle.long_run_start,
                "long_run_end": mesocycle.long_run_end,
                "down_week_cadence": mesocycle.down_week_cadence,
                "down_week_reduction_pct": mesocycle.down_week_reduction_pct,
            }
            for mesocycle in plan.mesocycles
        ]
    )
    summaries = []
    for scheduled in scaffold_weeks:
        week = weeks_by_start.get(scheduled.week_start_date)
        has_manual_override = bool(
            week
            and (
                week.purpose_source == "manual"
                or week.target_mileage_source == "manual"
                or week.target_long_run_source == "manual"
            )
            and (week.purpose or week.target_mileage is not None or week.target_long_run_distance is not None)
        )
        warning = None
        if week and scheduled.target_mileage is not None and week.planned_mileage > scheduled.target_mileage:
            warning = (
                f"{week.planned_mileage:.1f} planned miles against a {scheduled.target_mileage:.1f} target."
            )
        summaries.append(
            {
                "week_start_date": scheduled.week_start_date,
                "week_end_date": scheduled.week_end_date,
                "mesocycle_id": scheduled.mesocycle_id,
                "mesocycle_name": scheduled.mesocycle_name,
                "mesocycle_phase": scheduled.mesocycle_phase,
                "week_index_in_mesocycle": scheduled.week_index_in_mesocycle,
                "mesocycle_week_count": scheduled.mesocycle_week_count,
                "planned_mileage": week.planned_mileage if week else 0,
                "actual_mileage": week.actual_mileage if week else 0,
                "target_mileage": week.target_mileage if week else scheduled.target_mileage,
                "target_long_run_distance": (
                    week.target_long_run_distance if week else scheduled.target_long_run_distance
                ),
                "purpose": week.purpose if week and week.purpose else scheduled.purpose,
                "purpose_source": week.purpose_source if week else "plan",
                "target_mileage_source": week.target_mileage_source if week else "plan",
                "target_long_run_source": week.target_long_run_source if week else "plan",
                "is_down_week": bool(week.is_down_week) if week else scheduled.is_down_week,
                "has_manual_override": has_manual_override,
                "warning": warning,
            }
        )
    return summaries


def today_for_plan_reads(plan: TrainingPlan) -> date:
    timezone_name = plan.athlete.timezone if plan.athlete else None
    return planning.today_for_timezone(timezone_name)


def computed_plan_status(plan: TrainingPlan, today: date) -> str:
    if plan.status == "archived":
        return "archived"
    if plan.end_date < today:
        return "completed"
    return plan.status


def goal_race_distance_miles(distance: str, distance_miles: float | None) -> float | None:
    if distance == "other":
        return distance_miles
    return DISTANCE_MILES.get(distance)


def normalize_to_monday(value: date) -> date:
    return planning.week_start_for(value)


def normalize_to_sunday(value: date) -> date:
    return planning.week_end_for(planning.week_start_for(value))
