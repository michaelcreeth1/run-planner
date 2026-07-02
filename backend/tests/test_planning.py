from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, SessionLocal
from app.main import app
from app.models import PlannedWorkoutStep, StravaActivity, TrainingWeek
from app.schemas.planning import (
    PlannedWorkoutCreate,
    PlanWeekGoal,
    PlanWeekSave,
    PlanWeekWorkout,
    WeekGoalCreate,
)
from app.services import planning


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


def test_current_week_and_workout_crud() -> None:
    with TestClient(app) as client:
        login(client)
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


def test_authenticated_users_are_isolated() -> None:
    with TestClient(app) as client:
        login(client)
        admin_week = client.get("/api/weeks/current").json()
        create_response = client.post(
            "/api/planned-workouts",
            json={
                "plannedDate": admin_week["weekStartDate"],
                "title": "Admin easy 4",
                "plannedDistance": 4,
            },
        )
        assert create_response.status_code == 201
        admin_workout = create_response.json()

        user_response = client.post(
            "/api/auth/users",
            json={
                "username": "bob",
                "displayName": "Bob Runner",
                "password": "bob-password",
                "initialProfileName": "Bob",
                "timezone": "America/Denver",
            },
        )
        assert user_response.status_code == 201

        login(client, "bob", "bob-password")
        bob_week_response = client.get("/api/weeks/current")
        assert bob_week_response.status_code == 200
        bob_week = bob_week_response.json()
        assert bob_week["id"] != admin_week["id"]
        assert bob_week["plannedMileage"] == 0

        assert client.get(f"/api/planned-workouts/{admin_workout['id']}").status_code == 404
        update_response = client.patch(f"/api/weeks/{admin_week['id']}", json={"notes": "nope"})
        assert update_response.status_code == 404


def test_get_week_does_not_create_empty_week() -> None:
    with TestClient(app) as client:
        login(client)
        response = client.get("/api/weeks/2098-01-06")
        assert response.status_code == 200
        week = response.json()
        assert week["id"].startswith("virtual-week:")

        with SessionLocal() as db:
            persisted_week = db.scalars(
                select(TrainingWeek).where(
                    TrainingWeek.week_start_date == date.fromisoformat(week["weekStartDate"])
                )
            ).first()
            assert persisted_week is None


def test_save_week_plan_with_virtual_week_id_creates_real_week() -> None:
    with TestClient(app) as client:
        login(client)
        week = client.get("/api/weeks/2098-02-03").json()
        assert week["id"].startswith("virtual-week:")

        response = client.put(
            f"/api/weeks/{week['id']}/plan",
            json={
                "purpose": "Aerobic build",
                "workouts": [
                    {
                        "plannedDate": week["weekStartDate"],
                        "title": "Easy 5",
                        "plannedDistance": 5,
                    }
                ],
                "goals": [],
            },
        )

        assert response.status_code == 200
        saved_week = response.json()
        assert not saved_week["id"].startswith("virtual-week:")
        assert saved_week["plannedMileage"] == 5

        with SessionLocal() as db:
            persisted_week = db.scalars(
                select(TrainingWeek).where(
                    TrainingWeek.week_start_date == date.fromisoformat(week["weekStartDate"])
                )
            ).first()
            assert persisted_week is not None


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


def test_planned_mileage_excludes_non_run_workout_distance() -> None:
    db = make_session()
    try:
        athlete = planning.ensure_default_athlete(db)
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=date(2024, 2, 14),
                title="Easy 5",
                sport="run",
                planned_distance=5,
            ),
            athlete.id,
        )
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=date(2024, 2, 15),
                title="Bike 20",
                sport="cross_training",
                workout_type="other",
                intensity_category="moderate",
                planned_distance=20,
            ),
            athlete.id,
        )

        week = planning.get_or_create_week(db, date(2024, 2, 12), athlete.id)
        serialized = planning.serialize_week(week, db)
        timeline = planning.training_timeline(db, athlete.id)

        assert week.planned_mileage == 5
        assert serialized["planned_mileage"] == 5
        assert serialized["long_run_distance"] == 5
        assert timeline["months"][0]["planned_miles"] == 5
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


def test_today_for_timezone_uses_athlete_local_date() -> None:
    instant = datetime(2026, 7, 1, 5, 30, tzinfo=timezone.utc)

    assert planning.today_for_timezone("America/Denver", instant) == date(2026, 6, 30)
    assert planning.today_for_timezone("Pacific/Kiritimati", instant) == date(2026, 7, 1)


