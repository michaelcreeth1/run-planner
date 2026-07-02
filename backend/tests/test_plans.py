from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import app


def login(client: TestClient, username: str = "michael", password: str = "test-password") -> None:
    response = client.post(
        "/api/auth/session/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200


def make_plan_payload(
    *,
    name: str = "Portland Half Build",
    start_date: str = "2099-03-02",
    end_date: str = "2099-03-29",
    goal_race_id: str | None = None,
) -> dict:
    requested_start = date.fromisoformat(start_date)
    requested_end = date.fromisoformat(end_date)
    start = requested_start - timedelta(days=requested_start.weekday())
    end = requested_end + timedelta(days=(6 - requested_end.weekday()))
    midpoint = start + timedelta(days=13)
    second_start = midpoint + timedelta(days=1)
    payload = {
        "name": name,
        "description": "Spring race cycle",
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "status": "active",
        "notes": "",
        "mesocycles": [
            {
                "orderIndex": 0,
                "name": "Base",
                "phase": "base",
                "startDate": start.isoformat(),
                "endDate": midpoint.isoformat(),
                "targetMileageStart": 28,
                "targetMileageEnd": 32,
                "longRunStart": 8,
                "longRunEnd": 10,
                "downWeekCadence": 2,
                "downWeekReductionPct": 20,
            },
            {
                "orderIndex": 1,
                "name": "Race",
                "phase": "race",
                "startDate": second_start.isoformat(),
                "endDate": end.isoformat(),
                "targetMileageStart": 26,
                "targetMileageEnd": 18,
                "longRunStart": 8,
                "longRunEnd": 5,
            },
        ],
        "planGoals": [
            {
                "category": "peak_weekly_mileage",
                "label": "Peak at 32 miles",
                "targetValue": 32,
                "unit": "mi",
                "flowsDown": True,
            }
        ],
    }
    if goal_race_id:
        payload["goalRaceId"] = goal_race_id
    return payload


def test_goal_race_plan_scaffolding_and_goal_derivation() -> None:
    with TestClient(app) as client:
        login(client)
        goal_race = client.post(
            "/api/goal-races",
            json={
                "name": "Portland Half",
                "raceDate": "2099-03-24",
                "distance": "half_marathon",
                "targetTime": 6000,
                "priority": "A",
            },
        )
        assert goal_race.status_code == 201
        goal_race_id = goal_race.json()["id"]

        preview = client.post(
            "/api/plans/preview",
            json=make_plan_payload(
                goal_race_id=goal_race_id,
                start_date="2099-03-02",
                end_date="2099-03-29",
            ),
        )
        assert preview.status_code == 200
        preview_body = preview.json()
        assert len(preview_body["weeks"]) == 4
        assert preview_body["weeks"][0]["action"] == "create"
        first_week_changes = {item["field"]: item for item in preview_body["weeks"][0]["changes"]}
        assert first_week_changes["purpose"]["to"] == "aerobic_build"
        assert first_week_changes["targetMileage"]["to"] == 28
        assert first_week_changes["targetLongRunDistance"]["to"] == 8

        created = client.post(
            "/api/plans",
            json=make_plan_payload(
                goal_race_id=goal_race_id,
                start_date="2099-03-02",
                end_date="2099-03-29",
            ),
        )
        assert created.status_code == 201
        plan = created.json()
        assert plan["goalRace"]["id"] == goal_race_id
        assert len(plan["weekSummaries"]) == 4
        assert plan["weekSummaries"][1]["isDownWeek"] is True

        first_week_start = plan["weekSummaries"][0]["weekStartDate"]
        week = client.get(f"/api/weeks/{first_week_start}")
        assert week.status_code == 200
        week_body = week.json()
        assert week_body["purpose"] == "aerobic_build"
        assert week_body["purposeSource"] == "plan"
        assert week_body["targetMileage"] == 28
        assert week_body["targetLongRunDistance"] == 8

        derived = client.post(f"/api/weeks/{week_body['id']}/goals/derive")
        assert derived.status_code == 200
        labels = {goal["label"] for goal in derived.json()["goals"]}
        assert "Run 28 miles" in labels
        assert "Long run near 8 miles" in labels


def test_plan_preview_and_replace_preserve_manual_week_overrides() -> None:
    with TestClient(app) as client:
        login(client)
        created = client.post(
            "/api/plans",
            json=make_plan_payload(start_date="2099-05-04", end_date="2099-05-31"),
        )
        assert created.status_code == 201
        plan = created.json()
        second_week_start = plan["weekSummaries"][1]["weekStartDate"]

        week = client.get(f"/api/weeks/{second_week_start}").json()
        manual_update = client.patch(
            f"/api/weeks/{week['id']}",
            json={"purpose": "recovery", "targetMileage": 20},
        )
        assert manual_update.status_code == 200
        assert manual_update.json()["purposeSource"] == "manual"

        replacement = make_plan_payload(
            name="Revised Portland Half Build",
            start_date="2099-05-04",
            end_date="2099-05-31",
        )
        replacement["mesocycles"][0]["targetMileageStart"] = 30
        replacement["mesocycles"][0]["targetMileageEnd"] = 34

        preview = client.post(f"/api/plans/{plan['id']}/preview", json=replacement)
        assert preview.status_code == 200
        preview_week = next(
            item for item in preview.json()["weeks"] if item["weekStartDate"] == second_week_start
        )
        assert preview_week["action"] == "skip_overridden"

        updated = client.put(f"/api/plans/{plan['id']}", json=replacement)
        assert updated.status_code == 200

        refreshed_week = client.get(f"/api/weeks/{second_week_start}").json()
        assert refreshed_week["purpose"] == "recovery"
        assert refreshed_week["purposeSource"] == "manual"
        assert refreshed_week["targetMileage"] == 20
        assert refreshed_week["targetMileageSource"] == "manual"


def test_overlapping_active_plans_are_rejected() -> None:
    with TestClient(app) as client:
        login(client)
        first = client.post(
            "/api/plans",
            json=make_plan_payload(start_date="2099-07-06", end_date="2099-08-02"),
        )
        assert first.status_code == 201

        overlap = client.post(
            "/api/plans",
            json=make_plan_payload(
                name="Another build",
                start_date="2099-07-13",
                end_date="2099-08-09",
            ),
        )
        assert overlap.status_code == 409


def test_deleting_goal_race_does_not_delete_plan() -> None:
    with TestClient(app) as client:
        login(client)
        goal_race = client.post(
            "/api/goal-races",
            json={
                "name": "Tune-up 10k",
                "raceDate": "2099-09-22",
                "distance": "10k",
                "targetTime": 2700,
            },
        )
        goal_race_id = goal_race.json()["id"]
        created = client.post(
            "/api/plans",
            json=make_plan_payload(
                goal_race_id=goal_race_id,
                start_date="2099-09-07",
                end_date="2099-10-04",
            ),
        )
        plan_id = created.json()["id"]

        deleted = client.delete(f"/api/goal-races/{goal_race_id}")
        assert deleted.status_code == 204

        plan = client.get(f"/api/plans/{plan_id}")
        assert plan.status_code == 200
        assert plan.json()["goalRace"] is None
