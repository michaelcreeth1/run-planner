CREATE TABLE IF NOT EXISTS strava_webhook_events (
  id TEXT PRIMARY KEY,
  athlete_account_id TEXT REFERENCES athlete_accounts(id) ON DELETE SET NULL,
  owner_id TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  aspect_type TEXT NOT NULL,
  subscription_id TEXT,
  event_time INTEGER,
  updates_json TEXT NOT NULL DEFAULT '{}',
  raw_payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_strava_webhook_events_status_received_at
  ON strava_webhook_events(status, received_at);

CREATE INDEX IF NOT EXISTS ix_strava_webhook_events_owner_id
  ON strava_webhook_events(owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_strava_webhook_events_dedupe
  ON strava_webhook_events(
    owner_id,
    object_type,
    object_id,
    aspect_type,
    subscription_id,
    event_time
  );