def test_week_state_uses_athlete_timezone(monkeypatch: pytest.MonkeyPatch) -> None:
    db = make_session()
    try:
        athlete = planning.ensure_default_athlete(db)
        athlete.timezone = "Pacific/Kiritimati"
        db.commit()
        week = planning.get_or_create_week(db, date(2026, 7, 1), athlete.id)

        def fake_today_for_timezone(
            timezone_name: str | None,
            now: datetime | None = None,
        ) -> date:
            assert now is None
            assert timezone_name == "Pacific/Kiritimati"
            return date(2026, 7, 1)

        monkeypatch.setattr(planning, "today_for_timezone", fake_today_for_timezone)

        assert planning.get_week_state(week) == "current"
        serialized = planning.serialize_virtual_week(db, date(2026, 7, 1), athlete.id)
        assert serialized["week_state"] == "current"
    finally:
        db.close()


def test_week_goals_are_derived_from_plan_and_evaluated() -> None:
    db = make_session()
    try:
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=date(2099, 5, 5),
                title="Threshold 10",
                workout_type="threshold",
                intensity_category="workout",
                planned_distance=10,
            ),
        )
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=date(2099, 5, 7),
                title="Easy 6",
                planned_distance=6,
            ),
        )
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=date(2099, 5, 8),
                title="Strength",
                sport="strength",
                workout_type="strength",
                intensity_category="strength",
            ),
        )
        week = planning.get_or_create_week(db, date(2099, 5, 4))

        serialized = planning.serialize_week(week, db)

        assert serialized["week_state"] == "future"
        labels = {goal["label"] for goal in serialized["goals"]}
        assert "Run 16 miles" in labels
        assert "Complete 1 quality session" in labels
        assert "Complete 1 strength session" in labels
        mileage_evaluation = next(
            evaluation
            for evaluation in serialized["goal_evaluations"]
            if evaluation["summary"].startswith("16 planned miles")
        )
        assert mileage_evaluation["status"] == "on_track"
    finally:
        db.close()


def test_past_week_goal_evaluation_uses_actual_activities() -> None:
    db = make_session()
    try:
        athlete = planning.ensure_default_athlete(db)
        week = planning.get_or_create_week(db, date(2024, 4, 1))
        planning.create_week_goal(
            db,
            week.id,
            WeekGoalCreate(
                category="mileage",
                label="Run 20 miles",
                target_value=20,
                min_acceptable=18,
                max_acceptable=22,
                unit="mi",
                evaluation_mode="range",
                priority="primary",
            ),
        )
        db.add(
            StravaActivity(
                strava_activity_id="activity-goal-1",
                athlete_account_id=athlete.id,
                name="Morning Run",
                sport_type="Run",
                start_date=datetime(2024, 4, 2, 15, 0, 0),
                start_date_local=datetime(2024, 4, 2, 8, 0, 0),
                distance=1609.344 * 19.2,
                raw_payload_json={},
            )
        )
        db.commit()
        week = planning.get_week_by_id(db, week.id)

        serialized = planning.serialize_week(week, db)

        assert serialized["week_state"] == "past"
        evaluation = serialized["goal_evaluations"][0]
        assert evaluation["status"] == "achieved"
        assert evaluation["actual_value"] == 19.2
    finally:
        db.close()


