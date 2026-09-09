from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.goal_metrics import (
    GOAL_METRICS,
    GoalMetricKey,
    infer_goal_metric,
    normalized_goal_thresholds,
)


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
PrescriptionRole = Literal["warmup", "work", "recovery", "cooldown", "other"]
PrescriptionExtent = Literal["distance", "duration", "open"]
PrescriptionTargetKind = Literal["pace", "heart_rate", "rpe", "guidance"]
SessionAssociation = Literal["unmatched", "suggested", "associated"]
SessionOutcome = Literal[
    "unresolved", "as_planned", "modified", "partial", "replaced", "skipped", "missed"
]
MatchProvenance = Literal["automatic", "suggested", "user_confirmed"]
EvidenceLevel = Literal[
    "activity_summary", "recorded_laps", "user_confirmation", "insufficient_data"
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
WeekGoalSource = Literal["manual", "plan", "workouts", "default"]
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


class PrescriptionTarget(ApiModel):
    """A primary target with optional supporting constraints.

    Numeric pace values are seconds per kilometre or mile only when paired
    with the display unit in the containing step.  The stored prescription
    keeps the number canonical in seconds per metre so no unit conversion can
    alter its meaning.
    """

    kind: PrescriptionTargetKind
    min_value: float | None = None
    max_value: float | None = None
    value: float | None = None
    unit: str | None = None
    guidance: str = ""


class PrescriptionStep(ApiModel):
    kind: Literal["step"] = "step"
    id: str | None = None
    role: PrescriptionRole = "other"
    extent: PrescriptionExtent
    distance_meters: float | None = Field(default=None, gt=0)
    duration_seconds: int | None = Field(default=None, gt=0)
    display_unit: Literal["m", "km", "mi", "min", "sec"] | None = None
    primary_target: PrescriptionTarget | None = None
    supporting_targets: list[PrescriptionTarget] = []
    notes: str = ""

    @model_validator(mode="after")
    def validate_extent(self):
        if self.extent == "distance":
            if self.distance_meters is None or self.duration_seconds is not None:
                raise ValueError("Distance steps require distance_meters only.")
        elif self.extent == "duration":
            if self.duration_seconds is None or self.distance_meters is not None:
                raise ValueError("Duration steps require duration_seconds only.")
        elif self.distance_meters is not None or self.duration_seconds is not None:
            raise ValueError("Open-ended steps cannot have a fixed distance or duration.")
        return self


class PrescriptionRepeatGroup(ApiModel):
    kind: Literal["repeat"] = "repeat"
    id: str | None = None
    repetitions: int = Field(ge=1, le=100)
    steps: list["PrescriptionBlock"] = Field(min_length=1)
    recovery_after_final: bool = False
    notes: str = ""


PrescriptionBlock = PrescriptionStep | PrescriptionRepeatGroup
PrescriptionRepeatGroup.model_rebuild()


class WorkoutPrescription(ApiModel):
    blocks: list[PrescriptionBlock] = Field(min_length=1)


class PrescriptionTotals(ApiModel):
    known_distance_meters: float | None = None
    known_duration_seconds: int | None = None
    has_open_ended_extent: bool = False
    distance_complete: bool
    duration_complete: bool
    summary: str


class WorkoutPrescriptionRevisionRead(ApiModel):
    id: str
    revision_number: int
    prescription: WorkoutPrescription
    calculated_totals: PrescriptionTotals
    created_at: datetime


class PlannedWorkoutBase(ApiModel):
    planned_date: date
    title: str = Field(min_length=1, max_length=120)
    sport: Sport = "run"
    workout_type: WorkoutType = "easy"
    intensity_category: IntensityCategory = "easy"
    planned_distance: float | None = Field(default=None, ge=0)
    planned_duration: int | None = Field(default=None, ge=0)
    planned_pace: int | None = Field(default=None, ge=0)
    planned_elevation: float | None = Field(default=None, ge=0)
    planned_tss: float | None = Field(default=None, ge=0)
    purpose: str = ""
    instructions: str = ""
    notes: str = ""
    status: WorkoutStatus = "planned"
    prescription: WorkoutPrescription | None = None


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
    planned_pace: int | None = Field(default=None, ge=0)
    planned_elevation: float | None = Field(default=None, ge=0)
    planned_tss: float | None = Field(default=None, ge=0)
    purpose: str | None = None
    instructions: str | None = None
    notes: str | None = None
    status: WorkoutStatus | None = None
    prescription: WorkoutPrescription | None = None
    expected_version: int | None = Field(default=None, ge=1)

    @field_validator(
        "planned_date",
        "title",
        "sport",
        "workout_type",
        "intensity_category",
        "purpose",
        "instructions",
        "notes",
        "status",
        mode="before",
    )
    @classmethod
    def reject_null_required_fields(cls, value):
        if value is None:
            raise ValueError("Field cannot be null.")
        return value


class PlannedWorkoutMove(ApiModel):
    planned_date: date


class PlannedWorkoutRead(PlannedWorkoutBase):
    id: str
    training_week_id: str
    athlete_account_id: str
    steps: list[PlannedWorkoutStepRead] = []
    current_prescription_revision: WorkoutPrescriptionRevisionRead | None = None
    version: int = 1


class WorkoutTemplateBase(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    workout_type: WorkoutType = "easy"
    tags: list[str] = []
    prescription: WorkoutPrescription
    purpose: str = ""
    instructions: str = ""


class WorkoutTemplateCreate(WorkoutTemplateBase):
    pass


class WorkoutTemplateUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    workout_type: WorkoutType | None = None
    tags: list[str] | None = None
    prescription: WorkoutPrescription | None = None
    purpose: str | None = None
    instructions: str | None = None
    expected_version: int | None = Field(default=None, ge=1)


class WorkoutTemplateRead(WorkoutTemplateBase):
    id: str
    athlete_account_id: str
    version: int
    created_at: datetime
    updated_at: datetime


class ScheduleTemplateRequest(ApiModel):
    planned_date: date
    title: str | None = Field(default=None, min_length=1, max_length=120)


class SessionRecordingInput(ApiModel):
    strava_activity_id: str
    contributes_to_totals: bool = True


class PerformedSessionBase(ApiModel):
    occurred_at: datetime
    sport: Sport = "run"
    recordings: list[SessionRecordingInput] = []
    manual_distance_meters: float | None = Field(default=None, ge=0)
    manual_duration_seconds: int | None = Field(default=None, ge=0)


class PerformedSessionCreate(PerformedSessionBase):
    planned_workout_id: str | None = None


class ReconciliationUpdate(ApiModel):
    planned_workout_id: str | None = None
    recordings: list[SessionRecordingInput] | None = None
    association: SessionAssociation = "associated"
    match_provenance: MatchProvenance = "user_confirmed"
    outcome: SessionOutcome = "unresolved"
    intensity_category: IntensityCategory | None = None
    evidence: EvidenceLevel = "user_confirmation"
    assessment_note: str = ""
    expected_version: int | None = Field(default=None, ge=1)


class PerformedSessionRead(PerformedSessionBase):
    id: str
    athlete_account_id: str
    planned_workout_id: str | None = None
    prescription_revision_id: str | None = None
    association: SessionAssociation
    match_provenance: MatchProvenance | None = None
    outcome: SessionOutcome
    intensity_category: IntensityCategory | None = None
    evidence: EvidenceLevel
    assessment_note: str
    evidence_changed: bool
    version: int
    total_distance_meters: float | None = None
    total_duration_seconds: int | None = None


class MatchSuggestion(ApiModel):
    planned_workout_id: str
    title: str
    planned_date: date
    reason: str


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
    metric_key: GoalMetricKey | None = None
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

    @model_validator(mode="after")
    def normalize_metric(self):
        metric_key = self.metric_key or infer_goal_metric(self.category, self.unit)
        if metric_key is None:
            if self.category == "custom" and self.evaluation_mode == "manual":
                return self
            raise ValueError("Automatic goals require a supported metric and unit.")

        definition = GOAL_METRICS[metric_key]
        if self.metric_key and self.category != definition.category:
            raise ValueError(f"{definition.label} must use the {definition.category} category.")
        if self.metric_key and self.unit != definition.unit:
            raise ValueError(f"{definition.label} must use {definition.unit} as its unit.")
        target, minimum, maximum = normalized_goal_thresholds(
            metric_key,
            self.evaluation_mode,
            target_value=self.target_value,
            min_acceptable=self.min_acceptable,
            max_acceptable=self.max_acceptable,
        )
        self.metric_key = metric_key
        self.category = definition.category
        self.unit = definition.unit
        self.target_value = target
        self.min_acceptable = minimum
        self.max_acceptable = maximum
        return self


class WeekGoalCreate(WeekGoalBase):
    pass


class WeekGoalUpdate(ApiModel):
    metric_key: GoalMetricKey | None = None
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

    @field_validator(
        "category",
        "goal_type",
        "label",
        "description",
        "unit",
        "evaluation_mode",
        "priority",
        "status",
        "source",
        "is_editable",
        "is_enabled",
        mode="before",
    )
    @classmethod
    def reject_null_required_fields(cls, value):
        if value is None:
            raise ValueError("Field cannot be null.")
        return value


class WeekGoalEvaluationRead(ApiModel):
    goal_id: str
    week_start_date: date
    metric_key: GoalMetricKey | None = None
    basis: Literal["planned", "actual", "projected"] | None = None
    measured_value: float | None = None
    unit: WeekGoalUnit | None = None
    evaluation_mode: WeekGoalEvaluationMode | None = None
    threshold_value: float | None = None
    threshold_min: float | None = None
    threshold_max: float | None = None
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

    @field_validator("notes", "purpose", "is_down_week", mode="before")
    @classmethod
    def reject_null_required_fields(cls, value):
        if value is None:
            raise ValueError("Field cannot be null.")
        return value


class PlanWeekWorkout(PlannedWorkoutBase):
    pass


class PlanWeekGoal(WeekGoalBase):
    pass


class PlanWeekSave(ApiModel):
    purpose: WeekPurpose | str | None = None
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
    performed_sessions: list[PerformedSessionRead] = []
    mesocycle_id: str | None = None
    purpose: WeekPurpose | str
    purpose_source: FieldSource
    target_mileage: float | None = None
    target_mileage_source: FieldSource
    target_long_run_distance: float | None = None
    target_long_run_source: FieldSource
    is_down_week: bool
    notes: str
    reviewed_at: str | None = None
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

    @field_validator(
        "name",
        "race_date",
        "distance",
        "priority",
        "location",
        "altitude_context",
        "notes",
        mode="before",
    )
    @classmethod
    def reject_null_required_fields(cls, value):
        if value is None:
            raise ValueError("Field cannot be null.")
        return value


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


class RecurringGoalSpec(ApiModel):
    id: str | None = None
    metric_key: GoalMetricKey | None = None
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
    notes: str = ""

    @model_validator(mode="after")
    def normalize_metric(self):
        metric_key = self.metric_key or infer_goal_metric(self.category, self.unit)
        if metric_key is None:
            if self.category == "custom" and self.evaluation_mode == "manual":
                return self
            raise ValueError("Automatic goals require a supported metric and unit.")

        definition = GOAL_METRICS[metric_key]
        if self.metric_key and self.category != definition.category:
            raise ValueError(f"{definition.label} must use the {definition.category} category.")
        if self.metric_key and self.unit != definition.unit:
            raise ValueError(f"{definition.label} must use {definition.unit} as its unit.")
        target, minimum, maximum = normalized_goal_thresholds(
            metric_key,
            self.evaluation_mode,
            target_value=self.target_value,
            min_acceptable=self.min_acceptable,
            max_acceptable=self.max_acceptable,
        )
        self.metric_key = metric_key
        self.category = definition.category
        self.unit = definition.unit
        self.target_value = target
        self.min_acceptable = minimum
        self.max_acceptable = maximum
        return self


class RecurringGoalRead(RecurringGoalSpec):
    id: str
    training_plan_id: str | None = None
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
    recurring_goals: list[RecurringGoalSpec] = []


class TrainingPlanMetadataPatch(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=140)
    description: str | None = None
    status: PlanStatus | None = None
    notes: str | None = None

    @field_validator("name", "description", "status", "notes", mode="before")
    @classmethod
    def reject_null_required_fields(cls, value):
        if value is None:
            raise ValueError("Field cannot be null.")
        return value


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
    week_summaries: list[PlanWeekSummaryRead]
    warnings: list[str] = []


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
    recurring_goals: list[RecurringGoalRead]
    week_summaries: list[PlanWeekSummaryRead]
