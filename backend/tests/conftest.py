import os
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import inspect, text

from app.db.testing import validate_external_test_database_url

test_database_url = os.environ.get("TEST_DATABASE_URL")
test_database_path: Path | None = None
if test_database_url:
    validate_external_test_database_url(test_database_url)
else:
    test_database_path = Path(tempfile.gettempdir()) / f"run_planner_tests_{os.getpid()}.db"
    test_database_path.unlink(missing_ok=True)
    test_database_url = f"sqlite:///{test_database_path}"

os.environ["DATABASE_URL"] = test_database_url
os.environ["APP_ENV"] = "test"
os.environ["APP_USERNAME"] = "michael"
os.environ["APP_PASSWORD"] = "test-password"
os.environ["SESSION_COOKIE_SECURE"] = "false"

from app.db.migrations import run_migrations  # noqa: E402
from app.db.session import engine  # noqa: E402


@pytest.fixture(autouse=True)
def reset_database() -> None:
    """Give every test an empty application database while retaining the schema."""
    run_migrations()
    with engine.connect() as connection:
        table_names = [
            table_name
            for table_name in inspect(connection).get_table_names()
            if table_name not in {"schema_migrations", "sqlite_sequence"}
        ]
        quoted_names = [connection.dialect.identifier_preparer.quote(name) for name in table_names]

        if connection.dialect.name == "postgresql" and quoted_names:
            connection.execute(
                text(f"TRUNCATE TABLE {', '.join(quoted_names)} RESTART IDENTITY CASCADE")
            )
            connection.commit()
        else:
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            for table_name in quoted_names:
                connection.exec_driver_sql(f"DELETE FROM {table_name}")
            connection.commit()
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Dispose connections and remove the temporary database after the suite."""
    engine.dispose()
    if test_database_path:
        test_database_path.unlink(missing_ok=True)
