CREATE TABLE IF NOT EXISTS strava_oauth_tokens (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_refresh_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS strava_activities (
  id TEXT PRIMARY KEY,
  strava_activity_id TEXT NOT NULL UNIQUE,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sport_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  start_date_local TEXT NOT NULL,
  timezone TEXT,
  distance REAL NOT NULL DEFAULT 0,
  moving_time INTEGER,
  elapsed_time INTEGER,
  total_elevation_gain REAL,
  average_speed REAL,
  max_speed REAL,
  average_heartrate REAL,
  max_heartrate REAL,
  average_cadence REAL,
  average_watts REAL,
  perceived_exertion REAL,
  private INTEGER NOT NULL DEFAULT 0,
  trainer INTEGER NOT NULL DEFAULT 0,
  commute INTEGER NOT NULL DEFAULT 0,
  manual INTEGER NOT NULL DEFAULT 0,
  raw_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_strava_activities_start_date_local
  ON strava_activities(start_date_local);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT NOT NULL REFERENCES athlete_accounts(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  error_message TEXT,
  activities_fetched INTEGER NOT NULL DEFAULT 0,
  activities_created INTEGER NOT NULL DEFAULT 0,
  activities_updated INTEGER NOT NULL DEFAULT 0,
  activities_deleted INTEGER NOT NULL DEFAULT 0,
  rate_limit_remaining INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
