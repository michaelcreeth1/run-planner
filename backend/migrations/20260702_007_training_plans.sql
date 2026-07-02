CREATE TABLE goal_races (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  race_date DATE NOT NULL,
  distance TEXT NOT NULL DEFAULT 'half_marathon',
  distance_miles REAL,
  target_time INTEGER,
  priority TEXT NOT NULL DEFAULT 'A',
  location TEXT NOT NULL DEFAULT '',
  altitude_context TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE training_plans (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  goal_race_id TEXT REFERENCES goal_races(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mesocycles (
  id TEXT PRIMARY KEY,
  training_plan_id TEXT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phase TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  target_mileage_start REAL,
  target_mileage_end REAL,
  long_run_start REAL,
  long_run_end REAL,
  down_week_cadence INTEGER,
  down_week_reduction_pct REAL NOT NULL DEFAULT 20,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (training_plan_id, order_index)
);

CREATE TABLE plan_goals (
  id TEXT PRIMARY KEY,
  training_plan_id TEXT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  target_value REAL,
  unit TEXT NOT NULL DEFAULT 'custom',
  flows_down INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE training_weeks
  ADD COLUMN mesocycle_id TEXT REFERENCES mesocycles(id) ON DELETE SET NULL;

ALTER TABLE training_weeks
  ADD COLUMN purpose TEXT NOT NULL DEFAULT '';

ALTER TABLE training_weeks
  ADD COLUMN purpose_source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE training_weeks
  ADD COLUMN target_mileage REAL;

ALTER TABLE training_weeks
  ADD COLUMN target_mileage_source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE training_weeks
  ADD COLUMN target_long_run_source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE training_weeks
  ADD COLUMN is_down_week INTEGER NOT NULL DEFAULT 0;

UPDATE training_weeks
SET purpose = 'aerobic_build', purpose_source = 'manual', notes = ''
WHERE lower(trim(notes)) = 'aerobic build';

UPDATE training_weeks
SET purpose = 'maintain', purpose_source = 'manual', notes = ''
WHERE lower(trim(notes)) = 'maintain';

UPDATE training_weeks
SET purpose = 'down_week', purpose_source = 'manual', notes = ''
WHERE lower(trim(notes)) = 'down week';

UPDATE training_weeks
SET purpose = 'workout_focus', purpose_source = 'manual', notes = ''
WHERE lower(trim(notes)) = 'workout focus';

UPDATE training_weeks
SET purpose = 'long_run_focus', purpose_source = 'manual', notes = ''
WHERE lower(trim(notes)) = 'long-run focus';

UPDATE training_weeks
SET purpose = 'recovery', purpose_source = 'manual', notes = ''
WHERE lower(trim(notes)) = 'recovery';

UPDATE training_weeks
SET purpose = 'race_week', purpose_source = 'manual', notes = ''
WHERE lower(trim(notes)) = 'race week';

CREATE INDEX ix_goal_races_athlete_account_id
  ON goal_races(athlete_account_id);

CREATE INDEX ix_training_plans_athlete_account_id
  ON training_plans(athlete_account_id);

CREATE INDEX ix_mesocycles_training_plan_id
  ON mesocycles(training_plan_id);

CREATE INDEX ix_mesocycles_dates
  ON mesocycles(training_plan_id, start_date, end_date);

CREATE INDEX ix_plan_goals_training_plan_id
  ON plan_goals(training_plan_id);

CREATE INDEX ix_training_weeks_mesocycle_id
  ON training_weeks(mesocycle_id);
