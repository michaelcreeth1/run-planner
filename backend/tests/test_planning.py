from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.main import app
from app.models import PlannedWorkoutStep, StravaActivity
from app.schemas.planning import PlannedWorkoutCreate
from app.services import planning


def make_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    return testing_session()


def test_current_week_and_workout_crud() -> None:
    with TestClient(app) as client:
        week_response = client.get("/api/weeks/current")
        assert week_response.status_code == 200
        week = week_response.json()
        assert week["id"]

        planned_date = week["weekStartDate"]
        starting_mileage = week["plannedMileage"]
        starting_time = week["plannedTime"] or 0
        create_response = client.post(
            "/api/planned-workouts",
            json={
                "plannedDate": planned_date,
                "title": "Easy 6",
                "sport": "run",
                "workoutType": "easy",
                "intensityCategory": "easy",
                "plannedDistance": 6,
                "plannedDuration": 2700,
                "purpose": "Aerobic maintenance",
            },
        )
        assert create_response.status_code == 201
        workout = create_response.json()
        assert workout["title"] == "Easy 6"

        refreshed_week = client.get(f"/api/weeks/{planned_date}").json()
        assert refreshed_week["plannedMileage"] == starting_mileage + 6
        assert refreshed_week["plannedTime"] == starting_time + 2700

        next_day = (date.fromisoformat(planned_date) + timedelta(days=1)).isoformat()
        move_response = client.post(
            f"/api/planned-workouts/{workout['id']}/move",
            json={"plannedDate": next_day},
        )
        assert move_response.status_code == 200
        assert move_response.json()["plannedDate"] == next_day

        duplicate_response = client.post(f"/api/planned-workouts/{workout['id']}/duplicate")
        assert duplicate_response.status_code == 200
        duplicate = duplicate_response.json()
        assert duplicate["title"] == "Easy 6 copy"

        delete_response = client.delete(f"/api/planned-workouts/{workout['id']}")
        assert delete_response.status_code == 204
        clone_delete_response = client.delete(f"/api/planned-workouts/{duplicate['id']}")
        assert clone_delete_response.status_code == 204


def test_training_timeline_has_no_bounds_without_real_data() -> None:
    db = make_session()
    try:
        planning.get_or_create_week(db, date(2024, 1, 1))

        timeline = planning.training_timeline(db)

        assert timeline == {
            "oldest_week_start_date": None,
            "newest_week_start_date": None,
            "months": [],
        }
    finally:
        db.close()


def test_copy_prior_week_copies_whole_plan_forward() -> None:
    db = make_session()
    try:
        source_week = planning.get_or_create_week(db, date(2024, 3, 4))
        source_week.notes = "Cutback week"
        source_week.target_long_run_distance = 8
        db.commit()

        workout = planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=date(2024, 3, 6),
                title="Threshold 5",
                workout_type="threshold",
                intensity_category="workout",
                planned_distance=5,
                planned_duration=2400,
                status="missed",
            ),
        )
        db.add(
            PlannedWorkoutStep(
                planned_workout_id=workout.id,
                step_order=1,
                label="Warm up",
                duration=600,
                notes="Keep it relaxed",
            )
        )
        target_week = planning.get_or_create_week(db, date(2024, 3, 11))
        db.commit()

        copied_week = planning.copy_prior_week(db, target_week.id)

        assert copied_week.week_start_date == date(2024, 3, 11)
        assert copied_week.notes == "Cutback week"
        assert copied_week.target_long_run_distance == 8
        assert copied_week.planned_mileage == 5
        assert len(copied_week.workouts) == 1
        copied_workout = copied_week.workouts[0]
        assert copied_workout.planned_date == date(2024, 3, 13)
        assert copied_workout.title == "Threshold 5"
        assert copied_workout.status == "planned"
        assert copied_workout.steps[0].label == "Warm up"
        assert copied_workout.steps[0].duration == 600
    finally:
        db.close()


def test_training_timeline_counts_planned_workouts() -> None:
    db = make_session()
    try:
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=date(2024, 2, 14),
                title="Easy 6",
                planned_distance=6,
            ),
        )

        timeline = planning.training_timeline(db)

        assert timeline["oldest_week_start_date"] == date(2024, 2, 12)
        assert timeline["newest_week_start_date"] == date(2024, 2, 12)
        assert timeline["months"] == [
            {
                "year": 2024,
                "month": 2,
                "has_plan": True,
                "has_activities": False,
                "planned_miles": 6,
                "actual_miles": None,
            }
        ]
    finally:
        db.close()


def test_training_timeline_counts_strava_activities() -> None:
    db = make_session()
    try:
        athlete = planning.ensure_default_athlete(db)
        db.add(
            StravaActivity(
                strava_activity_id="activity-1",
                athlete_account_id=athlete.id,
                name="Morning Run",
                sport_type="Run",
                start_date=datetime(2024, 1, 3, 15, 0, 0),
                start_date_local=datetime(2024, 1, 3, 8, 0, 0),
                distance=1609.344 * 4.2,
                raw_payload_json={},
            )
        )
        db.commit()

        timeline = planning.training_timeline(db)

        assert timeline["oldest_week_start_date"] == date(2024, 1, 1)
        assert timeline["newest_week_start_date"] == date(2024, 1, 1)
        assert timeline["months"] == [
            {
                "year": 2024,
                "month": 1,
                "has_plan": False,
                "has_activities": True,
                "planned_miles": None,
                "actual_miles": 4.2,
            }
        ]
    finally:
        db.close()
