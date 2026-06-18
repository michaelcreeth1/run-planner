# Architecture

## Phase 0 Shape

```text
Browser / installed PWA
        |
        v
React + Vite frontend
        |
        v
FastAPI API container
        |
        v
SQLite database file

FastAPI worker container
        |
        v
SQLite database file
```

The worker and API share the same codebase and database path. This keeps Phase 0 small while preserving a clean split between request handling and background work.

## Local Ports and Paths

- Frontend dev/PWA shell: `http://localhost:5173`
- API: `http://localhost:8000`
- Health: `http://localhost:8000/healthz`
- Readiness: `http://localhost:8000/readyz`
- SQLite path: `./data/running_planner.db`

The API and worker mount `./data` into `/app/data`.

## Access

Phase 0 assumes private access through local network or Tailscale. The API includes signed-cookie session endpoints:

```http
GET  /api/auth/session/status
POST /api/auth/session/login
POST /api/auth/session/logout
```

Set `APP_PASSWORD` before relying on local app login outside development.

## Later Homelab Shape

```text
Internet / LAN / Tailscale
        |
        v
Caddy LXC
        |
        v
Docker host LXC
        |-- frontend container or static files
        |-- backend API container
        |-- worker container
        `-- optional Redis container

Postgres LXC
        `-- running_planner database
```

SQLite is the default while Postgres is not ready. The backend uses SQLAlchemy so the database URL can move to Postgres when the homelab database role exists.

## Versioning

The backend exposes:

```http
GET /api/version
```

The frontend checks this endpoint on launch. If `forceReload` is true or the installed frontend version is below `frontendMinVersion`, unsafe writes should be blocked. The Phase 0 UI displays the warning; write blocking becomes meaningful when mutations land in Phase 1.

## Sync

The app owns the Strava OAuth and activity import path:

```http
GET  /api/auth/strava/start
GET  /api/auth/strava/callback
GET  /api/auth/strava/status
POST /api/auth/strava/disconnect
POST /api/sync/strava/backfill
POST /api/sync/strava/incremental
GET  /api/sync/jobs
GET  /api/activities
```

Tokens are encrypted before storage. The current sync implementation supports manual backfill and a short incremental polling path. Webhooks remain deferred.

## Migrations

SQLite migrations live in `backend/migrations` and are applied at API startup through the backend migration runner. The first migration creates:

- `athlete_accounts`
- `training_weeks`
- `planned_workouts`
- `planned_workout_steps`
- `workout_templates`
- `strava_oauth_tokens`
- `strava_activities`
- `sync_jobs`

The runner records applied files in `schema_migrations`.
