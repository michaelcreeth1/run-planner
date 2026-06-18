# Backup and Restore

## Phase 0 SQLite Backup

The development database lives at:

```text
./data/running_planner.db
```

Stop the API and worker before copying the SQLite file:

```sh
docker compose stop api worker
mkdir -p backups
cp data/running_planner.db backups/running_planner_YYYY-MM-DD_HHMM.db
docker compose start api worker
```

## Later Postgres Backup

When the app moves to Postgres, use nightly logical backups:

```sh
pg_dump "$DATABASE_URL" | gzip > running_planner_YYYY-MM-DD_HHMM.sql.gz
```

Retention target:

- 7 daily backups.
- 4 weekly backups.
- Stored outside the app container, preferably on NAS/NFS.

Restore testing should be part of the homelab maintenance routine before the app becomes the primary planning record.
