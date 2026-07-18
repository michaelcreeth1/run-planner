# Backup and Restore

## Postgres Backup

The app uses a dedicated `running_planner` database on the shared Postgres instance. Do not store app tables in the default `postgres` database.

The database and its backups are external to the Run Planner application bundle. A source rollback performed by the deployment scripts does not restore or reverse database state. Back up the shared Postgres project independently before risky migrations, and keep migrations backward-compatible with the prior application release.

Use logical backups:

```sh
pg_dump "$DATABASE_URL" | gzip > running_planner_YYYY-MM-DD_HHMM.sql.gz
```

Retention target:

- 7 daily backups.
- 4 weekly backups.
- Stored outside the app container, preferably on NAS/NFS.

Restore into a dedicated database:

```sh
createdb running_planner_restore
gunzip -c running_planner_YYYY-MM-DD_HHMM.sql.gz | psql running_planner_restore
```

Restore testing should be part of the homelab maintenance routine before the app becomes the primary planning record.
The application deployment scripts do not configure this backup job or retention; that coverage must be installed and verified in the shared Postgres homelab project.

## Test or Legacy SQLite Import

The repository SQLite database is test data and is not a production backup. For an intentional one-time import from a separate legacy SQLite database, the source may live at:

```text
./data/running_planner.db
```

To copy existing SQLite rows into Postgres, stop the API and worker, then run:

```sh
docker compose stop api worker
cd backend
python scripts/migrate_sqlite_to_postgres.py \
  --sqlite-url sqlite:///./data/running_planner.db \
  --postgres-url "$DATABASE_URL"
```
