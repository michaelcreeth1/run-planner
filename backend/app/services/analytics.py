from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.planning import AthleteAccount, PlannedWorkout, TrainingWeek, WeekGoal
from app.models.strava import StravaActivity
from app.services import planning

LOAD_WATCH_JUMP = 0.15
LOAD_REVISE_JUMP = 0.25
LONG_RUN_WATCH_PERCENT = 30
LONG_RUN_REVISE_PERCENT = 35
MAX_HARD_DAYS = 2


def planning_analytics(
    db: Session,
    athlete_account_id: str,
    *,
    lookback_weeks: int = 12,
    future_weeks: int = 4,
    anchor_week_start_date: date | None = None,
) -> dict:
    athlete = db.get(AthleteAccount, athlete_account_id)
    today = planning.today_for_timezone(athlete.timezone if athlete else None)
    anchor = planning.week_start_for(anchor_week_start_date or today)
    lookback = max(1, min(lookback_weeks, 52))
    future = max(1, min(future_weeks, 26))
    start = anchor - timedelta(days=lookback * 7)
    end = anchor + timedelta(days=future * 7 + 6)
    week_starts = [start + timedelta(days=index * 7) for index in range(lookback + future + 1)]

    workouts_by_week = workouts_in_range(db, athlete_account_id, start, end)
    activities_by_week = activities_in_range(db, athlete_account_id, start, end)
    weeks_by_start = metadata_weeks_in_range(db, athlete_account_id, start, end)

    summaries = [
        summarize_week(
            week_start,
            workouts_by_week.get(week_start, []),
            activities_by_week.get(week_start, []),
            today,
        )
        for week_start in week_starts
    ]
    baseline = load_band_for(summaries, anchor)
    goal_reliability = goal_reliability_for(
        db,
        athlete_account_id,
        start,
        min(anchor - timedelta(days=1), end),
        weeks_by_start,
    )
    insights = build_insights(summaries, baseline, anchor)
    primary = insights[0] if insights else clear_primary_insight(anchor)

    return {
        "anchor_week_start_date": anchor,
        "generated_at": datetime.utcnow().isoformat(),
        "lookback_weeks": lookback,
        "future_weeks": future,
        "primary_recommendation": primary,
        "insights": insights[:4],
        "load_band": baseline,
        "weeks": summaries,
        "goal_reliability": goal_reliability,
    }


def workouts_in_range(
    db: Session, athlete_account_id: str, start: date, end: date
) -> dict[date, list[PlannedWorkout]]:
    workouts = db.scalars(
        select(PlannedWorkout)
        .where(
            PlannedWorkout.athlete_account_id == athlete_account_id,
            PlannedWorkout.planned_date >= start,
            PlannedWorkout.planned_date <= end,
        )
        .order_by(PlannedWorkout.planned_date)
    ).all()
    grouped: dict[date, list[PlannedWorkout]] = defaultdict(list)
    for workout in workouts:
        grouped[planning.week_start_for(workout.planned_date)].append(workout)
    return grouped


def activities_in_range(
    db: Session, athlete_account_id: str, start: date, end: date
) -> dict[date, list[StravaActivity]]:
    start_at = datetime.combine(start, time.min)
    end_at = datetime.combine(end + timedelta(days=1), time.min)
    activities = db.scalars(
        select(StravaActivity)
        .where(
            StravaActivity.athlete_account_id == athlete_account_id,
            StravaActivity.deleted_at.is_(None),
            StravaActivity.start_date_local >= start_at,
            StravaActivity.start_date_local < end_at,
        )
        .order_by(StravaActivity.start_date_local)
    ).all()
    grouped: dict[date, list[StravaActivity]] = defaultdict(list)
    for activity in activities:
        grouped[planning.week_start_for(activity.start_date_local.date())].append(activity)
    return grouped


def metadata_weeks_in_range(
    db: Session, athlete_account_id: str, start: date, end: date
) -> dict[date, TrainingWeek]:
    weeks = db.scalars(
        select(TrainingWeek)
        .where(
            TrainingWeek.athlete_account_id == athlete_account_id,
            TrainingWeek.week_start_date >= start,
            TrainingWeek.week_start_date <= end,
        )
        .options(selectinload(TrainingWeek.goals))
    ).all()
    return {week.week_start_date: week for week in weeks}


