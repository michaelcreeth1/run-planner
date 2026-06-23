from types import SimpleNamespace

from app.workers import main as worker


class FakeSession:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None


def test_sync_interval_has_floor(monkeypatch) -> None:
    monkeypatch.setattr(worker.settings, "strava_sync_interval_seconds", 60)

    assert worker.sync_interval_seconds() == worker.MIN_SYNC_INTERVAL_SECONDS


def test_run_strava_poll_skips_when_disabled(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(worker.settings, "strava_sync_enabled", False)
    monkeypatch.setattr(worker.strava, "strava_configured", lambda: calls.append("configured"))

    worker.run_strava_poll()

    assert calls == []


def test_run_strava_poll_skips_without_connected_token(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(worker.settings, "strava_sync_enabled", True)
    monkeypatch.setattr(worker.strava, "strava_configured", lambda: True)
    monkeypatch.setattr(worker, "SessionLocal", FakeSession)
    monkeypatch.setattr(worker.strava, "get_token", lambda _db: None)
    monkeypatch.setattr(
        worker.strava,
        "backfill_activities",
        lambda *_args, **_kwargs: calls.append("sync"),
    )

    worker.run_strava_poll()

    assert calls == []


def test_run_strava_poll_runs_incremental_backfill(monkeypatch) -> None:
    calls = []
    job = SimpleNamespace(
        activities_fetched=1,
        activities_created=1,
        activities_updated=0,
        activities_unchanged=0,
        rate_limit_remaining=99,
    )

    def fake_backfill(_db, days: int, job_type: str):
        calls.append({"days": days, "job_type": job_type})
        return job

    monkeypatch.setattr(worker.settings, "strava_sync_enabled", True)
    monkeypatch.setattr(worker.settings, "strava_sync_lookback_days", 14)
    monkeypatch.setattr(worker.strava, "strava_configured", lambda: True)
    monkeypatch.setattr(worker, "SessionLocal", FakeSession)
    monkeypatch.setattr(worker.strava, "get_token", lambda _db: object())
    monkeypatch.setattr(worker.strava, "backfill_activities", fake_backfill)

    worker.run_strava_poll()

    assert calls == [{"days": 14, "job_type": "worker_incremental_poll"}]
