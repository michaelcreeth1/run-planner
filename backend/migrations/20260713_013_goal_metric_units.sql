UPDATE week_goals
SET category = 'quality',
    unit = 'days'
WHERE metric_key = 'hard_training_day_count';

UPDATE recurring_goals
SET category = 'quality',
    unit = 'days'
WHERE metric_key = 'hard_training_day_count';
