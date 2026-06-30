# Running Planner

A self-hosted, mobile-first running planner that treats Strava as the source of completed activity data while owning the training plan, reconciliation, and weekly adjustment loop.

## Phase 0 Scope

This repository currently contains the infrastructure skeleton:

- React + Vite + TypeScript PWA shell.
- FastAPI backend with `/healthz`, `/readyz`, and `/api/version`.
- Postgres database target.
- Worker container entrypoint.
- Docker Compose for `frontend`, `api`, and `worker`.
- Local signed-cookie session endpoints.
- SQL migration runner with initial planning tables.
- API-backed weekly planning board.
- Planned workout create, edit, delete, duplicate, and move controls.
- App-owned Strava OAuth, encrypted token storage, and activity backfill.
- AI endpoints stubbed for later phases.

## Local Development

Copy the environment template:

```sh
cp .env.example .env
```

Create a dedicated database on the shared Postgres instance. Do not use the default
`postgres` database for app data:

```sh
createdb running_planner
```

Set `DATABASE_URL` in `.env` to that dedicated database, for example:

```sh
DATABASE_URL=postgresql+psycopg://running_planner:change-me@localhost:5432/running_planner
```

Run the backend:

```sh
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

Run the frontend:

```sh
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Docker Compose

```sh
docker compose up --build
```

The API is available at `http://localhost:8000`; the frontend is available at `http://localhost:5173`.
The compose stack expects `DATABASE_URL` to point at the shared Postgres instance.

## Deployment

The normal homelab deploy starts on the dev machine. It syncs this local checkout
to the Docker host bundle at `/home/mike/compose/run-planner`, including the
local `.env` as the deploy configuration, then runs the host-side Compose deploy:

```sh
scripts/deploy-remote.sh
```

Remote deploy refuses local-only database URLs such as `localhost` or `127.0.0.1`;
the local `.env` must use the same Docker-network or remote-reachable database host
that the deployed containers will use.

Preview the sync without changing the server:

```sh
scripts/deploy-remote.sh --dry-run
```

Pass options through to the host-side deploy script after `--`:

```sh
scripts/deploy-remote.sh -- --skip-build
scripts/deploy-remote.sh -- --no-wait
```

The host-side script is still available for repeatable Docker-based deploys
from the synced server bundle:

```sh
cp .env.example .env
scripts/deploy.sh
```

The script validates the env file, requires production-safe cookie settings when
`APP_ENV=production`, runs `docker compose up -d --build`, and waits for the API
health check before returning.

`APP_USERNAME` and `APP_PASSWORD` bootstrap the first admin account when the database has
no users. After that, users and athlete profiles are managed in the app, and each request
is scoped to the selected profile.

For the Caddy deployment on `https://run.home.arpa` and `https://run.creeth.net`, set:

```text
APP_ENV=production
APP_BASE_URL=https://run.creeth.net
API_BASE_URL=https://run.creeth.net
STRAVA_REDIRECT_URI=https://run.creeth.net/api/auth/strava/callback
SESSION_COOKIE_SECURE=true
CORS_ORIGINS=https://run.home.arpa,https://run.creeth.net
VITE_API_BASE_URL=
```

Useful host-side options:

```sh
scripts/deploy.sh --skip-build
scripts/deploy.sh --env-file /path/to/run-planner.env
scripts/deploy.sh --no-wait
```

## Current Decisions

- Frontend: React/Vite/TypeScript.
- Backend: FastAPI/Python.
- Database: dedicated Postgres database on the shared database instance.
- Worker: separate container using the backend image.
- Sync: manual backfill plus worker polling every 30 minutes with a 14-day lookback, no webhook in Phase 0.
- Auth: private/Tailscale access plus local session later.
- AI: stub provider in Phase 0.

## Planning API

The first planning endpoints are available:

```http
GET    /api/weeks
GET    /api/weeks/current
GET    /api/weeks/{weekStartDate}
PATCH  /api/weeks/{id}
POST   /api/weeks/{id}/recalculate
POST   /api/weeks/{id}/copy-prior
POST   /api/weeks/{id}/goals
POST   /api/weeks/{id}/goals/derive
PATCH  /api/week-goals/{id}
DELETE /api/week-goals/{id}

GET    /api/planned-workouts
POST   /api/planned-workouts
GET    /api/planned-workouts/{id}
PATCH  /api/planned-workouts/{id}
DELETE /api/planned-workouts/{id}
POST   /api/planned-workouts/{id}/move
POST   /api/planned-workouts/{id}/duplicate
```

## Strava Import

Connect Strava through the app-owned OAuth flow:

```http
GET /api/auth/strava/start
```

After the callback stores encrypted tokens, import recent activities:

```http
POST /api/sync/strava/backfill
```

The worker runs an incremental Strava import immediately on startup and then every
30 minutes by default. Tune this with `STRAVA_SYNC_ENABLED`,
`STRAVA_SYNC_INTERVAL_SECONDS`, and `STRAVA_SYNC_LOOKBACK_DAYS`.

For push-based activity updates, expose the Strava webhook callback and register
a Strava push subscription:

```http
GET/POST /api/webhooks/strava
```

Set `STRAVA_WEBHOOK_ENABLED=true`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, and, after
registration, `STRAVA_WEBHOOK_SUBSCRIPTION_ID`. Webhooks import activity
create/update events immediately and mark delete events locally; keep a slower
poll as reconciliation for missed webhook deliveries.

Imported activities are available at:

```http
GET /api/activities
```
