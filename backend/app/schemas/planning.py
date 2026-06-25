from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


Sport = Literal["run", "strength", "cross_training", "rest", "mobility", "other"]
WorkoutType = Literal[
    "easy",
    "recovery",
    "long_run",
    "medium_long",
    "tempo",
    "threshold",
    "interval",
    "hill",
    "race",
    "time_trial",
    "progression",
    "strides",
    "strength",
    "mobility",
    "rest",
    "other",
]
IntensityCategory = Literal["rest", "easy", "moderate", "workout", "race", "strength"]
WorkoutStatus = Literal[
    "planned",
    "completed_as_planned",
    "completed_modified",
    "missed",
    "moved",
    "replaced",
    "skipped_intentionally",
    "partial",
]
WeekGoalCategory = Literal[
    "mileage",
    "sessions",
    "long_run",
    "quality",
    "recovery",
    "strength",
    "custom",
]
WeekGoalType = Literal["achievement", "guardrail"]
WeekGoalUnit = Literal["mi", "sessions", "days", "percent", "boolean", "custom"]
WeekGoalEvaluationMode = Literal["at_least", "at_most", "range", "exact-ish", "boolean", "manual"]
WeekGoalPriority = Literal["primary", "secondary", "guardrail"]
WeekGoalStatus = Literal[
    "not_started",
    "on_track",
    "at_risk",
    "achieved",
    "partially_achieved",
    "missed",
    "exceeded",
    "waived",
]
WeekGoalSource = Literal["manual", "derived_from_plan", "template", "ai_suggested"]
GuardrailStatus = Literal["ok", "warning", "danger", "waived", "not_applicable"]
GoalSeverity = Literal["info", "success", "warning", "danger"]
WeekState = Literal["past", "current", "future"]


class PlannedWorkoutStepRead(ApiModel):
    id: str
    step_order: int
    label: str
    duration: int | None = None
    distance: float | None = None
    target_pace_min: str | None = None
    target_pace_max: str | None = None
    target_hr_min: int | None = None
    target_hr_max: int | None = None
    target_rpe: int | None = None
    repetition_group: str | None = None
    notes: str


class PlannedWorkoutBase(ApiModel):
    planned_date: date
    title: str = Field(min_length=1, max_length=120)
    sport: Sport = "run"
    workout_type: WorkoutType = "easy"
    intensity_category: IntensityCategory = "easy"
    planned_distance: float | None = Field(default=None, ge=0)
    planned_duration: int | None = Field(default=None, ge=0)
    planned_elevation: float | None = Field(default=None, ge=0)
    planned_tss: float | None = Field(default=None, ge=0)
    purpose: str = ""
    instructions: str = ""
    notes: str = ""
    status: WorkoutStatus = "planned"


class PlannedWorkoutCreate(PlannedWorkoutBase):
    pass


class PlannedWorkoutUpdate(ApiModel):
    planned_date: date | None = None
    title: str | None = Field(default=None, min_length=1, max_length=120)
    sport: Sport | None = None
    workout_type: WorkoutType | None = None
    intensity_category: IntensityCategory | None = None
    planned_distance: float | None = Field(default=None, ge=0)
    planned_duration: int | None = Field(default=None, ge=0)
    planned_elevation: float | None = Field(default=None, ge=0)
    planned_tss: float | None = Field(default=None, ge=0)
    purpose: str | None = None
    instructions: str | None = None
    notes: str | None = None
    status: WorkoutStatus | None = None


class PlannedWorkoutMove(ApiModel):
    planned_date: date


class PlannedWorkoutRead(PlannedWorkoutBase):
    id: str
    training_week_id: str
    athlete_account_id: str
    steps: list[PlannedWorkoutStepRead] = []


class ActualActivityRead(ApiModel):
    id: str
    strava_activity_id: str
    name: str
    sport_type: str
    start_date_local: str
    activity_date: date
    distance: float
    distance_miles: float
    moving_time: int | None = None
    average_heartrate: float | None = None


class WeekGoalBase(ApiModel):
    category: WeekGoalCategory = "custom"
    goal_type: WeekGoalType = "achievement"
    label: str = Field(min_length=1, max_length=140)
    description: str = ""
    target_value: float | None = None
    min_acceptable: float | None = None
    max_acceptable: float | None = None
    unit: WeekGoalUnit = "custom"
    evaluation_mode: WeekGoalEvaluationMode = "manual"
    priority: WeekGoalPriority = "secondary"
    status: WeekGoalStatus = "not_started"
    source: WeekGoalSource = "manual"
    is_editable: bool = True
    is_enabled: bool = True


class WeekGoalCreate(WeekGoalBase):
    pass


class WeekGoalUpdate(ApiModel):
    category: WeekGoalCategory | None = None
    goal_type: WeekGoalType | None = None
    label: str | None = Field(default=None, min_length=1, max_length=140)
    description: str | None = None
    target_value: float | None = None
    min_acceptable: float | None = None
    max_acceptable: float | None = None
    unit: WeekGoalUnit | None = None
    evaluation_mode: WeekGoalEvaluationMode | None = None
    priority: WeekGoalPriority | None = None
    status: WeekGoalStatus | None = None
    source: WeekGoalSource | None = None
    is_editable: bool | None = None
    is_enabled: bool | None = None


class WeekGoalEvaluationRead(ApiModel):
    goal_id: str
    week_start_date: date
    status: WeekGoalStatus
    guardrail_status: GuardrailStatus | None = None
    actual_value: float | None = None
    planned_value: float | None = None
    remaining_planned_value: float | None = None
    summary: str
    detail: str | None = None
    severity: GoalSeverity = "info"
    evaluated_at: str
    contributing_workout_ids: list[str] = []
    contributing_activity_ids: list[str] = []


class WeekGoalRead(WeekGoalBase):
    id: str
    training_week_id: str
    athlete_account_id: str
    week_start_date: date
    created_at: str
    updated_at: str


class TrainingWeekPatch(ApiModel):
    notes: str | None = None
    target_long_run_distance: float | None = Field(default=None, ge=0)


class PlanWeekWorkout(PlannedWorkoutBase):
    pass


class PlanWeekGoal(WeekGoalBase):
    pass


class PlanWeekSave(ApiModel):
    purpose: str = Field(min_length=1, max_length=240)
    target_long_run_distance: float | None = Field(default=None, ge=0)
    workouts: list[PlanWeekWorkout] = []
    goals: list[PlanWeekGoal] = []


class TrainingWeekRead(ApiModel):
    id: str
    week_start_date: date
    week_end_date: date
    planned_mileage: float
    actual_mileage: float
    planned_time: int | None = None
    actual_time: int | None = None
    target_long_run_distance: float | None = None
    notes: str
    workouts: list[PlannedWorkoutRead]
    actual_activities: list[ActualActivityRead]
    goals: list[WeekGoalRead]
    goal_evaluations: list[WeekGoalEvaluationRead]
    week_state: WeekState
    goal_review_summary: str
    hard_days: int
    long_run_distance: float
    long_run_percentage: float


class WeekListRead(ApiModel):
    weeks: list[TrainingWeekRead]


class TrainingTimelineMonthRead(ApiModel):
    year: int
    month: int
    has_plan: bool
    has_activities: bool
    planned_miles: float | None = None
    actual_miles: float | None = None


class TrainingTimelineRead(ApiModel):
    oldest_week_start_date: date | None
    newest_week_start_date: date | None
    months: list[TrainingTimelineMonthRead]
