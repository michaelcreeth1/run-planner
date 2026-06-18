from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import app


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