def test_current_week_mileage_projection_does_not_double_count_completed_today() -> None:
    db = make_session()
    try:
        athlete = planning.ensure_default_athlete(db)
        today = date.today()
        week_start = planning.week_start_for(today)
        week = planning.get_or_create_week(db, week_start)
        week_end = planning.week_end_for(week_start)
        future_date = today + timedelta(days=1) if today < week_end else None
        future_miles = 20 if future_date else 0
        target_miles = 26.2 + future_miles

        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=today,
                title="Today planned 10",
                planned_distance=10,
            ),
        )
        if future_date:
            planning.create_workout(
                db,
                PlannedWorkoutCreate(
                    planned_date=future_date,
                    title="Future easy 20",
                    planned_distance=future_miles,
                ),
            )
        mileage_goal = planning.create_week_goal(
            db,
            week.id,
            WeekGoalCreate(
                category="mileage",
                label=f"Run {target_miles} miles",
                target_value=target_miles,
                min_acceptable=target_miles - 3,
                max_acceptable=target_miles + 3,
                unit="mi",
                evaluation_mode="range",
                priority="primary",
            ),
        )
        db.add(
            StravaActivity(
                strava_activity_id="activity-current-mileage",
                athlete_account_id=athlete.id,
                name="Today actual",
                sport_type="Run",
                start_date=datetime.combine(today, datetime.min.time()),
                start_date_local=datetime.combine(today, datetime.min.time()),
                distance=1609.344 * 26.2,
                raw_payload_json={},
            )
        )
        db.commit()
        week = planning.get_week_by_id(db, week.id)

        serialized = planning.serialize_week(week, db)

        mileage_evaluation = next(
            evaluation
            for evaluation in serialized["goal_evaluations"]
            if evaluation["goal_id"] == mileage_goal.id
        )
        assert mileage_evaluation["status"] == "on_track"
        assert mileage_evaluation["actual_value"] == 26.2
        assert mileage_evaluation["planned_value"] == 10 + future_miles
        assert mileage_evaluation["remaining_planned_value"] == future_miles
    finally:
        db.close()


def test_copy_prior_week_copies_goals_forward() -> None:
    db = make_session()
    try:
        source_week = planning.get_or_create_week(db, date(2024, 6, 3))
        planning.create_week_goal(
            db,
            source_week.id,
            WeekGoalCreate(
                category="custom",
                label="Practice fueling",
                description="Gel every 30 minutes on the long run.",
                evaluation_mode="manual",
                priority="secondary",
                status="achieved",
            ),
        )
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=date(2024, 6, 5),
                title="Easy 5",
                planned_distance=5,
            ),
        )
        target_week = planning.get_or_create_week(db, date(2024, 6, 10))

        copied_week = planning.copy_prior_week(db, target_week.id)

        assert len(copied_week.goals) == 1
        assert copied_week.goals[0].label == "Practice fueling"
        assert copied_week.goals[0].status == "not_started"
        assert copied_week.goals[0].source == "template"
    finally:
        db.close()


def test_save_week_plan_replaces_purpose_workouts_and_goals() -> None:
    db = make_session()
    try:
        week = planning.get_or_create_week(db, date(2099, 7, 6))
        planning.create_workout(
            db,
            PlannedWorkoutCreate(
                planned_date=date(2099, 7, 7),
                title="Old easy 4",
                planned_distance=4,
            ),
        )
        planning.create_week_goal(
            db,
            week.id,
            WeekGoalCreate(
                category="mileage",
                label="Run 4 miles",
                target_value=4,
                unit="mi",
                evaluation_mode="range",
                priority="primary",
            ),
        )

        saved_week = planning.save_week_plan(
            db,
            week.id,
            PlanWeekSave(
                purpose="Aerobic build",
                target_long_run_distance=8,
                workouts=[
                    PlanWeekWorkout(
                        planned_date=date(2099, 7, 8),
                        title="Easy 6",
                        planned_distance=6,
                    ),
                    PlanWeekWorkout(
                        planned_date=date(2099, 7, 12),
                        title="Long 8",
                        workout_type="long_run",
                        planned_distance=8,
                    ),
                ],
                goals=[
                    PlanWeekGoal(
                        category="mileage",
                        label="Run 14 miles",
                        target_value=14,
                        min_acceptable=13,
                        max_acceptable=15,
                        unit="mi",
                        evaluation_mode="range",
                        priority="primary",
                        source="manual",
                    )
                ],
            ),
        )

        assert saved_week.purpose == "aerobic_build"
        assert saved_week.notes == ""
        assert saved_week.target_long_run_distance == 8
        assert saved_week.planned_mileage == 14
        assert [workout.title for workout in saved_week.workouts] == ["Easy 6", "Long 8"]
        assert [goal.label for goal in saved_week.goals] == ["Run 14 miles"]
    finally:
        db.close()


def test_save_week_plan_persists_custom_purpose_text() -> None:
    db = make_session()
    try:
        week = planning.get_or_create_week(db, date(2099, 8, 3))
        saved_week = planning.save_week_plan(
            db,
            week.id,
            PlanWeekSave(purpose="custom", custom_purpose="Altitude camp shakeout"),
        )

        assert saved_week.purpose == "custom"
        assert saved_week.notes == "Altitude camp shakeout"
    finally:
        db.close()
