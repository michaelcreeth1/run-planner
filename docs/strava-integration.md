# Strava Integration

The app owns the Strava API surface:

```http
GET  /api/auth/strava/start
GET  /api/auth/strava/callback
POST /api/auth/strava/disconnect
GET  /api/auth/strava/status
POST /api/sync/strava/backfill
POST /api/sync/strava/incremental
GET  /api/sync/jobs
GET  /api/activities
```

MVP sync mode is manual backfill and worker polling only. The worker imports on startup and then polls every 30 minutes by default with a 14-day lookback so delayed uploads and activity edits are picked up. Webhooks are deferred because they require a public callback URL, while this app is intended to live privately behind Tailscale when possible.

Polling is controlled by:

```text
STRAVA_SYNC_ENABLED=true
STRAVA_SYNC_INTERVAL_SECONDS=1800
STRAVA_SYNC_LOOKBACK_DAYS=14
```

Initial scopes:

```text
read
activity:read
activity:read_all
```

The implementation encrypts access and refresh tokens at rest, stores granted scopes, captures rate-limit headers when available, and preserves raw Strava activity payloads.
