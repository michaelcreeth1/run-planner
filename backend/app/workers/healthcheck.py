import os
import time
from pathlib import Path

from app.db.session import check_database_ready

DEFAULT_HEARTBEAT_PATH = "/tmp/run-planner-worker-heartbeat"
DEFAULT_MAX_AGE_SECONDS = 5 * 60


def heartbeat_path() -> Path:
    return Path(os.environ.get("WORKER_HEARTBEAT_PATH", DEFAULT_HEARTBEAT_PATH))


def heartbeat_max_age_seconds() -> int:
    return int(
        os.environ.get(
            "WORKER_HEARTBEAT_MAX_AGE_SECONDS",
            str(DEFAULT_MAX_AGE_SECONDS),
        )
    )


def check_worker_health(
    *,
    path: Path | None = None,
    max_age_seconds: int | None = None,
    now: float | None = None,
) -> None:
    resolved_path = path or heartbeat_path()
    resolved_max_age = (
        heartbeat_max_age_seconds() if max_age_seconds is None else max_age_seconds
    )
    current_time = time.time() if now is None else now

    try:
        modified_at = resolved_path.stat().st_mtime
    except FileNotFoundError as exc:
        raise RuntimeError("Worker heartbeat has not been created.") from exc

    heartbeat_age = current_time - modified_at
    if heartbeat_age < 0 or heartbeat_age > resolved_max_age:
        raise RuntimeError(
            f"Worker heartbeat is stale ({heartbeat_age:.1f}s old; "
            f"maximum {resolved_max_age}s)."
        )

    check_database_ready()


def main() -> None:
    try:
        check_worker_health()
    except Exception as exc:
        print(f"Worker health check failed: {exc}")
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
