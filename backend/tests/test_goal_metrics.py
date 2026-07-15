from datetime import date, datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, SessionLocal
from app.main import app
from app.models import RecurringGoal, StravaActivity, WeekGoal, WeeklyMetricSnapshot
from app.services import planning


def login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/session/login",
        json={"username": "michael", "password": "test-password"},
    )
    assert response.status_code == 200


def make_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def test_metric_catalog_drives_validated_default_goals() -> None:
    with TestClient(app) as client:
        login(client)
        catalog = client.get("/api/goal-metrics")
        assert catalog.status_code == 200
        rest_days = next(metric for metric in catalog.json() if metric["key"] == "rest_day_count")
        assert rest_days == {
            "key": "rest_day_count",
            "label": "Rest days",
            "category": "recovery",
            "unit": "days",
            "valueType": "integer",
            "operators": ["at_least", "at_most", "range", "exact-ish"],
            "minimum": 0,
            "maximum": 7,
        }

        nonsense = client.put(
            "/api/default-goals",
            json=[
                {
                    "category": "recovery",
                    "goalType": "achievement",
                    "label": "Recover at most 12 yes/no",
                    "targetValue": 12,
                    "maxAcceptable": 12,
                    "unit": "boolean",
                    "evaluationMode": "at_most",
                }
            ],
        )
        assert nonsense.status_code == 422

        out_of_range = client.put(
            "/api/default-goals",
            json=[
                {
                    "metricKey": "rest_day_count",
                    "category": "recovery",
                    "goalType": "achievement",
                    "label": "Keep 12 rest days",
                    "targetValue": 12,
                    "minAcceptable": 12,
                    "unit": "days",
                    "evaluationMode": "at_least",
                }
            ],
        )
        assert out_of_range.status_code == 422

        valid = client.put(
            "/api/default-goals",
            json=[
                {
                    "metricKey": "rest_day_count",
                    "category": "recovery",
                    "goalType": "guardrail",
                    "label": "Keep at least 1 day of rest",
                    "targetValue": 1,
                    "minAcceptable": 1,
                    "unit": "days",
                    "evaluationMode": "at_least",
                    "priority": "guardrail",
                }
            ],
        )
        assert valid.status_code == 200
        assert valid.json()[0]["metricKey"] == "rest_day_count"


def test_week_and_default_goal_reads_canonicalize_legacy_quality_session_units() -> None:
    with TestClient(app) as client:
        login(client)
        week_start = client.get("/api/weeks/current").json()["weekStartDate"]
        workout = client.post(
            "/api/planned-workouts",
            json={
                "plannedDate": week_start,
                "title": "Threshold repeats",
                "workoutType": "threshold",
                "intensityCategory": "workout",
                "plannedDistance": 6,
            },
        ).json()

        with SessionLocal() as db:
            db.add(
                WeekGoal(
                    id="legacy-quality-week-goal",
                    training_week_id=workout["trainingWeekId"],
                    athlete_account_id=workout["athleteAccountId"],
                    week_start_date=date.fromisoformat(week_start),
                    metric_key="hard_training_day_count",
                    category="quality",
                    goal_type="achievement",
                    label="Complete 1 quality session",
                    target_value=1,
                    min_acceptable=1,
                    max_acceptable=2,
                    unit="sessions",
                    evaluation_mode="at_least",
                    priority="primary",
                    source="workouts",
                )
            )
            db.add(
                RecurringGoal(
                    id="legacy-quality-default-goal",
                    athlete_account_id=workout["athleteAccountId"],
                    metric_key="hard_training_day_count",
                    category="quality",
                    goal_type="guardrail",
                    label="No more than 2 quality sessions",
                    target_value=2,
                    max_acceptable=2,
                    unit="sessions",
                    evaluation_mode="at_most",
                    priority="guardrail",
                )
            )
            db.commit()

        week_response = client.get(f"/api/weeks/{week_start}")
        defaults_response = client.get("/api/default-goals")

        assert week_response.status_code == 200
        legacy_week_goal = next(
            goal
            for goal in week_response.json()["goals"]
            if goal["id"] == "legacy-quality-week-goal"
        )
        assert legacy_week_goal["metricKey"] == "hard_training_day_count"
        assert legacy_week_goal["unit"] == "days"
        assert legacy_week_goal["maxAcceptable"] is None
        legacy_evaluation = next(
            evaluation
            for evaluation in week_response.json()["goalEvaluations"]
            if evaluation["goalId"] == "legacy-quality-week-goal"
        )
        assert legacy_evaluation["unit"] == "days"

        assert defaults_response.status_code == 200
        legacy_default = next(
            goal
            for goal in defaults_response.json()
            if goal["id"] == "legacy-quality-default-goal"
        )
        assert legacy_default["metricKey"] == "hard_training_day_count"
        assert legacy_default["unit"] == "days"


def test_invalid_legacy_default_goal_remains_readable_for_review() -> None:
    with TestClient(app) as client:
        login(client)
        profile_id = client.get("/api/auth/session/status").json()["activeAthleteAccountId"]
        with SessionLocal() as db:
            db.add(
                RecurringGoal(
                    id="invalid-legacy-default-goal",
                    athlete_account_id=profile_id,
                    metric_key="rest_day_count",
                    category="recovery",
                    goal_type="achievement",
                    label="Keep 12 rest days",
                    target_value=12,
                    min_acceptable=12,
                    unit="days",
                    evaluation_mode="at_least",
                    priority="secondary",
                )
            )
            db.commit()

        response = client.get("/api/default-goals")

        assert response.status_code == 200
        legacy_goal = next(
            goal for goal in response.json() if goal["id"] == "invalid-legacy-default-goal"
        )
        assert legacy_goal["metricKey"] is None
        assert legacy_goal["category"] == "custom"
        assert legacy_goal["unit"] == "custom"
        assert legacy_goal["evaluationMode"] == "manual"


def test_completing_review_snapshots_actual_weekly_metrics() -> None:
    db = make_session()
    try:
        athlete = planning.ensure_default_athlete(db)
        week = planning.get_or_create_week(db, date(2024, 4, 1), athlete.id)
        db.add(
            StravaActivity(
                strava_activity_id="review-run",
                athlete_account_id=athlete.id,
                name="Morning Run",
                sport_type="Run",
                start_date=datetime(2024, 4, 2, 14, 0),
                start_date_local=datetime(2024, 4, 2, 8, 0),
                distance=1609.344 * 5,
                raw_payload_json={},
            )
        )
        db.commit()

        planning.complete_week_review(db, week.id, athlete.id)

        snapshots = db.scalars(
            select(WeeklyMetricSnapshot).where(WeeklyMetricSnapshot.training_week_id == week.id)
        ).all()
        assert len(snapshots) == 8
        values = {snapshot.metric_key: snapshot.value for snapshot in snapshots}
        assert values["weekly_run_distance"] == 5
        assert values["rest_day_count"] == 6
        assert {snapshot.basis for snapshot in snapshots} == {"actual"}
    finally:
        db.close()
