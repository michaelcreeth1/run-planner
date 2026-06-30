# Data Model

The requirements document is the source of truth for the target domain model. Phase 1 now includes the first planning tables.

Implemented:

- User account.
- Athlete account.
- Training week.
- Planned workout.
- Planned workout step.
- Workout template.
- Strava OAuth token.
- Strava activity.
- Strava webhook event.
- Sync job.

Athlete accounts are owned by user accounts. API requests operate through the active
athlete profile stored in the signed session cookie, so planning, Strava, activity, and
sync data are isolated per owned profile.

Remaining implementation order:

1. Training block.
2. Workout match.
3. Daily check-in and weekly summary.
4. Goal race and gear.

Postgres is now the app database. Use a dedicated `running_planner` database on the shared Postgres instance rather than the default `postgres` database. Raw Strava payloads and webhook event payloads are stored as JSONB in Postgres, while SQLite remains only a legacy source format for migration and lightweight tests.
