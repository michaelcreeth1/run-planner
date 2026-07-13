import os

from sqlalchemy.engine import make_url

DESTRUCTIVE_TEST_OPT_IN = "RUN_PLANNER_ALLOW_DESTRUCTIVE_TESTS"


def validate_external_test_database_url(database_url: str) -> None:
    """Reject database targets that could plausibly contain non-test data."""
    try:
        parsed = make_url(database_url)
    except Exception as error:
        raise RuntimeError("TEST_DATABASE_URL must be a valid PostgreSQL URL.") from error

    if parsed.get_backend_name() != "postgresql":
        raise RuntimeError("TEST_DATABASE_URL may only target a disposable PostgreSQL database.")

    database_name = parsed.database or ""
    if not database_name.endswith("_test"):
        raise RuntimeError("TEST_DATABASE_URL must use a database name ending in '_test'.")

    if os.environ.get(DESTRUCTIVE_TEST_OPT_IN) != "1":
        raise RuntimeError(
            f"Set {DESTRUCTIVE_TEST_OPT_IN}=1 to confirm destructive PostgreSQL test cleanup."
        )
