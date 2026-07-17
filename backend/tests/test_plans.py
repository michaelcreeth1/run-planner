from copy import deepcopy
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
        "recurringGoals": [
            {
                "category": "strength",
                "label": "Complete 1 strength session",
                "targetValue": 1,
                "minAcceptable": 1,
                "unit": "sessions",
                "evaluationMode": "at_least",
                "priority": "secondary",
            }
        ],
    }
    if goal_race_id:
        payload["goalRaceId"] = goal_race_id
    return payload


PROJECTED_WEEK_FIELDS = (
    "weekStartDate",
    "weekEndDate",
    "mesocycleName",
    "mesocyclePhase",
    "weekIndexInMesocycle",
    "mesocycleWeekCount",
    "plannedMileage",
    "actualMileage",
    "targetMileage",
    "targetLongRunDistance",
    "purpose",
    "purposeSource",
    "targetMileageSource",
    "targetLongRunSource",
    "isDownWeek",
    "hasManualOverride",
    "warning",
)


def projected_week_fields(weeks: list[dict]) -> list[dict]:
    return [{field: week[field] for field in PROJECTED_WEEK_FIELDS} for week in weeks]


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
        assert plan["endDate"] == "2099-03-24"
        assert plan["mesocycles"][-1]["endDate"] == "2099-03-24"
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

        assert [goal["label"] for goal in plan["recurringGoals"]] == ["Complete 1 strength session"]
        plan_sourced = [goal for goal in week_body["goals"] if goal["source"] == "plan"]
        assert [goal["label"] for goal in plan_sourced] == ["Complete 1 strength session"]

        derived = client.post(f"/api/weeks/{week_body['id']}/goals/derive")
        assert derived.status_code == 200
        derived_goals = derived.json()["goals"]
        labels = {goal["label"] for goal in derived_goals}
        assert "Run 28 miles" in labels
        assert "Long run near 8 miles" in labels
        sources = {goal["label"]: goal["source"] for goal in derived_goals}
        assert sources["Run 28 miles"] == "workouts"
        assert sources["Complete 1 strength session"] == "plan"
        strength_goals = [goal for goal in derived_goals if goal["category"] == "strength"]
        assert len(strength_goals) == 1

        reopened = client.get(f"/api/plans/{plan['id']}")
        assert reopened.status_code == 200
        assert reopened.json()["endDate"] == "2099-03-24"


def test_generated_week_preview_matches_create_and_update_with_canonical_rounding() -> None:
    with TestClient(app) as client:
        login(client)
        payload = make_plan_payload(
            name="Canonical rounding build",
            start_date="2099-03-02",
            end_date="2099-03-29",
        )
        payload["mesocycles"] = [
            {
                "orderIndex": 0,
                "name": "Build",
                "phase": "build",
                "startDate": "2099-03-02",
                "endDate": "2099-03-29",
                "targetMileageStart": 25,
                "targetMileageEnd": 35,
                "longRunStart": 8,
                "longRunEnd": 12,
                "downWeekCadence": 2,
                "downWeekReductionPct": 25,
            }
        ]
        payload["recurringGoals"] = []

        preview = client.post("/api/plans/preview", json=payload)
        assert preview.status_code == 200
        preview_weeks = preview.json()["weekSummaries"]
        assert [week["targetMileage"] for week in preview_weeks] == [25, 18.8, 35, 26.2]
        assert [week["targetLongRunDistance"] for week in preview_weeks] == [8, 6, 12, 9]
        assert [week["isDownWeek"] for week in preview_weeks] == [False, True, False, True]
        assert [week["purpose"] for week in preview_weeks] == [
            "aerobic_build",
            "down_week",
            "aerobic_build",
            "down_week",
        ]
        assert [week["weekIndexInMesocycle"] for week in preview_weeks] == [1, 2, 3, 4]
        assert all(week["mesocycleWeekCount"] == 4 for week in preview_weeks)

        created = client.post("/api/plans", json=payload)
        assert created.status_code == 201
        plan = created.json()
        assert projected_week_fields(preview_weeks) == projected_week_fields(
            plan["weekSummaries"]
        )

        replacement = deepcopy(payload)
        replacement["name"] = "Updated canonical rounding build"
        replacement["mesocycles"][0].update(
            {
                "id": plan["mesocycles"][0]["id"],
                "targetMileageStart": 26,
                "targetMileageEnd": 38,
                "longRunStart": 9,
                "longRunEnd": 13,
                "downWeekReductionPct": 20,
            }
        )
        edit_preview = client.post(f"/api/plans/{plan['id']}/preview", json=replacement)
        assert edit_preview.status_code == 200
        updated = client.put(f"/api/plans/{plan['id']}", json=replacement)
        assert updated.status_code == 200
        assert projected_week_fields(edit_preview.json()["weekSummaries"]) == (
            projected_week_fields(updated.json()["weekSummaries"])
        )


