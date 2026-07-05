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

1. Training plan, mesocycle, goal race, and recurring plan goal (implemented — see
   `requirements/training-plans-requirements.md` and `docs/training-plans-design.md`;
   this supersedes the earlier "training block" roadmap item, and adds
   `mesocycle_id`, structured `purpose`, `target_mileage`, per-field source
   columns, and `is_down_week` to training weeks).

   Goal model (migration 008): `WeekGoal` is the only evaluated goal. `GoalRace`
   holds the outcome (race date + target time); mesocycles hold the numeric
   trajectory that scaffolds week scalar targets; `plan_recurring_goals` hold
   standing weekly intent that plan sync materializes into `WeekGoal` rows with
   `source='plan'`. Workout-derived week goals use `source='workouts'`; manual
   edits flip a goal to `source='manual'`, which protects it from
   re-materialization and from scaffold overwrites.
2. Workout match.
3. Daily check-in and weekly summary.
4. Gear.

Postgres is now the app database. Use a dedicated `running_planner` database on the shared Postgres instance rather than the default `postgres` database. Raw Strava payloads and webhook event payloads are stored as JSONB in Postgres, while SQLite remains only a legacy source format for migration and lightweight tests.
