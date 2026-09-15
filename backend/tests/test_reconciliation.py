from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.migrations import execute_sql_file
from app.db.session import SessionLocal, engine
from app.main import app
from app.models import AthleteAccount, PerformedSession, PlannedWorkout
from app.services import analytics, planning, strava, weekly_metrics


def login(client: TestClient) -> str:
    response = client.post(
        "/api/auth/session/login",
        json={"username": "michael", "password": "test-password"},
    )
    assert response.status_code == 200
    with SessionLocal() as db:
        return db.scalars(select(AthleteAccount.id)).one()


def create_workout(
    client: TestClient,
    planned_date: str,
    title: str,
    miles: float | None,
    *,
    sport: str = "run",
    workout_type: str = "easy",
    intensity: str = "easy",
) -> dict:
    response = client.post(
        "/api/planned-workouts",
        json={
            "plannedDate": planned_date,
            "title": title,
            "sport": sport,
            "workoutType": workout_type,
            "intensityCategory": intensity,
            "plannedDistance": miles,
        },
    )
    assert response.status_code == 201, response.json()
    return response.json()


def import_activity(
    athlete_id: str,
    activity_id: int,
    local_date: str,
    miles: float,
    *,
    name: str = "Morning Run",
    sport_type: str = "Run",
    duration_seconds: int | None = None,
) -> str:
    with SessionLocal() as db:
        result = strava.upsert_activity(
            db,
            athlete_id,
            {
                "id": activity_id,
                "name": name,
                "sport_type": sport_type,
                "start_date": f"{local_date}T13:00:00Z",
                "start_date_local": f"{local_date}T07:00:00",
                "distance": miles * 1609.344,
                "moving_time": (
                    duration_seconds
                    if duration_seconds is not None
                    else int(miles * 9 * 60)
                ),
            },
        )
    return result


def evaluation(week: dict, metric_key: str) -> dict:
    return next(item for item in week["goalEvaluations"] if item["metricKey"] == metric_key)


def derive_goals(client: TestClient, week_start: str) -> dict:
    week = client.get(f"/api/weeks/{week_start}").json()
    response = client.post(f"/api/weeks/{week['id']}/goals/derive")
    assert response.status_code == 200, response.json()
    return response.json()


def test_easy_import_does_not_silently_fulfill_quality_purpose() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        current = client.get("/api/weeks/current").json()
        planned_date = planning.today_for_timezone("America/Denver").isoformat()
        quality = create_workout(
            client,
            planned_date,
            "Threshold 6",
            6,
            workout_type="threshold",
            intensity="workout",
        )
        derive_goals(client, current["weekStartDate"])

        assert import_activity(athlete_id, 1001, planned_date, 6, name="Morning Run") == "created"
        assert import_activity(athlete_id, 1001, planned_date, 6, name="Morning Run") == "unchanged"

        sessions = client.get("/api/performed-sessions").json()
        assert len(sessions) == 1
        session = sessions[0]
        assert session["plannedWorkoutId"] == quality["id"]
        assert session["association"] == "associated"
        assert session["outcome"] == "unresolved"
        week = client.get(f"/api/weeks/{current['weekStartDate']}").json()
        quality_metric = evaluation(week, "hard_training_day_count")
        assert quality_metric["actualValue"] == 0
        assert quality_metric["remainingPlannedValue"] == 1


def test_one_recording_in_a_double_leaves_the_other_workout_projected() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        current = client.get("/api/weeks/current").json()
        planned_date = planning.today_for_timezone("America/Denver").isoformat()
        first = create_workout(client, planned_date, "Morning 4", 4)
        second = create_workout(client, planned_date, "Evening 6", 6)
        derive_goals(client, current["weekStartDate"])
        import_activity(athlete_id, 1002, planned_date, 4)
        session = client.get("/api/performed-sessions").json()[0]
        assert session["association"] == "unmatched"

        response = client.put(
            f"/api/performed-sessions/{session['id']}/reconciliation",
            json={
                "plannedWorkoutId": first["id"],
                "expectedVersion": session["version"],
            },
        )
        assert response.status_code == 200, response.json()
        assert response.json()["plannedWorkoutId"] == first["id"]
        assert response.json()["outcome"] == "as_planned"
        assert response.json()["matchProvenance"] == "user_confirmed"
        week = client.get(f"/api/weeks/{current['weekStartDate']}").json()
        mileage = evaluation(week, "weekly_run_distance")
        sessions = evaluation(week, "training_session_count")
        assert mileage["actualValue"] == 4
        assert mileage["remainingPlannedValue"] == 6
        assert sessions["actualValue"] == 1
        assert sessions["remainingPlannedValue"] == 1
        assert next(item for item in week["workouts"] if item["id"] == second["id"])[
            "status"
        ] == "planned"


