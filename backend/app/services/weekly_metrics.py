from dataclasses import dataclass
from datetime import date, timedelta

from app.goal_metrics import GOAL_METRICS, GoalMetricKey
from app.models.planning import PlannedWorkout
from app.models.strava import StravaActivity

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
CALCULATOR_VERSION = 1


@dataclass(frozen=True)
class WeeklyMetricMeasurement:
    metric_key: GoalMetricKey
    unit: str
    planned: float
    actual: float
    projected: float
    remaining: float | None = None
    contributing_workout_ids: tuple[str, ...] = ()
    contributing_activity_ids: tuple[str, ...] = ()

    def value_for(self, week_state: str) -> float:
        if week_state == "past":
            return self.actual
        if week_state == "future":
            return self.planned
        return self.projected


def calculate_weekly_metrics(
    workouts: list[PlannedWorkout],
    activities: list[StravaActivity],
    *,
    today: date,
) -> dict[GoalMetricKey, WeeklyMetricMeasurement]:
    run_workouts = [workout for workout in workouts if workout.sport == "run"]
    run_activities = [activity for activity in activities if is_run_activity(activity)]
    training_workouts = [workout for workout in workouts if workout.sport != "rest"]
    training_activities = [activity for activity in activities if is_training_activity(activity)]
    quality_workouts = [workout for workout in workouts if is_quality_workout(workout)]
    quality_activities = [activity for activity in activities if is_quality_activity(activity)]
    strength_workouts = [workout for workout in workouts if is_strength_workout(workout)]
    strength_activities = [activity for activity in activities if is_strength_activity(activity)]

    completed_run_dates = {activity.start_date_local.date() for activity in run_activities}
    actual_training_dates = {activity.start_date_local.date() for activity in training_activities}
    manually_completed_training_workouts = [
        workout
        for workout in training_workouts
        if is_manually_completed_workout(workout)
        and workout.planned_date not in actual_training_dates
    ]
    actual_training_dates |= {
        workout.planned_date for workout in manually_completed_training_workouts
    }
    planned_training_dates = {workout.planned_date for workout in training_workouts}
    remaining_training_workouts = [
        workout
        for workout in training_workouts
        if workout.planned_date >= today
        and workout.planned_date not in actual_training_dates
        and not is_manually_completed_workout(workout)
    ]
    projected_training_dates = actual_training_dates | {
        workout.planned_date for workout in remaining_training_workouts
    }

    planned_quality_dates = {workout.planned_date for workout in quality_workouts}
    actual_quality_dates = {activity.start_date_local.date() for activity in quality_activities}
    # A normal run logged on a planned hard day still fulfills that hard day.
    actual_quality_dates |= {
        activity.start_date_local.date()
        for activity in run_activities
        if activity.start_date_local.date() in planned_quality_dates
    }
    actual_quality_dates |= {
        workout.planned_date
        for workout in quality_workouts
        if is_manually_completed_workout(workout)
    }
    remaining_quality_dates = {
        workout.planned_date
        for workout in quality_workouts
        if workout.planned_date >= today
        and workout.planned_date not in actual_quality_dates
        and not is_manually_completed_workout(workout)
    }
    projected_quality_dates = actual_quality_dates | remaining_quality_dates

    manually_completed_run_workouts = [
        workout
        for workout in run_workouts
        if is_manually_completed_workout(workout)
        and workout.planned_date not in completed_run_dates
    ]
    remaining_run_workouts = [
        workout
        for workout in run_workouts
        if workout.planned_date >= today
        and workout.planned_date not in completed_run_dates
        and not is_manually_completed_workout(workout)
    ]
    planned_miles = round(sum(workout.planned_distance or 0 for workout in run_workouts), 1)
    actual_miles = round(
        sum(activity.distance / 1609.344 for activity in run_activities)
        + sum(workout.planned_distance or 0 for workout in manually_completed_run_workouts),
        1,
    )
    remaining_miles = round(
        sum(workout.planned_distance or 0 for workout in remaining_run_workouts), 1
    )
    projected_miles = round(actual_miles + remaining_miles, 1)

    planned_longest = round(
        max((workout.planned_distance or 0 for workout in run_workouts), default=0), 1
    )
    actual_longest = round(
        max(
            [activity.distance / 1609.344 for activity in run_activities]
            + [workout.planned_distance or 0 for workout in manually_completed_run_workouts],
            default=0,
        ),
        1,
    )
    remaining_longest = round(
        max((workout.planned_distance or 0 for workout in remaining_run_workouts), default=0),
        1,
    )
    projected_longest = max(actual_longest, remaining_longest)

    actual_strength_dates = {
        activity.start_date_local.date() for activity in strength_activities
    }
    manually_completed_strength_workouts = [
        workout
        for workout in strength_workouts
        if is_manually_completed_workout(workout)
        and workout.planned_date not in actual_strength_dates
    ]
    remaining_strength_workouts = [
        workout
        for workout in strength_workouts
        if workout.planned_date >= today
        and not is_manually_completed_workout(workout)
        and not any(
            activity.start_date_local.date() == workout.planned_date
            for activity in strength_activities
        )
    ]

    return {
        "weekly_run_distance": measurement(
            "weekly_run_distance",
            planned_miles,
            actual_miles,
            projected_miles,
            remaining=remaining_miles,
            workouts=run_workouts,
            activities=run_activities,
        ),
        "training_session_count": measurement(
            "training_session_count",
            len(training_workouts),
            len(training_activities) + len(manually_completed_training_workouts),
            len(training_activities)
            + len(manually_completed_training_workouts)
            + len(remaining_training_workouts),
            remaining=len(remaining_training_workouts),
            workouts=training_workouts,
            activities=training_activities,
        ),
        "longest_run_distance": measurement(
            "longest_run_distance",
            planned_longest,
            actual_longest,
            projected_longest,
            remaining=remaining_longest,
            workouts=run_workouts,
            activities=run_activities,
        ),
        "hard_training_day_count": measurement(
            "hard_training_day_count",
            len(planned_quality_dates),
            len(actual_quality_dates),
            len(projected_quality_dates),
            remaining=len(remaining_quality_dates),
            workouts=quality_workouts,
            activities=quality_activities,
        ),
        "rest_day_count": measurement(
            "rest_day_count",
            7 - len(planned_training_dates),
            7 - len(actual_training_dates),
            7 - len(projected_training_dates),
            workouts=training_workouts,
            activities=training_activities,
        ),
        "strength_session_count": measurement(
            "strength_session_count",
            len(strength_workouts),
            len(strength_activities) + len(manually_completed_strength_workouts),
            len(strength_activities)
            + len(manually_completed_strength_workouts)
            + len(remaining_strength_workouts),
            remaining=len(remaining_strength_workouts),
            workouts=strength_workouts,
            activities=strength_activities,
        ),
        "long_run_share": measurement(
            "long_run_share",
            percentage(planned_longest, planned_miles),
            percentage(actual_longest, actual_miles),
            percentage(projected_longest, projected_miles),
            workouts=run_workouts,
            activities=run_activities,
        ),
        "back_to_back_hard_pairs": measurement(
            "back_to_back_hard_pairs",
            count_back_to_back_pairs(planned_quality_dates),
            count_back_to_back_pairs(actual_quality_dates),
            count_back_to_back_pairs(projected_quality_dates),
            workouts=quality_workouts,
            activities=quality_activities,
        ),
    }


