ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS current_prescription_revision_id TEXT;
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS prescription_json JSON;
ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS workout_prescription_revisions (
  id TEXT PRIMARY KEY,
  planned_workout_id TEXT NOT NULL REFERENCES planned_workouts(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  prescription_json JSON NOT NULL,
  calculated_totals_json JSON NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (planned_workout_id, revision_number)
);
ALTER TABLE planned_workouts ADD CONSTRAINT fk_current_prescription_revision
  FOREIGN KEY (current_prescription_revision_id) REFERENCES workout_prescription_revisions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS workout_schedule_events (
  id TEXT PRIMARY KEY,
  planned_workout_id TEXT NOT NULL REFERENCES planned_workouts(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  slot TEXT,
  event_type TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS performed_sessions (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  occurred_at TIMESTAMP NOT NULL,
  sport TEXT NOT NULL DEFAULT 'run',
  planned_workout_id TEXT REFERENCES planned_workouts(id) ON DELETE SET NULL,
  prescription_revision_id TEXT REFERENCES workout_prescription_revisions(id) ON DELETE SET NULL,
  association TEXT NOT NULL DEFAULT 'unmatched',
  match_provenance TEXT,
  outcome TEXT NOT NULL DEFAULT 'unresolved',
  intensity_category TEXT,
  evidence TEXT NOT NULL DEFAULT 'insufficient_data',
  assessment_note TEXT NOT NULL DEFAULT '',
  manual_distance_meters DOUBLE PRECISION,
  manual_duration_seconds INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  evidence_changed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS performed_session_recordings (
  id TEXT PRIMARY KEY,
  performed_session_id TEXT NOT NULL REFERENCES performed_sessions(id) ON DELETE CASCADE,
  strava_activity_id TEXT NOT NULL REFERENCES strava_activities(id) ON DELETE CASCADE,
  contributes_to_totals BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (strava_activity_id)
);
CREATE INDEX IF NOT EXISTS ix_performed_sessions_athlete_occurred_at
  ON performed_sessions(athlete_account_id, occurred_at);

INSERT INTO workout_prescription_revisions (id, planned_workout_id, revision_number, prescription_json, calculated_totals_json)
SELECT
  md5(random()::text || clock_timestamp()::text || id),
  id,
  1,
  CASE
    WHEN planned_distance IS NOT NULL THEN json_build_object('blocks', json_build_array(json_build_object('kind','step','role','other','extent','distance','distance_meters',planned_distance * 1609.344,'display_unit','mi')))
    WHEN planned_duration IS NOT NULL THEN json_build_object('blocks', json_build_array(json_build_object('kind','step','role','other','extent','duration','duration_seconds',planned_duration,'display_unit','sec')))
    ELSE json_build_object('blocks', json_build_array(json_build_object('kind','step','role','other','extent','open')))
  END,
  json_build_object('summary','Migrated simple workout')
FROM planned_workouts
WHERE current_prescription_revision_id IS NULL;

UPDATE planned_workouts
SET current_prescription_revision_id = revisions.id
FROM workout_prescription_revisions revisions
WHERE revisions.planned_workout_id = planned_workouts.id
  AND revisions.revision_number = 1
  AND planned_workouts.current_prescription_revision_id IS NULL;

INSERT INTO workout_schedule_events (id, planned_workout_id, scheduled_date, event_type)
SELECT md5(random()::text || clock_timestamp()::text || id), id, planned_date, 'scheduled'
FROM planned_workouts
WHERE NOT EXISTS (
  SELECT 1 FROM workout_schedule_events WHERE planned_workout_id = planned_workouts.id
);
