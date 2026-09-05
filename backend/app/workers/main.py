import logging
import threading
import time

from fastapi import HTTPException

from app.core.config import settings
from app.db.migrations import run_migrations
from app.db.session import SessionLocal, check_database_ready
from app.services import strava
from app.workers.healthcheck import heartbeat_path

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger("running_planner.worker")

MIN_SYNC_INTERVAL_SECONDS = 5 * 60
HEARTBEAT_INTERVAL_SECONDS = 30
ERROR_RETRY_SECONDS = 60


def sync_interval_seconds() -> int:
    if settings.strava_sync_interval_seconds < MIN_SYNC_INTERVAL_SECONDS:
        logger.warning(
            "STRAVA_SYNC_INTERVAL_SECONDS=%s is too low; using %s seconds",
            settings.strava_sync_interval_seconds,
            MIN_SYNC_INTERVAL_SECONDS,
        )
        return MIN_SYNC_INTERVAL_SECONDS
    return settings.strava_sync_interval_seconds


def run_strava_poll() -> None:
    if not settings.strava_sync_enabled:
        logger.info("Strava sync worker is disabled")
        return

    if not strava.strava_configured():
        logger.info("Strava sync skipped; client credentials are not configured")
        return

    with SessionLocal() as db:
        athlete_ids = strava.connected_athlete_ids(db)
        if not athlete_ids:
            logger.info("Strava sync skipped; account is not connected")
            return

        for athlete_id in athlete_ids:
            try:
                job = strava.backfill_activities(
                    db,
                    athlete_id,
                    days=settings.strava_sync_lookback_days,
                    job_type="worker_incremental_poll",
                )
            except HTTPException as exc:
                logger.warning("Strava sync failed for athlete %s: %s", athlete_id, exc.detail)
                continue
            except Exception:
                logger.exception("Strava sync failed unexpectedly for athlete %s", athlete_id)
                continue

            logger.info(
                (
                    "Strava sync succeeded for athlete %s; fetched=%s created=%s "
                    "updated=%s unchanged=%s rate_limit_remaining=%s"
                ),
                athlete_id,
                job.activities_fetched,
                job.activities_created,
                job.activities_updated,
                job.activities_unchanged,
                job.rate_limit_remaining,
            )


def run_strava_webhook_queue() -> None:
    if not settings.strava_webhook_enabled:
        return

    with SessionLocal() as db:
        events = strava.process_pending_webhook_events(db)
        if events:
            logger.info("Processed %s pending Strava webhook events", len(events))


def write_worker_heartbeat() -> None:
    path = heartbeat_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()


def run_heartbeat_loop(stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        try:
            write_worker_heartbeat()
        except Exception:
            logger.exception("Failed to update worker heartbeat")
        stop_event.wait(HEARTBEAT_INTERVAL_SECONDS)


def start_worker_heartbeat() -> tuple[threading.Event, threading.Thread]:
    stop_event = threading.Event()
    heartbeat_thread = threading.Thread(
        target=run_heartbeat_loop,
        args=(stop_event,),
        name="worker-heartbeat",
        daemon=True,
    )
    heartbeat_thread.start()
    return stop_event, heartbeat_thread


def wait_with_heartbeat(seconds: int) -> None:
    deadline = time.monotonic() + max(seconds, 0)
    while True:
        write_worker_heartbeat()
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        time.sleep(min(HEARTBEAT_INTERVAL_SECONDS, remaining))


def run_worker_cycle() -> None:
    run_strava_webhook_queue()
    run_strava_poll()


def run_worker_loop(interval_seconds: int) -> None:
    while True:
        write_worker_heartbeat()
        try:
            run_worker_cycle()
        except Exception:
            logger.exception(
                "Worker cycle failed unexpectedly; retrying in %ss",
                ERROR_RETRY_SECONDS,
            )
            wait_with_heartbeat(min(ERROR_RETRY_SECONDS, interval_seconds))
            continue

        wait_with_heartbeat(interval_seconds)


def run_worker() -> None:
    stop_event, heartbeat_thread = start_worker_heartbeat()
    try:
        check_database_ready()
        run_migrations()
        interval_seconds = sync_interval_seconds()
        logger.info(
            "worker started in %s mode; Strava poll interval=%ss lookback=%sd",
            settings.app_env,
            interval_seconds,
            settings.strava_sync_lookback_days,
        )
        run_worker_loop(interval_seconds)
    finally:
        stop_event.set()
        heartbeat_thread.join(timeout=HEARTBEAT_INTERVAL_SECONDS)


if __name__ == "__main__":
    run_worker()
