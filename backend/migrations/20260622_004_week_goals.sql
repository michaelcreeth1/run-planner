CREATE TABLE IF NOT EXISTS week_goals (
  id TEXT PRIMARY KEY,
  training_week_id TEXT NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  category TEXT NOT NULL,
  goal_type TEXT NOT NULL DEFAULT 'achievement',
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  target_value REAL,
  min_acceptable REAL,
  max_acceptable REAL,
  unit TEXT NOT NULL DEFAULT 'custom',
  evaluation_mode TEXT NOT NULL DEFAULT 'manual',
  priority TEXT NOT NULL DEFAULT 'secondary',
  status TEXT NOT NULL DEFAULT 'not_started',
  source TEXT NOT NULL DEFAULT 'manual',
  is_editable INTEGER NOT NULL DEFAULT 1,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_week_goals_training_week_id
  ON week_goals(training_week_id);

CREATE INDEX IF NOT EXISTS ix_week_goals_week_start_date
  ON week_goals(week_start_date);
