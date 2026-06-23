CREATE TABLE IF NOT EXISTS strava_oauth_tokens (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_refresh_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS strava_activities (
  id TEXT PRIMARY KEY,
  strava_activity_id TEXT NOT NULL UNIQUE,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sport_type TEXT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  start_date_local TIMESTAMP WITH TIME ZONE NOT NULL,
  timezone TEXT,
  distance DOUBLE PRECISION NOT NULL DEFAULT 0,
  moving_time INTEGER,
  elapsed_time INTEGER,
  total_elevation_gain DOUBLE PRECISION,
  average_speed DOUBLE PRECISION,
  max_speed DOUBLE PRECISION,
  average_heartrate DOUBLE PRECISION,
  max_heartrate DOUBLE PRECISION,
  average_cadence DOUBLE PRECISION,
  average_watts DOUBLE PRECISION,
  perceived_exertion DOUBLE PRECISION,
  private BOOLEAN NOT NULL DEFAULT FALSE,
  trainer BOOLEAN NOT NULL DEFAULT FALSE,
  commute BOOLEAN NOT NULL DEFAULT FALSE,
  manual BOOLEAN NOT NULL DEFAULT FALSE,
  raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ix_strava_activities_start_date_local
  ON strava_activities(start_date_local);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  activities_fetched INTEGER NOT NULL DEFAULT 0,
  activities_created INTEGER NOT NULL DEFAULT 0,
  activities_updated INTEGER NOT NULL DEFAULT 0,
  activities_deleted INTEGER NOT NULL DEFAULT 0,
  rate_limit_remaining INTEGER,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);
