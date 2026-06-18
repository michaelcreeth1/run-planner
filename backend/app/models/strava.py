from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.planning import new_id


class StravaOAuthToken(Base):
    __tablename__ = "strava_oauth_tokens"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    athlete_account_id: Mapped[str] = mapped_column(
        ForeignKey("athlete_accounts.id"),
        nullable=False,
    )
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )
    last_refresh_at: Mapped[datetime | None] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)


class StravaActivity(Base):
    __tablename__ = "strava_activities"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    strava_activity_id: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    athlete_account_id: Mapped[str] = mapped_column(
        ForeignKey("athlete_accounts.id"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    sport_type: Mapped[str] = mapped_column(String, nullable=False)
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    start_date_local: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    timezone: Mapped[str | None] = mapped_column(String)
    distance: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    moving_time: Mapped[int | None] = mapped_column(Integer)
    elapsed_time: Mapped[int | None] = mapped_column(Integer)
    total_elevation_gain: Mapped[float | None] = mapped_column(Float)
    average_speed: Mapped[float | None] = mapped_column(Float)
    max_speed: Mapped[float | None] = mapped_column(Float)
    average_heartrate: Mapped[float | None] = mapped_column(Float)
    max_heartrate: Mapped[float | None] = mapped_column(Float)
    average_cadence: Mapped[float | None] = mapped_column(Float)
    average_watts: Mapped[float | None] = mapped_column(Float)
    perceived_exertion: Mapped[float | None] = mapped_column(Float)
    private: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    trainer: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    commute: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    manual: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    raw_payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)


class SyncJob(Base):
    __tablename__ = "sync_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    athlete_account_id: Mapped[str] = mapped_column(
        ForeignKey("athlete_accounts.id"),
        nullable=False,
    )
    job_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    error_message: Mapped[str | None] = mapped_column(Text)
    activities_fetched: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    activities_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    activities_updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    activities_unchanged: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    activities_deleted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rate_limit_remaining: Mapped[int | None] = mapped_column(Integer)
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
