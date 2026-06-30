# Architecture

## Current Shape

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
Dedicated running_planner database
on shared Postgres instance

FastAPI worker container
        |
        v
Dedicated running_planner database
on shared Postgres instance
```

The worker and API share the same codebase and database URL. The database lives in a dedicated `running_planner` database on the shared Postgres instance, not in the default `postgres` database.

## Local Ports and Paths

- Frontend dev/PWA shell: `http://localhost:5173`
- API: `http://localhost:8000`
- Health: `http://localhost:8000/healthz`
- Readiness: `http://localhost:8000/readyz`
- Database: `DATABASE_URL`, pointed at the dedicated Postgres database.

## Access

Phase 0 assumes private access through local network or Tailscale. The API uses DB-backed
user accounts, signed session cookies, and an active athlete profile for data isolation.
`APP_USERNAME` and `APP_PASSWORD` bootstrap the first admin user when no users exist.

```http
GET  /api/auth/session/status
POST /api/auth/session/login
POST /api/auth/session/logout
POST /api/auth/session/profile
POST /api/auth/users
POST /api/auth/profiles
```

Set `APP_PASSWORD` before first startup. Existing single-user athlete data is assigned to
the bootstrap admin, and all planning, activity, sync, and Strava routes require an
authenticated owned profile.

## Homelab Shape

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

Shared Postgres instance
        `-- running_planner database
```

The backend uses SQLAlchemy with the psycopg driver. `postgres://` and `postgresql://` URLs are normalized to `postgresql+psycopg://`.

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
GET  /api/webhooks/strava
POST /api/webhooks/strava
```

Tokens are encrypted before storage. The sync implementation supports manual backfill, worker-driven reconciliation polling, and Strava webhooks. The worker runs once at startup and then every 30 minutes by default, importing the last 14 days of activities to catch delayed uploads and edits. In webhook-enabled deployments, use Strava's app-level push subscription for normal activity freshness and stretch the worker poll interval to a slower reconciliation cadence.

The public webhook callback validates Strava's `hub.challenge` request with `STRAVA_WEBHOOK_VERIFY_TOKEN`. Pushed activity events are stored in `strava_webhook_events`, routed by Strava `owner_id` to `athlete_accounts.strava_athlete_id`, and processed after the API response. The worker retries queued or failed webhook events.

## Migrations

SQL migrations live in `backend/migrations` and are applied at API startup through the backend migration runner. Dialect-specific files can override a generic migration by using a suffix such as `.postgresql.sql`. The first migrations create:

- `athlete_accounts`
- `training_weeks`
- `planned_workouts`
- `planned_workout_steps`
- `workout_templates`
- `strava_oauth_tokens`
- `strava_activities`
- `strava_webhook_events`
- `sync_jobs`

The runner records applied files in `schema_migrations`.
