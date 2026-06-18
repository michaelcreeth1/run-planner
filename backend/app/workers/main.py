import logging
import time

from app.core.config import settings
from app.db.session import check_database_ready

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger("running_planner.worker")


def run_worker() -> None:
    check_database_ready()
    logger.info("worker started in %s mode", settings.app_env)
    while True:
        logger.info("worker heartbeat; Strava polling is not implemented yet")
        time.sleep(3600)


if __name__ == "__main__":
    run_worker()
