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
GET  /api/performed-sessions
GET  /api/performed-sessions/{id}/match-suggestions
PUT  /api/performed-sessions/{id}/reconciliation
GET  /api/webhooks/strava
POST /api/webhooks/strava
```

The worker imports on startup and then polls every 30 minutes by default with a 14-day lookback so delayed uploads and activity edits are picked up. Publicly reachable deployments can use webhooks for normal freshness and stretch the polling interval to 6 to 24 hours for reconciliation. Private-only deployments, including `run.creeth.net`, cannot receive Strava webhooks and must retain the 30-minute poll.

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

Only register a webhook subscription when the callback has public DNS and is
reachable from Strava. A suitable public deployment would use a callback such
as:

```text
https://run.example.com/api/webhooks/strava
```

Initial scopes:

```text
read
activity:read
activity:read_all
```

The implementation encrypts access and refresh tokens at rest, stores granted scopes, captures rate-limit headers when available, and preserves raw Strava activity payloads.

Each create, update, or unchanged import also ensures that the recording belongs to exactly one performed session. Obvious single-workout matches are associated automatically. Nearby recordings are grouped only when their combined distance fits one unambiguous plan. Assigning another recording to a plan that already has one merges both into a single performed session. Quality and ambiguous matches remain marked for confirmation. The normal session editor contains one **Strava match** dropdown; unmatched imports open the same editor in a match-only mode. Choosing a plan saves immediately and recalculates the affected week data used by the board, goals, review, analytics, and projections. There is no manual activity-entry path: Strava recordings are the source of performed work.
