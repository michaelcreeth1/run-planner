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

SQLite is used during the early planning phases. Postgres remains the production target once the dedicated LXC is ready, especially for JSONB raw Strava payloads and stronger concurrent worker behavior.