def summarize_week(
    week_start: date,
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    today: date,
) -> dict:
    week_end = planning.week_end_for(week_start)
    week_state = (
        "future" if today < week_start else "past" if today > week_end else "current"
    )
    run_workouts = [workout for workout in workouts if workout.sport == "run"]
    planned_mileage = round(sum(workout.planned_distance or 0 for workout in run_workouts), 1)
    run_activities = [activity for activity in activities if planning.is_run_activity(activity)]
    actual_mileage = round(sum(activity.distance / 1609.344 for activity in run_activities), 1)
    hard_dates = {
        workout.planned_date for workout in workouts if planning.is_quality_workout(workout)
    }
    actual_hard_dates = {
        activity.start_date_local.date()
        for activity in activities
        if planning.is_quality_activity(activity)
    }
    planned_training_dates = {
        workout.planned_date for workout in workouts if workout.sport != "rest"
    }
    actual_training_dates = {
        activity.start_date_local.date()
        for activity in activities
        if planning.is_training_activity(activity)
    }
    long_run = round(
        max((workout.planned_distance or 0 for workout in run_workouts), default=0),
        1,
    )
    long_run_percentage = (
        round((long_run / planned_mileage) * 100, 1) if planned_mileage else 0
    )
    comparison_mileage = (
        actual_mileage if week_state == "past" else planned_mileage or actual_mileage
    )

    return {
        "week_start_date": week_start,
        "week_end_date": week_end,
        "week_state": week_state,
        "planned_mileage": planned_mileage,
        "actual_mileage": actual_mileage,
        "comparison_mileage": comparison_mileage,
        "hard_days": len(hard_dates),
        "actual_hard_days": len(actual_hard_dates),
        "rest_days": 7 - len(planned_training_dates),
        "actual_rest_days": 7 - len(actual_training_dates),
        "has_back_to_back_hard_days": planning.has_back_to_back_dates(hard_dates),
        "long_run_distance": long_run,
        "long_run_percentage": long_run_percentage,
        "load_risk": "clear",
        "long_run_risk": risk_for_long_run(long_run_percentage),
        "intensity_risk": risk_for_intensity(
            len(hard_dates),
            planning.has_back_to_back_dates(hard_dates),
        ),
        "recovery_risk": risk_for_recovery(7 - len(planned_training_dates)),
        "has_plan": bool(workouts),
        "has_actuals": bool(activities),
    }


def load_band_for(summaries: list[dict], anchor: date) -> dict:
    actual_miles = [
        summary["actual_mileage"]
        for summary in summaries
        if summary["week_start_date"] < anchor and summary["actual_mileage"] > 0
    ][-4:]
    planned_miles: list[float] = []
    if actual_miles:
        baseline = round(sum(actual_miles) / len(actual_miles), 1)
    else:
        planned_miles = [
            summary["planned_mileage"]
            for summary in summaries
            if summary["week_start_date"] < anchor and summary["planned_mileage"] > 0
        ][-4:]
        baseline = round(sum(planned_miles) / len(planned_miles), 1) if planned_miles else None

    band = {
        "baseline_mileage": baseline,
        "floor_mileage": round(baseline * 0.85, 1) if baseline is not None else None,
        "ceiling_mileage": round(baseline * 1.1, 1) if baseline is not None else None,
        "watch_ceiling_mileage": round(baseline * (1 + LOAD_WATCH_JUMP), 1)
        if baseline is not None
        else None,
        "revise_ceiling_mileage": round(baseline * (1 + LOAD_REVISE_JUMP), 1)
        if baseline is not None
        else None,
        "source_weeks": len(actual_miles) or len(planned_miles),
    }

    for summary in summaries:
        if summary["week_start_date"] >= anchor:
            summary["load_risk"] = risk_for_load(summary["comparison_mileage"], baseline)

    return band


def goal_reliability_for(
    db: Session,
    athlete_account_id: str,
    start: date,
    end: date,
    weeks_by_start: dict[date, TrainingWeek],
) -> list[dict]:
    if end < start:
        return []

    goals = db.scalars(
        select(WeekGoal)
        .where(
            WeekGoal.athlete_account_id == athlete_account_id,
            WeekGoal.week_start_date >= start,
            WeekGoal.week_start_date <= end,
            WeekGoal.is_enabled == 1,
        )
    ).all()
    grouped: dict[str, Counter] = defaultdict(Counter)
    for goal in goals:
        week = weeks_by_start.get(goal.week_start_date)
        if not week:
            continue
        evaluations = [
            planning.evaluate_goal(
                candidate,
                week,
                list(week.workouts),
                planning.activities_for_week(db, week),
                planning.get_week_state(week),
            )
            for candidate in week.goals
            if candidate.is_enabled
        ]
        evaluation = next(
            (candidate for candidate in evaluations if candidate["goal_id"] == goal.id),
            None,
        )
        status = evaluation["status"] if evaluation else goal.status
        grouped[goal.category][normalize_goal_status(status)] += 1
        grouped[goal.category]["total"] += 1

    return [
        {
            "category": category,
            "achieved": counts["achieved"],
            "on_track": counts["on_track"],
            "at_risk": counts["at_risk"],
            "missed": counts["missed"],
            "exceeded": counts["exceeded"],
            "waived": counts["waived"],
            "total": counts["total"],
        }
        for category, counts in sorted(grouped.items())
    ]


