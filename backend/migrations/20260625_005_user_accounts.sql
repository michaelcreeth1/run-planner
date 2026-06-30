CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_disabled INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE athlete_accounts
  ADD COLUMN owner_user_id TEXT REFERENCES user_accounts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_athlete_accounts_owner_user_id
  ON athlete_accounts(owner_user_id);
