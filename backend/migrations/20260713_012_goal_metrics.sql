ALTER TABLE week_goals
  ADD COLUMN metric_key TEXT;

ALTER TABLE recurring_goals
  ADD COLUMN metric_key TEXT;

UPDATE week_goals
SET metric_key = CASE
  WHEN category = 'mileage' AND unit = 'mi' THEN 'weekly_run_distance'
  WHEN category = 'sessions' AND unit = 'sessions' THEN 'training_session_count'
  WHEN category = 'long_run' AND unit = 'mi' THEN 'longest_run_distance'
  WHEN category = 'long_run' AND unit = 'percent' THEN 'long_run_share'
  WHEN category = 'quality' AND unit IN ('days', 'sessions') THEN 'hard_training_day_count'
  WHEN category = 'recovery' AND unit = 'days' THEN 'rest_day_count'
  WHEN category = 'strength' AND unit = 'sessions' THEN 'strength_session_count'
  ELSE NULL
END
WHERE metric_key IS NULL;

UPDATE recurring_goals
SET metric_key = CASE
  WHEN category = 'mileage' AND unit = 'mi' THEN 'weekly_run_distance'
  WHEN category = 'sessions' AND unit = 'sessions' THEN 'training_session_count'
  WHEN category = 'long_run' AND unit = 'mi' THEN 'longest_run_distance'
  WHEN category = 'long_run' AND unit = 'percent' THEN 'long_run_share'
  WHEN category = 'quality' AND unit IN ('days', 'sessions') THEN 'hard_training_day_count'
  WHEN category = 'recovery' AND unit = 'days' THEN 'rest_day_count'
  WHEN category = 'strength' AND unit = 'sessions' THEN 'strength_session_count'
  ELSE NULL
END
WHERE metric_key IS NULL;

CREATE INDEX ix_week_goals_metric_key
  ON week_goals(metric_key);

CREATE INDEX ix_recurring_goals_metric_key
  ON recurring_goals(metric_key);

CREATE TABLE weekly_metric_snapshots (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  training_week_id TEXT NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  metric_key TEXT NOT NULL,
  basis TEXT NOT NULL,
  value REAL NOT NULL,
  calculator_version INTEGER NOT NULL DEFAULT 1,
  calculated_at TIMESTAMP NOT NULL,
  CONSTRAINT uq_weekly_metric_snapshot UNIQUE (training_week_id, metric_key, basis)
);

CREATE INDEX ix_weekly_metric_snapshots_athlete_week
  ON weekly_metric_snapshots(athlete_account_id, week_start_date);
