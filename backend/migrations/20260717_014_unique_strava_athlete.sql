CREATE UNIQUE INDEX IF NOT EXISTS ux_athlete_accounts_strava_athlete_id
  ON athlete_accounts(strava_athlete_id)
  WHERE strava_athlete_id IS NOT NULL;
