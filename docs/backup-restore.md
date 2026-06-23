# Backup and Restore

## Postgres Backup

The app uses a dedicated `running_planner` database on the shared Postgres instance. Do not store app tables in the default `postgres` database.

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

## Legacy SQLite Export

The old development database lived at:

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
