ALTER TABLE recurring_goals ADD COLUMN mesocycle_phase TEXT;

CREATE INDEX ix_recurring_goals_mesocycle_phase
  ON recurring_goals(mesocycle_phase);
