-- Repair the conservative phase-2 backfill. Associate only genuine one-to-one
-- same-day matches. Doubles, split recordings, and quality outcomes stay reviewable.
WITH candidate_pairs AS (
  SELECT
    session.id AS session_id,
    workout.id AS workout_id,
    workout.current_prescription_revision_id AS prescription_revision_id,
    workout.intensity_category AS workout_intensity,
    CASE
      WHEN workout.intensity_category IN ('workout', 'race')
        OR workout.workout_type IN (
          'tempo', 'threshold', 'interval', 'hill', 'race', 'time_trial',
          'progression', 'strides'
        ) THEN 1
      ELSE 0
    END AS is_quality
  FROM performed_sessions session
  JOIN performed_session_recordings recording
    ON recording.performed_session_id = session.id
  JOIN strava_activities activity
    ON activity.id = recording.strava_activity_id
    AND activity.deleted_at IS NULL
  JOIN planned_workouts workout
    ON workout.athlete_account_id = session.athlete_account_id
    AND workout.planned_date = date(activity.start_date_local)
    AND workout.sport != 'rest'
    AND workout.status IN ('planned', 'moved')
    AND workout.sport = session.sport
    AND (
      session.sport != 'run'
      OR workout.planned_distance IS NULL
      OR abs((activity.distance / 1609.344) - workout.planned_distance)
        <= max(0.5, workout.planned_distance * 0.2)
    )
  WHERE session.association = 'unmatched'
    AND session.outcome = 'unresolved'
    AND session.manual_distance_meters IS NULL
    AND session.manual_duration_seconds IS NULL
    AND (
      SELECT count(*)
      FROM performed_session_recordings session_recording
      WHERE session_recording.performed_session_id = session.id
    ) = 1
    AND NOT EXISTS (
      SELECT 1
      FROM performed_sessions matched_session
      WHERE matched_session.planned_workout_id = workout.id
        AND matched_session.association = 'associated'
    )
), ranked_pairs AS (
  SELECT
    candidate_pairs.*,
    count(*) OVER (PARTITION BY session_id) AS candidates_for_session,
    count(*) OVER (PARTITION BY workout_id) AS sessions_for_workout
  FROM candidate_pairs
), safe_pairs AS (
  SELECT *
  FROM ranked_pairs
  WHERE candidates_for_session = 1 AND sessions_for_workout = 1
)
UPDATE performed_sessions
SET
  planned_workout_id = (
    SELECT workout_id FROM safe_pairs WHERE safe_pairs.session_id = performed_sessions.id
  ),
  prescription_revision_id = (
    SELECT prescription_revision_id
    FROM safe_pairs
    WHERE safe_pairs.session_id = performed_sessions.id
  ),
  association = 'associated',
  match_provenance = 'automatic',
  outcome = CASE
    WHEN (SELECT is_quality FROM safe_pairs WHERE safe_pairs.session_id = performed_sessions.id) = 1
      THEN 'unresolved'
    ELSE 'as_planned'
  END,
  intensity_category = CASE
    WHEN (SELECT is_quality FROM safe_pairs WHERE safe_pairs.session_id = performed_sessions.id) = 1
      THEN intensity_category
    ELSE (
      SELECT workout_intensity
      FROM safe_pairs
      WHERE safe_pairs.session_id = performed_sessions.id
    )
  END,
  updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT session_id FROM safe_pairs);

UPDATE planned_workouts
SET status = 'completed_as_planned', updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT planned_workout_id
  FROM performed_sessions
  WHERE association = 'associated'
    AND match_provenance = 'automatic'
    AND outcome = 'as_planned'
)
  AND status IN ('planned', 'moved');
