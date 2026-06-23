from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from app.db.session import engine

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


def migration_version(path: Path, dialect: str) -> str | None:
    dialect_suffix = f".{dialect}.sql"
    if path.name.endswith(dialect_suffix):
        return path.name.removesuffix(dialect_suffix)
    if any(path.name.endswith(f".{known}.sql") for known in ("postgresql", "sqlite")):
        return None
    return path.stem


def migration_files(dialect: str) -> list[tuple[str, Path]]:
    migrations: dict[str, Path] = {}
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        version = migration_version(path, dialect)
        if version is None:
            continue
        current = migrations.get(version)
        if current is None or path.name.endswith(f".{dialect}.sql"):
            migrations[version] = path
    return sorted(migrations.items())


def execute_sql_file(connection: Connection, path: Path) -> None:
    sql = path.read_text()
    if connection.dialect.name == "sqlite":
        raw_connection = connection.connection
        raw_connection.executescript(sql)
        return

    for statement in sql.split(";"):
        statement = statement.strip()
        if statement:
            connection.execute(text(statement))


def run_migrations(target_engine: Engine = engine) -> None:
    with target_engine.begin() as connection:
        dialect = connection.dialect.name
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                  version TEXT PRIMARY KEY,
                  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        applied = {
            row[0]
            for row in connection.execute(text("SELECT version FROM schema_migrations")).all()
        }

        for version, migration in migration_files(dialect):
            if version in applied:
                continue
            execute_sql_file(connection, migration)
            connection.execute(
                text("INSERT INTO schema_migrations (version) VALUES (:version)"),
                {"version": version},
            )
