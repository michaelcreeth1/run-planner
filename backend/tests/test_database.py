import os

import pytest
from sqlalchemy import text

from app.db.migrations import migration_files, run_migrations
from app.db.session import engine
from app.db.testing import DESTRUCTIVE_TEST_OPT_IN, validate_external_test_database_url


def test_external_database_target_requires_a_postgres_test_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(DESTRUCTIVE_TEST_OPT_IN, "1")

    with pytest.raises(RuntimeError, match="PostgreSQL"):
        validate_external_test_database_url("sqlite:////tmp/run-planner.db")

    with pytest.raises(RuntimeError, match="ending in '_test'"):
        validate_external_test_database_url("postgresql+psycopg://runner:password@localhost/run_planner")


def test_external_database_target_requires_an_explicit_destructive_opt_in(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(DESTRUCTIVE_TEST_OPT_IN, raising=False)

    with pytest.raises(RuntimeError, match=DESTRUCTIVE_TEST_OPT_IN):
        validate_external_test_database_url(
            "postgresql+psycopg://runner:password@localhost/run_planner_test"
        )

    monkeypatch.setenv(DESTRUCTIVE_TEST_OPT_IN, "1")
    validate_external_test_database_url(
        "postgresql+psycopg://runner:password@localhost/run_planner_test"
    )


def test_all_dialect_migrations_are_recorded_and_idempotent() -> None:
    run_migrations()
    run_migrations()

    expected = [version for version, _ in migration_files(engine.dialect.name)]
    with engine.connect() as connection:
        applied = list(
            connection.execute(
                text("SELECT version FROM schema_migrations ORDER BY version")
            ).scalars()
        )

    assert applied == expected


@pytest.mark.postgresql
def test_postgresql_suite_uses_the_production_database_dialect() -> None:
    if not os.environ.get("TEST_DATABASE_URL"):
        pytest.skip("TEST_DATABASE_URL is not configured")

    assert engine.dialect.name == "postgresql"
    with engine.connect() as connection:
        database_name = connection.execute(text("SELECT current_database()")).scalar_one()

    assert database_name
