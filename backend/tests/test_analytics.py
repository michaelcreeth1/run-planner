from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, SessionLocal
from app.main import app
from app.models import AthleteAccount, StravaActivity, TrainingWeek
from app.schemas.planning import PlannedWorkoutCreate
from app.services import analytics, planning


def login(client: TestClient, username: str = "michael", password: str = "test-password") -> None:
    response = client.post(
        "/api/auth/session/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200


def make_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    return testing_session()


def test_analytics_endpoint_is_read_only() -> None:
    with TestClient(app) as client:
        login(client)
        with SessionLocal() as db:
            before = len(db.scalars(select(TrainingWeek)).all())

        response = client.get("/api/analytics/planning?lookbackWeeks=2&futureWeeks=2")

        assert response.status_code == 200
        body = response.json()
        assert body["weeks"]
        assert body["primaryRecommendation"]["recommendation"]
        with SessionLocal() as db:
            after = len(db.scalars(select(TrainingWeek)).all())
        assert after == before


def test_analytics_aggregates_load_flags_and_excludes_deleted_activities() -> None:
    db = make_session()
    try:
        athlete = planning.ensure_default_athlete(db)
        anchor = date(2026, 6, 29)
        future = anchor + timedelta(days=7)
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=future,
                title="Long 12",
                workout_type="long_run",
                planned_distance=12,
            ),
            athlete.id,
        )
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=future + timedelta(days=2),
                title="Threshold 4",
                workout_type="threshold",
                intensity_category="workout",
                planned_distance=4,
            ),
            athlete.id,
        )
        db.add(
            StravaActivity(
                strava_activity_id="actual-1",
                athlete_account_id=athlete.id,
                name="Morning Run",
                sport_type="Run",
                start_date=datetime(2026, 6, 24, 12, 0, 0),
                start_date_local=datetime(2026, 6, 24, 6, 0, 0),
                distance=1609.344 * 8,
                raw_payload_json={},
            )
        )
        db.add(
            StravaActivity(
                strava_activity_id="deleted-actual",
                athlete_account_id=athlete.id,
                name="Deleted Run",
                sport_type="Run",
                start_date=datetime(2026, 6, 25, 12, 0, 0),
                start_date_local=datetime(2026, 6, 25, 6, 0, 0),
                distance=1609.344 * 30,
                raw_payload_json={},
                deleted_at=datetime(2026, 6, 26, 12, 0, 0),
            )
        )
        db.commit()

        body = analytics.planning_analytics(
            db,
            athlete.id,
            lookback_weeks=1,
            future_weeks=2,
            anchor_week_start_date=anchor,
        )

        assert body["load_band"]["baseline_mileage"] == 8
        target_week = next(week for week in body["weeks"] if week["week_start_date"] == future)
        assert target_week["planned_mileage"] == 16
        assert target_week["load_risk"] == "revise"
        assert target_week["long_run_percentage"] == 75
        assert target_week["long_run_risk"] == "revise"
        assert target_week["recovery_risk"] == "clear"
    finally:
        db.close()


def test_analytics_anchor_uses_athlete_timezone(monkeypatch: pytest.MonkeyPatch) -> None:
    db = make_session()
    try:
        athlete = planning.ensure_default_athlete(db)
        athlete.timezone = "Pacific/Kiritimati"
        db.commit()

        def fake_today_for_timezone(
            timezone_name: str | None,
            now: datetime | None = None,
        ) -> date:
            assert now is None
            assert timezone_name == "Pacific/Kiritimati"
            return date(2026, 7, 1)

        monkeypatch.setattr(planning, "today_for_timezone", fake_today_for_timezone)

        body = analytics.planning_analytics(
            db,
            athlete.id,
            lookback_weeks=1,
            future_weeks=1,
        )

        assert body["anchor_week_start_date"] == date(2026, 6, 29)
    finally:
        db.close()


def test_analytics_flags_hard_day_spacing_and_no_rest() -> None:
    db = make_session()
    try:
        athlete = planning.ensure_default_athlete(db)
        anchor = date(2026, 6, 29)
        for index in range(7):
            planning.create_workout(
                db,
                PlannedWorkoutCreate(
                    planned_date=anchor + timedelta(days=index),
                    title=f"Run {index}",
                    workout_type="threshold" if index in {1, 2} else "easy",
                    intensity_category="workout" if index in {1, 2} else "easy",
                    planned_distance=5,
                ),
                athlete.id,
            )

        body = analytics.planning_analytics(
            db,
            athlete.id,
            lookback_weeks=1,
            future_weeks=1,
            anchor_week_start_date=anchor,
        )

        current = next(week for week in body["weeks"] if week["week_start_date"] == anchor)
        assert current["has_back_to_back_hard_days"] is True
        assert current["intensity_risk"] == "revise"
        assert current["rest_days"] == 0
        assert current["recovery_risk"] == "revise"
    finally:
        db.close()


def test_analytics_keeps_profiles_isolated() -> None:
    db = make_session()
    try:
        athlete = planning.ensure_default_athlete(db)
        other = AthleteAccount(display_name="Other Runner", timezone="America/Denver")
        db.add(other)
        db.commit()
        db.refresh(other)
        anchor = date(2026, 6, 29)
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=anchor,
                title="Mine",
                planned_distance=5,
            ),
            athlete.id,
        )
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=anchor,
                title="Not mine",
                planned_distance=50,
            ),
            other.id,
        )

        body = analytics.planning_analytics(
            db,
            athlete.id,
            lookback_weeks=1,
            future_weeks=1,
            anchor_week_start_date=anchor,
        )

        current = next(week for week in body["weeks"] if week["week_start_date"] == anchor)
        assert current["planned_mileage"] == 5
    finally:
        db.close()