def test_updating_race_date_resizes_linked_plan_and_phase_timeline() -> None:
    with TestClient(app) as client:
        login(client)
        goal_race = client.post(
            "/api/goal-races",
            json={
                "name": "Summer Half",
                "raceDate": "2099-06-24",
                "distance": "half_marathon",
                "targetTime": 6000,
                "priority": "A",
            },
        )
        assert goal_race.status_code == 201
        goal_race_id = goal_race.json()["id"]
        created = client.post(
            "/api/plans",
            json=make_plan_payload(
                goal_race_id=goal_race_id,
                start_date="2099-06-01",
                end_date="2099-06-28",
            ),
        )
        assert created.status_code == 201
        plan_id = created.json()["id"]
        assert created.json()["endDate"] == "2099-06-24"

        updated_race = client.patch(
            f"/api/goal-races/{goal_race_id}",
            json={"raceDate": "2099-07-08"},
        )
        assert updated_race.status_code == 200

        reopened = client.get(f"/api/plans/{plan_id}")
        assert reopened.status_code == 200
        plan = reopened.json()
        assert plan["goalRace"]["raceDate"] == "2099-07-08"
        assert plan["endDate"] == "2099-07-08"
        assert plan["mesocycles"][-1]["endDate"] == "2099-07-08"
        assert plan["weekSummaries"][-1]["weekStartDate"] == "2099-07-06"

        shortened_race = client.patch(
            f"/api/goal-races/{goal_race_id}",
            json={"raceDate": "2099-06-10"},
        )
        assert shortened_race.status_code == 200
        shortened_plan = client.get(f"/api/plans/{plan_id}").json()
        assert shortened_plan["endDate"] == "2099-06-10"
        assert len(shortened_plan["mesocycles"]) == 1
        assert shortened_plan["mesocycles"][-1]["endDate"] == "2099-06-10"
        assert shortened_plan["weekSummaries"][-1]["weekStartDate"] == "2099-06-08"


def test_goal_race_update_persists_race_date_with_full_form_payload() -> None:
    with TestClient(app) as client:
        login(client)
        created = client.post(
            "/api/goal-races",
            json={
                "name": "Updated Date Half",
                "raceDate": "2099-04-12",
                "distance": "half_marathon",
                "targetTime": 6000,
                "priority": "A",
            },
        )
        assert created.status_code == 201
        goal_race_id = created.json()["id"]

        updated = client.patch(
            f"/api/goal-races/{goal_race_id}",
            json={
                "name": "Updated Date Half",
                "raceDate": "2099-04-19",
                "distance": "half_marathon",
                "distanceMiles": None,
                "targetTime": 6000,
                "priority": "A",
                "location": "",
                "altitudeContext": "",
                "notes": "",
            },
        )

        assert updated.status_code == 200
        assert updated.json()["raceDate"] == "2099-04-19"
        listed = client.get("/api/goal-races")
        assert listed.status_code == 200
        matching = next(race for race in listed.json() if race["id"] == goal_race_id)
        assert matching["raceDate"] == "2099-04-19"


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
        preview_summary = next(
            item
            for item in preview.json()["weekSummaries"]
            if item["weekStartDate"] == second_week_start
        )
        assert preview_summary["purpose"] == "recovery"
        assert preview_summary["purposeSource"] == "manual"
        assert preview_summary["targetMileage"] == 20
        assert preview_summary["targetMileageSource"] == "manual"
        assert preview_summary["isDownWeek"] is False
        assert preview_summary["hasManualOverride"] is True

        updated = client.put(f"/api/plans/{plan['id']}", json=replacement)
        assert updated.status_code == 200
        updated_summary = next(
            item
            for item in updated.json()["weekSummaries"]
            if item["weekStartDate"] == second_week_start
        )
        assert projected_week_fields([preview_summary]) == projected_week_fields(
            [updated_summary]
        )

        refreshed_week = client.get(f"/api/weeks/{second_week_start}").json()
        assert refreshed_week["purpose"] == "recovery"
        assert refreshed_week["purposeSource"] == "manual"
        assert refreshed_week["targetMileage"] == 20
        assert refreshed_week["targetMileageSource"] == "manual"