def measurement(
    metric_key: GoalMetricKey,
    planned: float,
    actual: float,
    projected: float,
    *,
    remaining: float | None = None,
    workouts: list[PlannedWorkout] | None = None,
    activities: list[StravaActivity] | None = None,
) -> WeeklyMetricMeasurement:
    return WeeklyMetricMeasurement(
        metric_key=metric_key,
        unit=GOAL_METRICS[metric_key].unit,
        planned=planned,
        actual=actual,
        projected=projected,
        remaining=remaining,
        contributing_workout_ids=tuple(workout.id for workout in workouts or []),
        contributing_activity_ids=tuple(activity.id for activity in activities or []),
    )


def percentage(numerator: float, denominator: float) -> float:
    return round((numerator / denominator) * 100, 1) if denominator else 0


def normalized_sport(value: str) -> str:
    return value.replace("_", "").replace(" ", "").lower()


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


def is_strength_workout(workout: PlannedWorkout) -> bool:
    return workout.sport in {"strength", "mobility"} or workout.workout_type in {
        "strength",
        "mobility",
    }


def is_manually_completed_workout(workout: PlannedWorkout) -> bool:
    return workout.status in {"completed_as_planned", "completed_modified", "partial"}


def is_quality_activity(activity: StravaActivity) -> bool:
    name = activity.name.lower()
    return is_run_activity(activity) and any(keyword in name for keyword in QUALITY_KEYWORDS)


def is_quality_workout(workout: PlannedWorkout) -> bool:
    return (
        workout.intensity_category in {"workout", "race"}
        or workout.workout_type in QUALITY_WORKOUT_TYPES
    )


def count_back_to_back_pairs(values: set[date]) -> int:
    return sum(1 for day in values if day + timedelta(days=1) in values)


def has_back_to_back_dates(values: set[date]) -> bool:
    return count_back_to_back_pairs(values) > 0
