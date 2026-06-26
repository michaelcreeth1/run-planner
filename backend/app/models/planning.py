from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def new_id() -> str:
    return str(uuid4())


class AthleteAccount(Base):
    __tablename__ = "athlete_accounts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    timezone: Mapped[str] = mapped_column(String, nullable=False, default="America/Denver")
    strava_athlete_id: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    weeks: Mapped[list["TrainingWeek"]] = relationship(back_populates="athlete")


class TrainingWeek(Base):
    __tablename__ = "training_weeks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    athlete_account_id: Mapped[str] = mapped_column(
        ForeignKey("athlete_accounts.id"),
        nullable=False,
    )
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    week_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_mileage: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    actual_mileage: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    planned_time: Mapped[int | None] = mapped_column(Integer)
    actual_time: Mapped[int | None] = mapped_column(Integer)
    target_long_run_distance: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    athlete: Mapped[AthleteAccount] = relationship(back_populates="weeks")
    workouts: Mapped[list["PlannedWorkout"]] = relationship(
        back_populates="training_week",
        cascade="all, delete-orphan",
        order_by="PlannedWorkout.planned_date",
    )
    goals: Mapped[list["WeekGoal"]] = relationship(
        back_populates="training_week",
        cascade="all, delete-orphan",
        order_by="WeekGoal.created_at",
    )


class WeekGoal(Base):
    __tablename__ = "week_goals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    training_week_id: Mapped[str] = mapped_column(ForeignKey("training_weeks.id"), nullable=False)
    athlete_account_id: Mapped[str] = mapped_column(
        ForeignKey("athlete_accounts.id"),
        nullable=False,
    )
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    goal_type: Mapped[str] = mapped_column(String, nullable=False, default="achievement")
    label: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    target_value: Mapped[float | None] = mapped_column(Float)
    min_acceptable: Mapped[float | None] = mapped_column(Float)
    max_acceptable: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String, nullable=False, default="custom")
    evaluation_mode: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    priority: Mapped[str] = mapped_column(String, nullable=False, default="secondary")
    status: Mapped[str] = mapped_column(String, nullable=False, default="not_started")
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    is_editable: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_enabled: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    training_week: Mapped[TrainingWeek] = relationship(back_populates="goals")


class PlannedWorkout(Base):
    __tablename__ = "planned_workouts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    training_week_id: Mapped[str] = mapped_column(ForeignKey("training_weeks.id"), nullable=False)
    athlete_account_id: Mapped[str] = mapped_column(
        ForeignKey("athlete_accounts.id"),
        nullable=False,
    )
    planned_date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    sport: Mapped[str] = mapped_column(String, nullable=False, default="run")
    workout_type: Mapped[str] = mapped_column(String, nullable=False, default="easy")
    intensity_category: Mapped[str] = mapped_column(String, nullable=False, default="easy")
    planned_distance: Mapped[float | None] = mapped_column(Float)
    planned_duration: Mapped[int | None] = mapped_column(Integer)
    planned_elevation: Mapped[float | None] = mapped_column(Float)
    planned_tss: Mapped[float | None] = mapped_column(Float)
    purpose: Mapped[str] = mapped_column(Text, nullable=False, default="")
    instructions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String, nullable=False, default="planned")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    training_week: Mapped[TrainingWeek] = relationship(back_populates="workouts")
    steps: Mapped[list["PlannedWorkoutStep"]] = relationship(
        back_populates="planned_workout",
        cascade="all, delete-orphan",
        order_by="PlannedWorkoutStep.step_order",
    )


class PlannedWorkoutStep(Base):
    __tablename__ = "planned_workout_steps"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    planned_workout_id: Mapped[str] = mapped_column(
        ForeignKey("planned_workouts.id"),
        nullable=False,
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    duration: Mapped[int | None] = mapped_column(Integer)
    distance: Mapped[float | None] = mapped_column(Float)
    target_pace_min: Mapped[str | None] = mapped_column(String)
    target_pace_max: Mapped[str | None] = mapped_column(String)
    target_hr_min: Mapped[int | None] = mapped_column(Integer)
    target_hr_max: Mapped[int | None] = mapped_column(Integer)
    target_rpe: Mapped[int | None] = mapped_column(Integer)
    repetition_group: Mapped[str | None] = mapped_column(String)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")

    planned_workout: Mapped[PlannedWorkout] = relationship(back_populates="steps")


class WorkoutTemplate(Base):
    __tablename__ = "workout_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    athlete_account_id: Mapped[str] = mapped_column(
        ForeignKey("athlete_accounts.id"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    workout_type: Mapped[str] = mapped_column(String, nullable=False, default="easy")
    default_distance: Mapped[float | None] = mapped_column(Float)
    default_duration: Mapped[int | None] = mapped_column(Integer)
    default_steps: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    default_purpose: Mapped[str] = mapped_column(Text, nullable=False, default="")
    default_instructions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tags: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )
