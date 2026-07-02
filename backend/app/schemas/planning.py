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
WeekPurpose = Literal[
    "aerobic_build",
    "maintain",
    "down_week",
    "workout_focus",
    "long_run_focus",
    "recovery",
    "race_week",
    "custom",
]
FieldSource = Literal["manual", "plan"]
RaceDistance = Literal["5k", "10k", "half_marathon", "marathon", "other"]
RacePriority = Literal["A", "B", "C"]
PlanStatus = Literal["active", "completed", "archived"]
MesocyclePhase = Literal["base", "build", "specific", "taper", "race", "recovery", "maintenance"]
PlanGoalCategory = Literal[
    "race_time",
    "peak_weekly_mileage",
    "weekly_mileage_progression",
    "long_run_progression",
    "consistency",
    "custom",
]
PlanPreviewAction = Literal["create", "annotate", "update", "skip_overridden", "unlink"]
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
    purpose: WeekPurpose | str | None = None
    target_mileage: float | None = Field(default=None, ge=0)
    target_long_run_distance: float | None = Field(default=None, ge=0)
    is_down_week: bool | None = None


class PlanWeekWorkout(PlannedWorkoutBase):
    pass


class PlanWeekGoal(WeekGoalBase):
    pass


class PlanWeekSave(ApiModel):
    purpose: WeekPurpose | str = "maintain"
    custom_purpose: str = ""
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
    mesocycle_id: str | None = None
    purpose: WeekPurpose | str
    purpose_source: FieldSource
    target_mileage: float | None = None
    target_mileage_source: FieldSource
    target_long_run_distance: float | None = None
    target_long_run_source: FieldSource
    is_down_week: bool
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


class GoalRaceBase(ApiModel):
    name: str = Field(min_length=1, max_length=140)
    race_date: date
    distance: RaceDistance = "half_marathon"
    distance_miles: float | None = Field(default=None, ge=0)
    target_time: int | None = Field(default=None, ge=0)
    priority: RacePriority = "A"
    location: str = ""
    altitude_context: str = ""
    notes: str = ""


class GoalRaceCreate(GoalRaceBase):
    pass


class GoalRaceUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=140)
    race_date: date | None = None
    distance: RaceDistance | None = None
    distance_miles: float | None = Field(default=None, ge=0)
    target_time: int | None = Field(default=None, ge=0)
    priority: RacePriority | None = None
    location: str | None = None
    altitude_context: str | None = None
    notes: str | None = None


class GoalRaceRead(GoalRaceBase):
    id: str
    athlete_account_id: str
    target_pace_seconds_per_mile: float | None = None
    created_at: str
    updated_at: str


class MesocycleSpec(ApiModel):
    id: str | None = None
    order_index: int = Field(ge=0)
    name: str = ""
    phase: MesocyclePhase
    start_date: date
    end_date: date
    target_mileage_start: float | None = Field(default=None, ge=0)
    target_mileage_end: float | None = Field(default=None, ge=0)
    long_run_start: float | None = Field(default=None, ge=0)
    long_run_end: float | None = Field(default=None, ge=0)
    down_week_cadence: int | None = Field(default=None, ge=1)
    down_week_reduction_pct: float = Field(default=20, ge=0, le=100)
    notes: str = ""


class MesocycleRead(MesocycleSpec):
    id: str
    training_plan_id: str
    athlete_account_id: str
    created_at: str
    updated_at: str


class PlanGoalSpec(ApiModel):
    id: str | None = None
    category: PlanGoalCategory
    label: str = Field(min_length=1, max_length=140)
    target_value: float | None = None
    unit: WeekGoalUnit | Literal["time"] = "custom"
    flows_down: bool = True
    notes: str = ""


class PlanGoalRead(PlanGoalSpec):
    id: str
    training_plan_id: str
    athlete_account_id: str
    created_at: str
    updated_at: str


class TrainingPlanSpec(ApiModel):
    name: str = Field(min_length=1, max_length=140)
    description: str = ""
    goal_race_id: str | None = None
    goal_race: GoalRaceCreate | None = None
    start_date: date
    end_date: date
    status: PlanStatus = "active"
    notes: str = ""
    mesocycles: list[MesocycleSpec] = Field(min_length=1)
    plan_goals: list[PlanGoalSpec] = []


class TrainingPlanMetadataPatch(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=140)
    description: str | None = None
    status: PlanStatus | None = None
    notes: str | None = None


class ScaffoldPreviewChangeRead(ApiModel):
    field: str
    from_value: str | float | int | bool | None = Field(default=None, alias="from")
    to_value: str | float | int | bool | None = Field(default=None, alias="to")


class ScaffoldPreviewWeekRead(ApiModel):
    week_start_date: date
    action: PlanPreviewAction
    changes: list[ScaffoldPreviewChangeRead] = []
    warnings: list[str] = []


class ScaffoldPreviewRead(ApiModel):
    weeks: list[ScaffoldPreviewWeekRead]
    warnings: list[str] = []


class PlanWeekSummaryRead(ApiModel):
    week_start_date: date
    week_end_date: date
    mesocycle_id: str | None = None
    mesocycle_name: str | None = None
    mesocycle_phase: MesocyclePhase | None = None
    week_index_in_mesocycle: int | None = None
    mesocycle_week_count: int | None = None
    planned_mileage: float
    actual_mileage: float
    target_mileage: float | None = None
    target_long_run_distance: float | None = None
    purpose: WeekPurpose | str
    purpose_source: FieldSource
    target_mileage_source: FieldSource
    target_long_run_source: FieldSource
    is_down_week: bool
    has_manual_override: bool
    warning: str | None = None


class TrainingPlanSummaryRead(ApiModel):
    id: str
    athlete_account_id: str
    name: str
    description: str
    goal_race_id: str | None = None
    goal_race_name: str | None = None
    start_date: date
    end_date: date
    status: PlanStatus
    notes: str
    is_current: bool
    is_upcoming: bool
    created_at: str
    updated_at: str


class TrainingPlanRead(TrainingPlanSummaryRead):
    goal_race: GoalRaceRead | None = None
    mesocycles: list[MesocycleRead]
    plan_goals: list[PlanGoalRead]
    week_summaries: list[PlanWeekSummaryRead]