def test_plan_read_keeps_manually_cleared_targets_until_the_plan_is_reapplied() -> None:
    with TestClient(app) as client:
        login(client)
        payload = make_plan_payload(
            name="Manual target clear",
            start_date="2099-05-04",
            end_date="2099-05-31",
        )
        created = client.post("/api/plans", json=payload)
        assert created.status_code == 201
        plan = created.json()
        first_summary = plan["weekSummaries"][0]
        week = client.get(f"/api/weeks/{first_summary['weekStartDate']}").json()

        cleared = client.patch(
            f"/api/weeks/{week['id']}",
            json={"targetMileage": None, "targetLongRunDistance": None},
        )
        assert cleared.status_code == 200
        assert cleared.json()["targetMileageSource"] == "manual"
        assert cleared.json()["targetLongRunSource"] == "manual"

        reopened = client.get(f"/api/plans/{plan['id']}")
        assert reopened.status_code == 200
        reopened_summary = reopened.json()["weekSummaries"][0]
        assert reopened_summary["targetMileage"] is None
        assert reopened_summary["targetMileageSource"] == "manual"
        assert reopened_summary["targetLongRunDistance"] is None
        assert reopened_summary["targetLongRunSource"] == "manual"

        preview = client.post(f"/api/plans/{plan['id']}/preview", json=payload)
        assert preview.status_code == 200
        preview_summary = preview.json()["weekSummaries"][0]
        assert preview_summary["targetMileage"] == first_summary["targetMileage"]
        assert preview_summary["targetMileageSource"] == "plan"
        assert preview_summary["targetLongRunDistance"] == first_summary["targetLongRunDistance"]
        assert preview_summary["targetLongRunSource"] == "plan"

        updated = client.put(f"/api/plans/{plan['id']}", json=payload)
        assert updated.status_code == 200
        assert projected_week_fields([preview_summary]) == projected_week_fields(
            [updated.json()["weekSummaries"][0]]
        )


def test_race_phase_down_week_flag_updates_when_purpose_text_is_unchanged() -> None:
    with TestClient(app) as client:
        login(client)
        payload = make_plan_payload(
            name="Race phase cadence",
            start_date="2099-05-04",
            end_date="2099-05-31",
        )
        created = client.post("/api/plans", json=payload)
        assert created.status_code == 201
        plan = created.json()
        original_race_weeks = [
            week for week in plan["weekSummaries"] if week["mesocyclePhase"] == "race"
        ]
        assert [week["purpose"] for week in original_race_weeks] == [
            "race_week",
            "race_week",
        ]
        assert [week["isDownWeek"] for week in original_race_weeks] == [False, False]

        replacement = deepcopy(payload)
        replacement["mesocycles"][0]["id"] = plan["mesocycles"][0]["id"]
        replacement["mesocycles"][1]["id"] = plan["mesocycles"][1]["id"]
        replacement["mesocycles"][1]["downWeekCadence"] = 2

        preview = client.post(f"/api/plans/{plan['id']}/preview", json=replacement)
        assert preview.status_code == 200
        preview_race_weeks = [
            week
            for week in preview.json()["weekSummaries"]
            if week["mesocyclePhase"] == "race"
        ]
        assert [week["purpose"] for week in preview_race_weeks] == [
            "race_week",
            "race_week",
        ]
        assert [week["isDownWeek"] for week in preview_race_weeks] == [False, True]
        final_week_diff = next(
            week
            for week in preview.json()["weeks"]
            if week["weekStartDate"] == preview_race_weeks[-1]["weekStartDate"]
        )
        assert any(change["field"] == "isDownWeek" for change in final_week_diff["changes"])

        updated = client.put(f"/api/plans/{plan['id']}", json=replacement)
        assert updated.status_code == 200
        saved_race_weeks = [
            week
            for week in updated.json()["weekSummaries"]
            if week["mesocyclePhase"] == "race"
        ]
        assert projected_week_fields(preview_race_weeks) == projected_week_fields(
            saved_race_weeks
        )
        assert [week["isDownWeek"] for week in saved_race_weeks] == [False, True]

        saved_final_week = client.get(
            f"/api/weeks/{saved_race_weeks[-1]['weekStartDate']}"
        )
        assert saved_final_week.status_code == 200
        assert saved_final_week.json()["purpose"] == "race_week"
        assert saved_final_week.json()["isDownWeek"] is True


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


