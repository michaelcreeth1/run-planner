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


class TrainingWeekPatch(ApiModel):
    notes: str | None = None
    target_long_run_distance: float | None = Field(default=None, ge=0)


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
    hard_days: int
    long_run_distance: float
    long_run_percentage: float


class WeekListRead(ApiModel):
    weeks: list[TrainingWeekRead]
