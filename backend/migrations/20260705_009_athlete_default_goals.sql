CREATE TABLE recurring_goals (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  training_plan_id TEXT REFERENCES training_plans(id) ON DELETE CASCADE,
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

INSERT INTO recurring_goals (
  id, athlete_account_id, training_plan_id, category, goal_type, label, description,
  target_value, min_acceptable, max_acceptable, unit, evaluation_mode, priority, notes,
  created_at, updated_at
)
SELECT
  id, athlete_account_id, training_plan_id, category, goal_type, label, description,
  target_value, min_acceptable, max_acceptable, unit, evaluation_mode, priority, notes,
  created_at, updated_at
FROM plan_recurring_goals;

DROP TABLE plan_recurring_goals;

CREATE INDEX ix_recurring_goals_athlete_account_id
  ON recurring_goals(athlete_account_id);

CREATE INDEX ix_recurring_goals_training_plan_id
  ON recurring_goals(training_plan_id);

INSERT INTO recurring_goals (
  id, athlete_account_id, training_plan_id, category, goal_type, label,
  target_value, min_acceptable, max_acceptable, unit, evaluation_mode, priority
)
SELECT lower(hex(randomblob(16))), a.id, NULL, 'recovery', 'achievement', 'Preserve at least 1 rest day',
  1, 1, NULL, 'days', 'at_least', 'secondary'
FROM athlete_accounts a;

INSERT INTO recurring_goals (
  id, athlete_account_id, training_plan_id, category, goal_type, label,
  target_value, min_acceptable, max_acceptable, unit, evaluation_mode, priority
)
SELECT lower(hex(randomblob(16))), a.id, NULL, 'long_run', 'guardrail', 'Long run no more than 30% of week',
  30, NULL, 30, 'percent', 'at_most', 'guardrail'
FROM athlete_accounts a;

INSERT INTO recurring_goals (
  id, athlete_account_id, training_plan_id, category, goal_type, label,
  target_value, min_acceptable, max_acceptable, unit, evaluation_mode, priority
)
SELECT lower(hex(randomblob(16))), a.id, NULL, 'quality', 'guardrail', 'No more than 2 hard days',
  2, NULL, 2, 'days', 'at_most', 'guardrail'
FROM athlete_accounts a;
