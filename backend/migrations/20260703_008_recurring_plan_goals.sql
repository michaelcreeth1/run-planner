CREATE TABLE plan_recurring_goals (
  id TEXT PRIMARY KEY,
  training_plan_id TEXT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
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
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO plan_recurring_goals (
  id, training_plan_id, athlete_account_id, category, goal_type, label, description,
  target_value, min_acceptable, max_acceptable, unit, evaluation_mode, priority, notes,
  created_at, updated_at
)
SELECT
  id,
  training_plan_id,
  athlete_account_id,
  CASE category WHEN 'consistency' THEN 'sessions' ELSE 'custom' END,
  'achievement',
  label,
  '',
  target_value,
  CASE category WHEN 'consistency' THEN target_value ELSE NULL END,
  NULL,
  CASE WHEN unit = 'time' THEN 'custom' ELSE unit END,
  CASE category WHEN 'consistency' THEN 'at_least' ELSE 'manual' END,
  'secondary',
  notes,
  created_at,
  updated_at
FROM plan_goals
WHERE category IN ('consistency', 'custom');

DROP TABLE plan_goals;

CREATE INDEX ix_plan_recurring_goals_training_plan_id
  ON plan_recurring_goals(training_plan_id);

UPDATE week_goals SET source = 'workouts' WHERE source = 'derived_from_plan';

UPDATE week_goals SET source = 'manual' WHERE source = 'ai_suggested';
