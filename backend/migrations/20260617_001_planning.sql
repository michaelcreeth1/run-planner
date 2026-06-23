CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS athlete_accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Denver',
  strava_athlete_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_weeks (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  planned_mileage REAL NOT NULL DEFAULT 0,
  actual_mileage REAL NOT NULL DEFAULT 0,
  planned_time INTEGER,
  actual_time INTEGER,
  target_long_run_distance REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (athlete_account_id, week_start_date)
);

CREATE TABLE IF NOT EXISTS planned_workouts (
  id TEXT PRIMARY KEY,
  training_week_id TEXT NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  planned_date DATE NOT NULL,
  title TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'run',
  workout_type TEXT NOT NULL DEFAULT 'easy',
  intensity_category TEXT NOT NULL DEFAULT 'easy',
  planned_distance REAL,
  planned_duration INTEGER,
  planned_elevation REAL,
  planned_tss REAL,
  purpose TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_planned_workouts_training_week_id
  ON planned_workouts(training_week_id);

CREATE INDEX IF NOT EXISTS ix_planned_workouts_planned_date
  ON planned_workouts(planned_date);

CREATE TABLE IF NOT EXISTS planned_workout_steps (
  id TEXT PRIMARY KEY,
  planned_workout_id TEXT NOT NULL REFERENCES planned_workouts(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  duration INTEGER,
  distance REAL,
  target_pace_min TEXT,
  target_pace_max TEXT,
  target_hr_min INTEGER,
  target_hr_max INTEGER,
  target_rpe INTEGER,
  repetition_group TEXT,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (planned_workout_id, step_order)
);

CREATE TABLE IF NOT EXISTS workout_templates (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  workout_type TEXT NOT NULL DEFAULT 'easy',
  default_distance REAL,
  default_duration INTEGER,
  default_steps TEXT NOT NULL DEFAULT '[]',
  default_purpose TEXT NOT NULL DEFAULT '',
  default_instructions TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
