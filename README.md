# Running Planner

A self-hosted, mobile-first running planner that treats Strava as the source of completed activity data while owning the training plan, reconciliation, and weekly adjustment loop.

## Phase 0 Scope

This repository currently contains the infrastructure skeleton:

- React + Vite + TypeScript PWA shell.
- FastAPI backend with `/healthz`, `/readyz`, and `/api/version`.
- SQLite development database target.
- Worker container entrypoint.
- Docker Compose for `frontend`, `api`, and `worker`.
- Local signed-cookie session endpoints.
- SQLite migration runner with initial planning tables.
- API-backed weekly planning board.
- Planned workout create, edit, delete, duplicate, and move controls.
- App-owned Strava OAuth, encrypted token storage, and activity backfill.
- AI endpoints stubbed for later phases.

## Local Development

Copy the environment template:

```sh
cp .env.example .env
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

## Current Decisions

- Frontend: React/Vite/TypeScript.
- Backend: FastAPI/Python.
- Database: SQLite for Phase 0, Postgres later.
- Worker: separate container using the backend image.
- Sync: manual backfill and polling MVP, no webhook in Phase 0.
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

Imported activities are available at:

```http
GET /api/activities
```