def test_recorded_workout_cannot_be_patched_or_deleted() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        planned_date = planning.today_for_timezone("America/Denver").isoformat()
        workout = create_workout(client, planned_date, "Easy 5", 5)
        import_activity(athlete_id, 1020, planned_date, 5)

        patch_response = client.patch(
            f"/api/planned-workouts/{workout['id']}",
            json={"title": "Rewritten after completion"},
        )
        delete_response = client.delete(f"/api/planned-workouts/{workout['id']}")

        assert patch_response.status_code == 409
        assert delete_response.status_code == 409
        assert patch_response.json() == {
            "detail": "Completed workouts stay fixed. Edit only the Strava match."
        }
        assert delete_response.json() == patch_response.json()
        persisted = client.get(f"/api/planned-workouts/{workout['id']}")
        assert persisted.status_code == 200
        assert persisted.json()["title"] == "Easy 5"


def test_cross_week_match_resolves_workout_in_its_planned_week() -> None:
    planned_date = date(2099, 1, 5)
    activity_date = planned_date - timedelta(days=1)
    with TestClient(app) as client:
        athlete_id = login(client)
        workout = create_workout(client, planned_date.isoformat(), "Monday easy 5", 5)
        import_activity(athlete_id, 1021, activity_date.isoformat(), 5)
        session = client.get("/api/performed-sessions").json()[0]

        reconciled = client.put(
            f"/api/performed-sessions/{session['id']}/reconciliation",
            json={
                "plannedWorkoutId": workout["id"],
                "expectedVersion": session["version"],
            },
        )
        assert reconciled.status_code == 200
        assert reconciled.json()["outcome"] == "moved"

        source_week = client.get(f"/api/weeks/{planned_date.isoformat()}").json()
        assert session["id"] in {item["id"] for item in source_week["performedSessions"]}

        with SessionLocal() as db:
            week = planning.load_week(db, planned_date, athlete_id)
            sessions = planning.performed_sessions_for_week(db, week)
            metrics = weekly_metrics.calculate_weekly_metrics(
                week.workouts,
                [],
                today=planned_date,
                sessions=sessions,
            )
            assert metrics["weekly_run_distance"].remaining == 0
            assert metrics["training_session_count"].remaining == 0

            grouped = analytics.sessions_in_range(
                db,
                athlete_id,
                activity_date - timedelta(days=6),
                planned_date + timedelta(days=6),
            )
            assert session["id"] in {
                item.id for item in grouped[planning.week_start_for(planned_date)]
            }


def test_user_can_confirm_an_imported_activity_was_unplanned() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        planned_date = planning.today_for_timezone("America/Denver").isoformat()
        assert import_activity(
            athlete_id,
            1015,
            planned_date,
            1.8,
            name="Morning Ride",
            sport_type="Ride",
        ) == "created"
        session = client.get("/api/performed-sessions").json()[0]
        assert session["outcome"] == "unresolved"

        response = client.put(
            f"/api/performed-sessions/{session['id']}/reconciliation",
            json={
                "plannedWorkoutId": None,
                "expectedVersion": session["version"],
            },
        )

        assert response.status_code == 200, response.json()
        assert response.json()["plannedWorkoutId"] is None
        assert response.json()["association"] == "unmatched"
        assert response.json()["matchProvenance"] == "user_confirmed"
        assert response.json()["outcome"] == "unplanned"
        assert response.json()["evidence"] == "user_confirmation"


