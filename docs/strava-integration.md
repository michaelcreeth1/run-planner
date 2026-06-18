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

MVP sync mode is manual backfill and polling only. Webhooks are deferred because they require a public callback URL, while this app is intended to live privately behind Tailscale when possible.

Initial scopes:

```text
read
activity:read
activity:read_all
```

The implementation encrypts access and refresh tokens at rest, stores granted scopes, captures rate-limit headers when available, and preserves raw Strava activity payloads.