def build_insights(summaries: list[dict], load_band: dict, anchor: date) -> list[dict]:
    future = [summary for summary in summaries if summary["week_start_date"] >= anchor]
    insights: list[dict] = []
    for summary in future:
        if summary["load_risk"] != "clear":
            ceiling = load_band.get("watch_ceiling_mileage")
            detail = (
                f"{summary['comparison_mileage']} planned miles is above the "
                f"{ceiling} mi watch band."
                if ceiling
                else "The planned load is above the recent training baseline."
            )
            insights.append(
                insight(
                    "load",
                    "Planned load is outside the corridor",
                    detail,
                    "Scale the week down or make the next week a controlled build.",
                    summary["load_risk"],
                    summary["week_start_date"],
                )
            )
            break

    long_run = next((summary for summary in future if summary["long_run_risk"] != "clear"), None)
    if long_run:
        insights.append(
            insight(
                "long-run",
                "Long run is carrying too much of the week",
                (
                    f"{long_run['long_run_distance']} mi is "
                    f"{long_run['long_run_percentage']}% of weekly volume."
                ),
                "Grow total mileage around it or cap the long run before saving the week.",
                long_run["long_run_risk"],
                long_run["week_start_date"],
            )
        )

    intensity = next((summary for summary in future if summary["intensity_risk"] != "clear"), None)
    if intensity:
        reason = (
            "Back-to-back hard days are planned."
            if intensity["has_back_to_back_hard_days"]
            else f"{intensity['hard_days']} hard days are planned."
        )
        insights.append(
            insight(
                "intensity",
                "Quality density needs attention",
                reason,
                "Separate hard days or convert one session to easy mileage.",
                intensity["intensity_risk"],
                intensity["week_start_date"],
            )
        )

    recovery = next((summary for summary in future if summary["recovery_risk"] != "clear"), None)
    if recovery:
        insights.append(
            insight(
                "recovery",
                "Recovery is not protected",
                "No rest day is planned in this week.",
                "Add a true rest day or mark an intentional recovery session.",
                recovery["recovery_risk"],
                recovery["week_start_date"],
            )
        )

    if not insights and any(summary["has_plan"] for summary in future):
        insights.append(clear_primary_insight(anchor))
    elif not insights:
        insights.append(
            insight(
                "future-plan",
                "Plan future weeks to evaluate fit",
                "The next planning window does not have saved workouts yet.",
                "Add the next week plan, then use this tab to check load and recovery.",
                "watch",
                anchor,
            )
        )
    return sorted(insights, key=lambda item: risk_rank(item["risk_level"]), reverse=True)


def clear_primary_insight(anchor: date) -> dict:
    return insight(
        "all-clear",
        "Upcoming plan fits the current corridor",
        "No load, long-run, intensity, or recovery warnings are active in the planning window.",
        "Keep the next week controlled and review again after the next Strava sync.",
        "clear",
        anchor,
    )


def insight(
    metric: str,
    title: str,
    detail: str,
    recommendation: str,
    risk_level: str,
    week_start_date: date | None,
) -> dict:
    return {
        "id": f"{metric}-{uuid4()}",
        "title": title,
        "detail": detail,
        "recommendation": recommendation,
        "risk_level": risk_level,
        "week_start_date": week_start_date,
        "metric": metric,
    }


def risk_for_load(mileage: float, baseline: float | None) -> str:
    if not baseline or mileage <= 0:
        return "clear"
    if mileage > baseline * (1 + LOAD_REVISE_JUMP):
        return "revise"
    if mileage > baseline * (1 + LOAD_WATCH_JUMP):
        return "watch"
    return "clear"


def risk_for_long_run(percentage: float) -> str:
    if percentage > LONG_RUN_REVISE_PERCENT:
        return "revise"
    if percentage > LONG_RUN_WATCH_PERCENT:
        return "watch"
    return "clear"


def risk_for_intensity(hard_days: int, has_back_to_back_hard_days: bool) -> str:
    if has_back_to_back_hard_days:
        return "revise"
    if hard_days > MAX_HARD_DAYS:
        return "watch"
    return "clear"


def risk_for_recovery(rest_days: int) -> str:
    return "revise" if rest_days <= 0 else "clear"


def normalize_goal_status(status: str) -> str:
    if status == "partially_achieved":
        return "missed"
    if status in {"achieved", "on_track", "at_risk", "missed", "exceeded", "waived"}:
        return status
    return "at_risk"


def risk_rank(risk_level: str) -> int:
    return {"revise": 3, "watch": 2, "clear": 1}.get(risk_level, 0)
