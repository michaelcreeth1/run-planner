-- Strava sends local clock readings with a Z suffix. The calendar compares
-- these values to local dates, so store them without a time zone.
ALTER TABLE strava_activities
ALTER COLUMN start_date_local TYPE TIMESTAMP WITHOUT TIME ZONE
USING COALESCE(
    NULLIF(raw_payload_json ->> 'start_date_local', '')::timestamp,
    start_date_local AT TIME ZONE 'UTC'
);

-- Recorded sessions start at their earliest active recording. Keep their
-- workout matches and outcomes when correcting the recorded start time.
WITH recording_starts AS (
    SELECT recording.performed_session_id, MIN(activity.start_date_local) AS occurred_at
    FROM performed_session_recordings recording
    JOIN strava_activities activity ON activity.id = recording.strava_activity_id
    WHERE activity.deleted_at IS NULL
    GROUP BY recording.performed_session_id
)
UPDATE performed_sessions session
SET occurred_at = recording_starts.occurred_at
FROM recording_starts
WHERE session.id = recording_starts.performed_session_id
  AND session.occurred_at IS DISTINCT FROM recording_starts.occurred_at;

-- Plan summaries read stored weekly totals. Refresh them for recordings that
-- may now fall in a different week.
WITH week_totals AS (
    SELECT week.id,
           ROUND((COALESCE(SUM(activity.distance) FILTER (
               WHERE CASE WHEN session.id IS NULL THEN
                   lower(replace(replace(activity.sport_type, '_', ''), ' ', ''))
                       IN ('run', 'trailrun', 'virtualrun')
               ELSE session.sport = 'run' END
           ), 0) / 1609.344)::numeric, 2) AS mileage,
           NULLIF(SUM(activity.moving_time), 0) AS duration
    FROM training_weeks week
    LEFT JOIN strava_activities activity ON activity.athlete_account_id = week.athlete_account_id
        AND activity.deleted_at IS NULL
        AND activity.start_date_local >= week.week_start_date
        AND activity.start_date_local < week.week_end_date + 1
    LEFT JOIN performed_session_recordings recording ON recording.strava_activity_id = activity.id
    LEFT JOIN performed_sessions session ON session.id = recording.performed_session_id
        AND session.athlete_account_id = week.athlete_account_id
        AND ((session.occurred_at >= week.week_start_date AND session.occurred_at < week.week_end_date + 1)
            OR EXISTS (
                SELECT 1 FROM planned_workouts workout
                WHERE workout.id = session.planned_workout_id
                  AND workout.athlete_account_id = week.athlete_account_id
                  AND workout.training_week_id = week.id
            ))
    WHERE session.id IS NULL OR (recording.contributes_to_totals AND session.outcome NOT IN ('skipped', 'missed'))
    GROUP BY week.id
)
UPDATE training_weeks week
SET actual_mileage = COALESCE(totals.mileage, 0), actual_time = totals.duration
FROM training_weeks all_weeks LEFT JOIN week_totals totals ON totals.id = all_weeks.id
WHERE week.id = all_weeks.id
  AND (week.actual_mileage IS DISTINCT FROM COALESCE(totals.mileage, 0)::real
       OR week.actual_time IS DISTINCT FROM totals.duration);