def test_strava_strength_and_run_are_both_sessions() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        current = client.get("/api/weeks/current").json()
        planned_date = planning.today_for_timezone("America/Denver").isoformat()
        create_workout(client, planned_date, "Easy 5", 5)
        strength = create_workout(
            client,
            planned_date,
            "Strength",
            None,
            sport="strength",
            workout_type="strength",
            intensity="strength",
        )
        derive_goals(client, current["weekStartDate"])
        import_activity(athlete_id, 1003, planned_date, 5)
        import_activity(
            athlete_id,
            1009,
            planned_date,
            0,
            name="Strength",
            sport_type="WeightTraining",
            duration_seconds=1800,
        )

        week = client.get(f"/api/weeks/{current['weekStartDate']}").json()
        assert len(week["performedSessions"]) == 2
        assert next(
            session
            for session in week["performedSessions"]
            if session["plannedWorkoutId"] == strength["id"]
        )["recordings"]
        assert evaluation(week, "training_session_count")["actualValue"] == 2
        assert evaluation(week, "strength_session_count")["actualValue"] == 1
        assert week["actualMileage"] == 5


def test_nearby_recordings_automatically_form_one_unambiguous_session() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        current = client.get("/api/weeks/current").json()
        planned_date = planning.today_for_timezone("America/Denver").isoformat()
        workout = create_workout(client, planned_date, "Warmup plus tempo", 6)
        derive_goals(client, current["weekStartDate"])
        import_activity(athlete_id, 1004, planned_date, 2, name="Warmup")
        import_activity(athlete_id, 1005, planned_date, 4, name="Tempo")
        sessions = client.get("/api/performed-sessions").json()
        assert len(sessions) == 1
        assert len(sessions[0]["recordings"]) == 2
        assert sessions[0]["plannedWorkoutId"] == workout["id"]
        assert sessions[0]["association"] == "associated"
        week = client.get(f"/api/weeks/{current['weekStartDate']}").json()
        assert week["actualMileage"] == 6
        assert evaluation(week, "training_session_count")["actualValue"] == 1


def test_nearby_recordings_stay_separate_when_two_plans_are_possible() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        planned_date = planning.today_for_timezone("America/Denver").isoformat()
        create_workout(client, planned_date, "Morning 2", 2)
        create_workout(client, planned_date, "Evening 4", 4)

        import_activity(athlete_id, 1010, planned_date, 2, name="Morning Run")
        import_activity(athlete_id, 1011, planned_date, 4, name="Evening Run")

        sessions = client.get("/api/performed-sessions").json()
        assert len(sessions) == 2
        assert all(len(session["recordings"]) == 1 for session in sessions)
        assert all(session["association"] == "unmatched" for session in sessions)


def test_choosing_the_same_plan_groups_ambiguous_recordings() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        current = client.get("/api/weeks/current").json()
        planned_date = planning.today_for_timezone("America/Denver").isoformat()
        first = create_workout(client, planned_date, "Morning 2", 2)
        create_workout(client, planned_date, "Evening 4", 4)
        derive_goals(client, current["weekStartDate"])
        import_activity(athlete_id, 1012, planned_date, 2, name="Warmup")
        import_activity(athlete_id, 1013, planned_date, 4, name="Workout")
        sessions = client.get("/api/performed-sessions").json()
        assert len(sessions) == 2

        first_match = client.put(
            f"/api/performed-sessions/{sessions[0]['id']}/reconciliation",
            json={
                "plannedWorkoutId": first["id"],
                "expectedVersion": sessions[0]["version"],
            },
        )
        assert first_match.status_code == 200, first_match.json()
        second_match = client.put(
            f"/api/performed-sessions/{sessions[1]['id']}/reconciliation",
            json={
                "plannedWorkoutId": first["id"],
                "expectedVersion": sessions[1]["version"],
            },
        )
        assert second_match.status_code == 200, second_match.json()

        grouped = client.get("/api/performed-sessions").json()
        assert len(grouped) == 1
        assert len(grouped[0]["recordings"]) == 2
        week = client.get(f"/api/weeks/{current['weekStartDate']}").json()
        assert week["actualMileage"] == 6
        assert evaluation(week, "training_session_count")["actualValue"] == 1


