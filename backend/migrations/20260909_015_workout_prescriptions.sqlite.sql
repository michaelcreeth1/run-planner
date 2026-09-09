ALTER TABLE planned_workouts ADD COLUMN current_prescription_revision_id TEXT;
ALTER TABLE planned_workouts ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workout_templates ADD COLUMN prescription_json JSON;
ALTER TABLE workout_templates ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE workout_prescription_revisions (
  id TEXT PRIMARY KEY,
  planned_workout_id TEXT NOT NULL REFERENCES planned_workouts(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  prescription_json JSON NOT NULL,
  calculated_totals_json JSON NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (planned_workout_id, revision_number)
);

CREATE TABLE workout_schedule_events (
  id TEXT PRIMARY KEY,
  planned_workout_id TEXT NOT NULL REFERENCES planned_workouts(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  slot TEXT,
  event_type TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE performed_sessions (
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
  manual_distance_meters REAL,
  manual_duration_seconds INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  evidence_changed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE performed_session_recordings (
  id TEXT PRIMARY KEY,
  performed_session_id TEXT NOT NULL REFERENCES performed_sessions(id) ON DELETE CASCADE,
  strava_activity_id TEXT NOT NULL REFERENCES strava_activities(id) ON DELETE CASCADE,
  contributes_to_totals INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (strava_activity_id)
);

CREATE INDEX ix_performed_sessions_athlete_occurred_at
  ON performed_sessions(athlete_account_id, occurred_at);

-- Existing simple workouts become a one-step baseline rather than losing
-- their free-text intent.  Later structured edits create new revisions.
INSERT INTO workout_prescription_revisions (
  id, planned_workout_id, revision_number, prescription_json, calculated_totals_json
)
SELECT
  lower(hex(randomblob(16))),
  id,
  1,
  CASE
    WHEN planned_distance IS NOT NULL THEN json_object('blocks', json_array(json_object('kind','step','role','other','extent','distance','distance_meters',planned_distance * 1609.344,'display_unit','mi')))
    WHEN planned_duration IS NOT NULL THEN json_object('blocks', json_array(json_object('kind','step','role','other','extent','duration','duration_seconds',planned_duration,'display_unit','sec')))
    ELSE json_object('blocks', json_array(json_object('kind','step','role','other','extent','open')))
  END,
  json_object('summary','Migrated simple workout')
FROM planned_workouts;

UPDATE planned_workouts
SET current_prescription_revision_id = (
  SELECT id FROM workout_prescription_revisions
  WHERE planned_workout_id = planned_workouts.id AND revision_number = 1
);

INSERT INTO workout_schedule_events (id, planned_workout_id, scheduled_date, event_type)
SELECT lower(hex(randomblob(16))), id, planned_date, 'scheduled'
FROM planned_workouts;
