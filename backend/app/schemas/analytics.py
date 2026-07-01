from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.planning import WeekGoalCategory


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


AnalyticsRiskLevel = Literal["clear", "watch", "revise"]


class AnalyticsInsightRead(ApiModel):
    id: str
    title: str
    detail: str
    recommendation: str
    risk_level: AnalyticsRiskLevel
    week_start_date: date | None = None
    metric: str


class AnalyticsLoadBandRead(ApiModel):
    baseline_mileage: float | None = None
    floor_mileage: float | None = None
    ceiling_mileage: float | None = None
    watch_ceiling_mileage: float | None = None
    revise_ceiling_mileage: float | None = None
    source_weeks: int


class AnalyticsGoalReliabilityRead(ApiModel):
    category: WeekGoalCategory
    achieved: int = 0
    on_track: int = 0
    at_risk: int = 0
    missed: int = 0
    exceeded: int = 0
    waived: int = 0
    total: int = 0


class AnalyticsWeekSummaryRead(ApiModel):
    week_start_date: date
    week_end_date: date
    week_state: Literal["past", "current", "future"]
    planned_mileage: float
    actual_mileage: float
    comparison_mileage: float
    hard_days: int
    actual_hard_days: int
    rest_days: int
    actual_rest_days: int
    has_back_to_back_hard_days: bool
    long_run_distance: float
    long_run_percentage: float
    load_risk: AnalyticsRiskLevel
    long_run_risk: AnalyticsRiskLevel
    intensity_risk: AnalyticsRiskLevel
    recovery_risk: AnalyticsRiskLevel
    has_plan: bool
    has_actuals: bool


class AnalyticsPlanningRead(ApiModel):
    anchor_week_start_date: date
    generated_at: str
    lookback_weeks: int
    future_weeks: int
    primary_recommendation: AnalyticsInsightRead
    insights: list[AnalyticsInsightRead]
    load_band: AnalyticsLoadBandRead
    weeks: list[AnalyticsWeekSummaryRead]
    goal_reliability: list[AnalyticsGoalReliabilityRead]
