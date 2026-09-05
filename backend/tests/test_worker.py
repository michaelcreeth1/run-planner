from types import SimpleNamespace

import pytest

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
    monkeypatch.setattr(worker.strava, "connected_athlete_ids", lambda _db: [])
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

    def fake_backfill(_db, athlete_id: str, days: int, job_type: str):
        calls.append({"athlete_id": athlete_id, "days": days, "job_type": job_type})
        return job

    monkeypatch.setattr(worker.settings, "strava_sync_enabled", True)
    monkeypatch.setattr(worker.settings, "strava_sync_lookback_days", 14)
    monkeypatch.setattr(worker.strava, "strava_configured", lambda: True)
    monkeypatch.setattr(worker, "SessionLocal", FakeSession)
    monkeypatch.setattr(worker.strava, "connected_athlete_ids", lambda _db: ["athlete-1"])
    monkeypatch.setattr(worker.strava, "backfill_activities", fake_backfill)

    worker.run_strava_poll()

    assert calls == [
        {"athlete_id": "athlete-1", "days": 14, "job_type": "worker_incremental_poll"}
    ]


def test_worker_loop_retries_after_an_unexpected_cycle_failure(monkeypatch) -> None:
    class StopWorker(BaseException):
        pass

    cycle_calls = []
    heartbeat_calls = []
    waits = []

    def fake_cycle() -> None:
        cycle_calls.append("cycle")
        if len(cycle_calls) == 1:
            raise RuntimeError("temporary database failure")
        raise StopWorker

    monkeypatch.setattr(worker, "run_worker_cycle", fake_cycle)
    monkeypatch.setattr(
        worker,
        "write_worker_heartbeat",
        lambda: heartbeat_calls.append("heartbeat"),
    )
    monkeypatch.setattr(
        worker,
        "wait_with_heartbeat",
        lambda seconds: waits.append(seconds),
    )

    with pytest.raises(StopWorker):
        worker.run_worker_loop(interval_seconds=300)

    assert cycle_calls == ["cycle", "cycle"]
    assert heartbeat_calls == ["heartbeat", "heartbeat"]
    assert waits == [worker.ERROR_RETRY_SECONDS]


def test_heartbeat_loop_refreshes_independently_until_stopped(monkeypatch) -> None:
    heartbeat_calls = []
    waits = []

    class StopEvent:
        stopped = False

        def is_set(self) -> bool:
            return self.stopped

        def wait(self, seconds: int) -> bool:
            waits.append(seconds)
            self.stopped = True
            return True

    monkeypatch.setattr(
        worker,
        "write_worker_heartbeat",
        lambda: heartbeat_calls.append("heartbeat"),
    )

    worker.run_heartbeat_loop(StopEvent())  # type: ignore[arg-type]

    assert heartbeat_calls == ["heartbeat"]
    assert waits == [worker.HEARTBEAT_INTERVAL_SECONDS]


def test_run_worker_stops_the_independent_heartbeat(monkeypatch) -> None:
    class StopWorker(BaseException):
        pass

    class FakeStopEvent:
        stopped = False

        def set(self) -> None:
            self.stopped = True

    class FakeHeartbeatThread:
        joined_with = None

        def join(self, timeout: int) -> None:
            self.joined_with = timeout

    stop_event = FakeStopEvent()
    heartbeat_thread = FakeHeartbeatThread()
    monkeypatch.setattr(
        worker,
        "start_worker_heartbeat",
        lambda: (stop_event, heartbeat_thread),
    )
    monkeypatch.setattr(worker, "check_database_ready", lambda: None)
    monkeypatch.setattr(worker, "run_migrations", lambda: None)
    monkeypatch.setattr(worker, "sync_interval_seconds", lambda: 300)
    monkeypatch.setattr(
        worker,
        "run_worker_loop",
        lambda _interval: (_ for _ in ()).throw(StopWorker),
    )

    with pytest.raises(StopWorker):
        worker.run_worker()

    assert stop_event.stopped is True
    assert heartbeat_thread.joined_with == worker.HEARTBEAT_INTERVAL_SECONDS
