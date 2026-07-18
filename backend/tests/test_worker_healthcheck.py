import os

import pytest

from app.workers import healthcheck


def test_worker_health_accepts_a_fresh_heartbeat(tmp_path, monkeypatch) -> None:
    path = tmp_path / "worker-heartbeat"
    path.touch()
    database_checks = []
    monkeypatch.setattr(
        healthcheck,
        "check_database_ready",
        lambda: database_checks.append("ready"),
    )

    healthcheck.check_worker_health(
        path=path,
        max_age_seconds=60,
        now=path.stat().st_mtime + 10,
    )

    assert database_checks == ["ready"]


def test_worker_health_rejects_a_missing_heartbeat(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(healthcheck, "check_database_ready", lambda: None)

    with pytest.raises(RuntimeError, match="has not been created"):
        healthcheck.check_worker_health(path=tmp_path / "missing", max_age_seconds=60)


def test_worker_health_rejects_a_stale_heartbeat(tmp_path, monkeypatch) -> None:
    path = tmp_path / "worker-heartbeat"
    path.touch()
    os.utime(path, (100, 100))
    monkeypatch.setattr(healthcheck, "check_database_ready", lambda: None)

    with pytest.raises(RuntimeError, match="is stale"):
        healthcheck.check_worker_health(path=path, max_age_seconds=60, now=161)