def test_correcting_match_and_moved_outcome_refreshes_goals_and_projection() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        current = client.get("/api/weeks/current").json()
        today = planning.today_for_timezone("America/Denver")
        planned_date = today.isoformat()
        week_start = date.fromisoformat(current["weekStartDate"])
        quality_date = week_start if week_start != today else today + timedelta(days=1)
        easy = create_workout(client, planned_date, "Easy 5", 5)
        quality = create_workout(
            client,
            quality_date.isoformat(),
            "Intervals 8",
            8,
            workout_type="interval",
            intensity="workout",
        )
        derive_goals(client, current["weekStartDate"])
        import_activity(athlete_id, 1006, planned_date, 5, name="Intervals")
        session = client.get("/api/performed-sessions").json()[0]

        response = client.put(
            f"/api/performed-sessions/{session['id']}/reconciliation",
            json={
                "plannedWorkoutId": quality["id"],
                "expectedVersion": session["version"],
            },
        )
        assert response.status_code == 200, response.json()
        assert response.json()["outcome"] == "moved"
        week = client.get(f"/api/weeks/{current['weekStartDate']}").json()
        assert next(item for item in week["workouts"] if item["id"] == easy["id"])[
            "status"
        ] == "planned"
        assert next(item for item in week["workouts"] if item["id"] == quality["id"])[
            "status"
        ] == "completed_modified"
        assert evaluation(week, "hard_training_day_count")["actualValue"] == 1
        assert evaluation(week, "weekly_run_distance")["remainingPlannedValue"] == 5


def test_performed_work_cannot_be_created_manually() -> None:
    with TestClient(app) as client:
        login(client)
        response = client.post(
            "/api/performed-sessions",
            json={
                "occurredAt": "2026-09-07T07:00:00",
                "sport": "run",
                "manualDistanceMeters": 8046.72,
            },
        )
        assert response.status_code == 405


def test_reconciliation_rejects_manual_metric_overrides() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        planned_date = planning.today_for_timezone("America/Denver").isoformat()
        import_activity(athlete_id, 1014, planned_date, 5)
        session = client.get("/api/performed-sessions").json()[0]

        response = client.put(
            f"/api/performed-sessions/{session['id']}/reconciliation",
            json={
                "plannedWorkoutId": None,
                "manualDistanceMeters": 16093.44,
                "expectedVersion": session["version"],
            },
        )

        assert response.status_code == 422


def test_unchanged_import_repairs_a_safe_unmatched_session() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        planned_date = planning.today_for_timezone("America/Denver").isoformat()
        workout = create_workout(client, planned_date, "Easy 5", 5)
        assert import_activity(athlete_id, 1007, planned_date, 5) == "created"

        with SessionLocal() as db:
            session = db.scalars(select(PerformedSession)).one()
            planned = db.get(PlannedWorkout, workout["id"])
            session.planned_workout_id = None
            session.prescription_revision_id = None
            session.association = "unmatched"
            session.match_provenance = None
            session.outcome = "unresolved"
            planned.status = "planned"
            db.commit()

        assert import_activity(athlete_id, 1007, planned_date, 5) == "unchanged"
        repaired = client.get("/api/performed-sessions").json()[0]
        assert repaired["plannedWorkoutId"] == workout["id"]
        assert repaired["association"] == "associated"
        assert repaired["outcome"] == "as_planned"


def test_historical_repair_migration_matches_only_safe_pairs() -> None:
    with TestClient(app) as client:
        athlete_id = login(client)
        planned_date = planning.today_for_timezone("America/Denver").isoformat()
        workout = create_workout(client, planned_date, "Easy 5", 5)
        assert import_activity(athlete_id, 1008, planned_date, 5) == "created"

        with SessionLocal() as db:
            session = db.scalars(select(PerformedSession)).one()
            planned = db.get(PlannedWorkout, workout["id"])
            session.planned_workout_id = None
            session.prescription_revision_id = None
            session.association = "unmatched"
            session.match_provenance = None
            session.outcome = "unresolved"
            planned.status = "planned"
            db.commit()

        migration = (
            Path(__file__).resolve().parents[1]
            / "migrations"
            / "20260910_017_safe_historical_session_matching.sqlite.sql"
        )
        with engine.begin() as connection:
            execute_sql_file(connection, migration)

        repaired = client.get("/api/performed-sessions").json()[0]
        assert repaired["plannedWorkoutId"] == workout["id"]
        assert repaired["association"] == "associated"
        assert repaired["outcome"] == "as_planned"
        week = client.get("/api/weeks/current").json()
        assert week["workouts"][0]["status"] == "completed_as_planned"
