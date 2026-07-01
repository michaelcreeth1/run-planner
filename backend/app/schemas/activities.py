from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class StravaStatus(ApiModel):
    connected: bool
    configured: bool
    athlete_name: str | None
    granted_scopes: list[str]
    expires_at: datetime | None
    message: str


class StravaBackfillRequest(ApiModel):
    days: int = Field(default=180, ge=1, le=365)


class StravaActivityRead(ApiModel):
    id: str
    strava_activity_id: str
    name: str
    sport_type: str
    start_date: datetime
    start_date_local: datetime
    distance: float
    distance_miles: float
    moving_time: int | None = None
    elapsed_time: int | None = None
    total_elevation_gain: float | None = None
    average_heartrate: float | None = None
    private: bool
    trainer: bool
    commute: bool
    manual: bool


class SyncJobRead(ApiModel):
    id: str
    job_type: str
    status: Literal["queued", "running", "succeeded", "failed", "partial", "cancelled"]
    started_at: datetime
    finished_at: datetime | None = None
    error_message: str | None = None
    activities_fetched: int
    activities_created: int
    activities_updated: int
    activities_unchanged: int
    activities_deleted: int
    rate_limit_remaining: int | None = None
