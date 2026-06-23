import logging
import time

from fastapi import HTTPException

from app.core.config import settings
from app.db.migrations import run_migrations
from app.db.session import SessionLocal, check_database_ready
from app.services import strava

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger("running_planner.worker")

MIN_SYNC_INTERVAL_SECONDS = 5 * 60


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
        if not strava.get_token(db):
            logger.info("Strava sync skipped; account is not connected")
            return

        try:
            job = strava.backfill_activities(
                db,
                days=settings.strava_sync_lookback_days,
                job_type="worker_incremental_poll",
            )
        except HTTPException as exc:
            logger.warning("Strava sync failed: %s", exc.detail)
            return
        except Exception:
            logger.exception("Strava sync failed unexpectedly")
            return

    logger.info(
        (
            "Strava sync succeeded; fetched=%s created=%s updated=%s unchanged=%s "
            "rate_limit_remaining=%s"
        ),
        job.activities_fetched,
        job.activities_created,
        job.activities_updated,
        job.activities_unchanged,
        job.rate_limit_remaining,
    )


def run_worker() -> None:
    check_database_ready()
    run_migrations()
    interval_seconds = sync_interval_seconds()
    logger.info(
        "worker started in %s mode; Strava poll interval=%ss lookback=%sd",
        settings.app_env,
        interval_seconds,
        settings.strava_sync_lookback_days,
    )
    while True:
        run_strava_poll()
        time.sleep(interval_seconds)


if __name__ == "__main__":
    run_worker()
