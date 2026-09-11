-- Give every activity imported before performed sessions existed a logical
-- reconciliation record that is ready for explicit review.
INSERT INTO performed_sessions (
  id,
  athlete_account_id,
  occurred_at,
  sport,
  association,
  outcome,
  intensity_category,
  evidence
)
SELECT
  'imported-session-' || activity.id,
  activity.athlete_account_id,
  activity.start_date_local,
  CASE
    WHEN lower(replace(replace(activity.sport_type, '_', ''), ' ', '')) IN ('run', 'trailrun', 'virtualrun') THEN 'run'
    WHEN lower(activity.sport_type) LIKE '%weight%' OR lower(activity.sport_type) LIKE '%strength%' THEN 'strength'
    WHEN lower(activity.sport_type) IN ('ride', 'virtualride', 'swim', 'elliptical', 'rowing') THEN 'cross_training'
    ELSE 'other'
  END,
  'unmatched',
  'unresolved',
  CASE
    WHEN lower(activity.sport_type) LIKE '%weight%' OR lower(activity.sport_type) LIKE '%strength%' THEN 'strength'
    WHEN lower(activity.name) LIKE '%tempo%'
      OR lower(activity.name) LIKE '%threshold%'
      OR lower(activity.name) LIKE '%interval%'
      OR lower(activity.name) LIKE '%hill%'
      OR lower(activity.name) LIKE '%race%'
      OR lower(activity.name) LIKE '%workout%' THEN 'workout'
    WHEN lower(replace(replace(activity.sport_type, '_', ''), ' ', '')) IN ('run', 'trailrun', 'virtualrun') THEN 'easy'
    ELSE 'moderate'
  END,
  'activity_summary'
FROM strava_activities activity
WHERE activity.deleted_at IS NULL
  AND NOT EXISTS (
  SELECT 1
  FROM performed_session_recordings recording
  WHERE recording.strava_activity_id = activity.id
);

INSERT INTO performed_session_recordings (
  id,
  performed_session_id,
  strava_activity_id,
  contributes_to_totals
)
SELECT
  'imported-recording-' || activity.id,
  'imported-session-' || activity.id,
  activity.id,
  TRUE
FROM strava_activities activity
WHERE activity.deleted_at IS NULL
  AND NOT EXISTS (
  SELECT 1
  FROM performed_session_recordings recording
  WHERE recording.strava_activity_id = activity.id
);
