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
GET  /api/webhooks/strava
POST /api/webhooks/strava
```

Sync mode is webhook-first with polling as reconciliation. The worker imports on startup and then polls every 30 minutes by default with a 14-day lookback so delayed uploads and activity edits are picked up. In deployments with Strava webhooks enabled, set the polling interval higher, such as 6 to 24 hours, and rely on pushed activity events for normal freshness.

Polling is controlled by:

```text
STRAVA_SYNC_ENABLED=true
STRAVA_SYNC_INTERVAL_SECONDS=1800
STRAVA_SYNC_LOOKBACK_DAYS=14
```

Webhook delivery is controlled by:

```text
STRAVA_WEBHOOK_ENABLED=false
STRAVA_WEBHOOK_VERIFY_TOKEN=
STRAVA_WEBHOOK_SUBSCRIPTION_ID=
STRAVA_WEBHOOK_MAX_ATTEMPTS=5
```

Strava validates the callback with `hub.challenge`; the app returns that value only when `hub.verify_token` matches `STRAVA_WEBHOOK_VERIFY_TOKEN`. Activity events are stored in `strava_webhook_events`, deduped by owner/object/aspect/subscription/time, and processed after the API response. The worker also retries queued or failed webhook events up to `STRAVA_WEBHOOK_MAX_ATTEMPTS`.

For multi-user routing, Strava sends one app-level subscription event that includes `owner_id`. The handler maps `owner_id` to `athlete_accounts.strava_athlete_id`, then uses that profile's stored OAuth token to fetch the current activity.

Register the webhook subscription with Strava using the public callback URL:

```text
https://run.creeth.net/api/webhooks/strava
```

Initial scopes:

```text
read
activity:read
activity:read_all
```

The implementation encrypts access and refresh tokens at rest, stores granted scopes, captures rate-limit headers when available, and preserves raw Strava activity payloads.