def test_default_goals_are_editable_and_overlay_weeks() -> None:
    with TestClient(app) as client:
        login(client)
        seeded = client.get("/api/default-goals")
        assert seeded.status_code == 200
        labels = {goal["label"] for goal in seeded.json()}
        assert "Preserve at least 1 rest day" in labels
        assert "Long run no more than 30% of week" in labels
        assert "No more than 2 hard days" in labels

        created = client.post(
            "/api/planned-workouts",
            json={"plannedDate": "2099-02-03", "title": "Easy 6", "plannedDistance": 6},
        )
        assert created.status_code == 201
        week = client.get("/api/weeks/2099-02-03").json()
        sources = {goal["label"]: goal["source"] for goal in week["goals"]}
        assert sources["No more than 2 hard days"] == "default"
        assert sources["Preserve at least 1 rest day"] == "default"

        replaced = client.put(
            "/api/default-goals",
            json=[
                {
                    "category": "quality",
                    "goalType": "guardrail",
                    "label": "No more than 1 hard day",
                    "targetValue": 1,
                    "maxAcceptable": 1,
                    "unit": "days",
                    "evaluationMode": "at_most",
                    "priority": "guardrail",
                },
                {
                    "category": "strength",
                    "goalType": "achievement",
                    "label": "Complete 1 strength session",
                    "targetValue": 1,
                    "minAcceptable": 1,
                    "unit": "sessions",
                    "evaluationMode": "at_least",
                    "priority": "secondary",
                },
            ],
        )
        assert replaced.status_code == 200
        assert len(replaced.json()) == 2

        week = client.get("/api/weeks/2099-02-03").json()
        labels = {goal["label"] for goal in week["goals"]}
        assert "No more than 1 hard day" in labels
        assert "No more than 2 hard days" not in labels
        assert "Complete 1 strength session" in labels
        evaluated_goal_ids = {evaluation["goalId"] for evaluation in week["goalEvaluations"]}
        assert {goal["id"] for goal in week["goals"]} == evaluated_goal_ids


def test_plan_goals_shadow_default_goals_by_category() -> None:
    with TestClient(app) as client:
        login(client)
        created = client.post(
            "/api/plans",
            json=make_plan_payload(start_date="2099-12-06", end_date="2100-01-02"),
        )
        assert created.status_code == 201
        plan = created.json()
        first_week_start = plan["weekSummaries"][0]["weekStartDate"]

        client.put(
            "/api/default-goals",
            json=[
                {
                    "category": "strength",
                    "goalType": "achievement",
                    "label": "Strength once weekly",
                    "targetValue": 1,
                    "minAcceptable": 1,
                    "unit": "sessions",
                    "evaluationMode": "at_least",
                    "priority": "secondary",
                },
                {
                    "category": "quality",
                    "goalType": "guardrail",
                    "label": "No more than 2 hard days",
                    "targetValue": 2,
                    "maxAcceptable": 2,
                    "unit": "days",
                    "evaluationMode": "at_most",
                    "priority": "guardrail",
                },
            ],
        )

        week = client.get(f"/api/weeks/{first_week_start}").json()
        strength_goals = [goal for goal in week["goals"] if goal["category"] == "strength"]
        assert [goal["source"] for goal in strength_goals] == ["plan"]
        assert [goal["label"] for goal in strength_goals] == ["Complete 1 strength session"]
        guardrails = [goal for goal in week["goals"] if goal["goalType"] == "guardrail"]
        assert any(goal["source"] == "default" for goal in guardrails)


def test_recurring_goals_respect_manual_edits_and_clear_on_delete() -> None:
    with TestClient(app) as client:
        login(client)
        created = client.post(
            "/api/plans",
            json=make_plan_payload(start_date="2099-11-02", end_date="2099-11-29"),
        )
        assert created.status_code == 201
        plan = created.json()
        first_week_start = plan["weekSummaries"][0]["weekStartDate"]

        week = client.get(f"/api/weeks/{first_week_start}").json()
        plan_goal = next(goal for goal in week["goals"] if goal["source"] == "plan")
        edited = client.patch(
            f"/api/week-goals/{plan_goal['id']}",
            json={"label": "Two strength sessions", "targetValue": 2},
        )
        assert edited.status_code == 200
        assert edited.json()["source"] == "manual"

        replacement = make_plan_payload(
            name="Revised build",
            start_date="2099-11-02",
            end_date="2099-11-29",
        )
        updated = client.put(f"/api/plans/{plan['id']}", json=replacement)
        assert updated.status_code == 200

        week = client.get(f"/api/weeks/{first_week_start}").json()
        strength_goals = [goal for goal in week["goals"] if goal["category"] == "strength"]
        assert [goal["label"] for goal in strength_goals] == ["Two strength sessions"]
        assert strength_goals[0]["source"] == "manual"

        second_week_start = plan["weekSummaries"][1]["weekStartDate"]
        second_week = client.get(f"/api/weeks/{second_week_start}").json()
        assert any(goal["source"] == "plan" for goal in second_week["goals"])

        deleted = client.delete(f"/api/plans/{plan['id']}?clearScaffolding=true")
        assert deleted.status_code == 204

        second_week = client.get(f"/api/weeks/{second_week_start}").json()
        assert not any(goal["source"] == "plan" for goal in second_week["goals"])
        first_week = client.get(f"/api/weeks/{first_week_start}").json()
        assert any(goal["label"] == "Two strength sessions" for goal in first_week["goals"])
