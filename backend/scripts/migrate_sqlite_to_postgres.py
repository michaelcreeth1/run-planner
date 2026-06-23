from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import JSON, Boolean, Date, DateTime, MetaData, Table, create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.migrations import run_migrations  # noqa: E402
from app.db.session import normalize_database_url  # noqa: E402

TABLE_ORDER = [
    "athlete_accounts",
    "training_weeks",
    "planned_workouts",
    "planned_workout_steps",
    "workout_templates",
    "strava_oauth_tokens",
    "strava_activities",
    "sync_jobs",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy Running Planner data from the old SQLite file into Postgres."
    )
    parser.add_argument(
        "--sqlite-url",
        default="sqlite:///./data/running_planner.db",
        help="Source SQLite SQLAlchemy URL.",
    )
    parser.add_argument(
        "--postgres-url",
        required=True,
        help="Target Postgres SQLAlchemy URL for the dedicated running_planner database.",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Delete existing app rows in Postgres before copying.",
    )
    return parser.parse_args()


def make_engine(database_url: str) -> Engine:
    return create_engine(normalize_database_url(database_url), pool_pre_ping=True)


def parse_date(value: Any) -> Any:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return value


def parse_datetime(value: Any) -> Any:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    return value


def parse_json(value: Any) -> Any:
    if value is None or isinstance(value, dict | list):
        return value
    if isinstance(value, str):
        return json.loads(value)
    return value


def coerce_value(column, value: Any) -> Any:
    column_type = column.type
    if value is None:
        return None
    if isinstance(column_type, DateTime):
        return parse_datetime(value)
    if isinstance(column_type, Date):
        return parse_date(value)
    if isinstance(column_type, Boolean):
        return bool(value)
    if isinstance(column_type, JSON | JSONB):
        return parse_json(value)
    return value


def copy_table(source_engine: Engine, target_engine: Engine, table_name: str) -> int:
    source_metadata = MetaData()
    target_metadata = MetaData()
    source_table = Table(table_name, source_metadata, autoload_with=source_engine)
    target_table = Table(table_name, target_metadata, autoload_with=target_engine)
    target_columns = {column.name: column for column in target_table.columns}

    with source_engine.connect() as source, target_engine.begin() as target:
        rows = source.execute(select(source_table)).mappings().all()
        if not rows:
            return 0

        coerced_rows = []
        for row in rows:
            coerced_rows.append(
                {
                    name: coerce_value(target_columns[name], value)
                    for name, value in row.items()
                    if name in target_columns
                }
            )
        target.execute(target_table.insert(), coerced_rows)
        return len(coerced_rows)


def truncate_tables(target_engine: Engine) -> None:
    target_metadata = MetaData()
    target_metadata.reflect(bind=target_engine, only=TABLE_ORDER)
    with target_engine.begin() as connection:
        for table_name in reversed(TABLE_ORDER):
            table = target_metadata.tables.get(table_name)
            if table is not None:
                connection.execute(table.delete())


def main() -> None:
    args = parse_args()
    source_engine = make_engine(args.sqlite_url)
    target_engine = make_engine(args.postgres_url)

    run_migrations(target_engine)
    if args.truncate:
        truncate_tables(target_engine)

    copied = {}
    for table_name in TABLE_ORDER:
        copied[table_name] = copy_table(source_engine, target_engine, table_name)

    for table_name, row_count in copied.items():
        print(f"{table_name}: {row_count}")


if __name__ == "__main__":
    main()
