ALTER TABLE sync_jobs
  ADD COLUMN activities_unchanged INTEGER NOT NULL DEFAULT 0;
