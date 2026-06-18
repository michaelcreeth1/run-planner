from pathlib import Path

from sqlalchemy import text

from app.db.session import engine

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


def run_migrations() -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                  version TEXT PRIMARY KEY,
                  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        applied = {
            row[0]
            for row in connection.execute(text("SELECT version FROM schema_migrations")).all()
        }

        for migration in sorted(MIGRATIONS_DIR.glob("*.sql")):
            version = migration.stem
            if version in applied:
                continue
            sql = migration.read_text()
            raw_connection = connection.connection
            raw_connection.executescript(sql)
            connection.execute(
                text("INSERT INTO schema_migrations (version) VALUES (:version)"),
                {"version": version},
            )
