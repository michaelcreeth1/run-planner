# Data Model

The requirements document is the source of truth for the target domain model. Phase 1 now includes the first planning tables.

Implemented:

- Athlete account.
- Training week.
- Planned workout.
- Planned workout step.
- Workout template.
- Strava OAuth token.
- Strava activity.
- Sync job.

Remaining implementation order:

1. Training block.
2. Workout match.
3. Daily check-in and weekly summary.
4. Goal race and gear.

Postgres is now the app database. Use a dedicated `running_planner` database on the shared Postgres instance rather than the default `postgres` database. Raw Strava payloads are stored as JSONB in Postgres, while SQLite remains only a legacy source format for migration and lightweight tests.
