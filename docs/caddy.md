# Caddy Route Notes

Phase 0 local development uses direct ports:

```text
frontend: http://localhost:5173
api:      http://localhost:8000
```

When deploying behind the existing Caddy LXC, route `run.home.arpa` and
`run.creeth.net` to the Docker host at `192.168.1.34`, with the frontend on
port `5173` and the API on port `8000`.

Deploy from the dev machine with:

```sh
scripts/deploy-remote.sh
```

That syncs the local checkout to `/home/mike/compose/run-planner` on the Docker
host, including the local `.env` as the deploy configuration, then runs
`scripts/deploy.sh` there.

The local `.env` is the deploy source of truth. For remote deploys, use a
Docker-network or remote-reachable database host rather than `localhost`.

The checked-in copy of this route lives at
[`deploy/caddy/Caddyfile`](../deploy/caddy/Caddyfile). Keep the shared live
proxy config on the Caddy LXC in sync with that file.

Example shape:

```caddyfile
run.home.arpa, run.creeth.net {
  reverse_proxy /api/* 192.168.1.34:8000
  reverse_proxy /healthz 192.168.1.34:8000
  reverse_proxy /readyz 192.168.1.34:8000
  reverse_proxy 192.168.1.34:5173
}
```

If Strava webhooks are enabled, `https://run.creeth.net/api/webhooks/strava`
must be reachable from Strava. Keep any non-webhook admin traffic private where
possible.

Set these environment values when serving through Caddy:

```text
APP_BASE_URL=https://run.creeth.net
API_BASE_URL=https://run.creeth.net
STRAVA_REDIRECT_URI=https://run.creeth.net/api/auth/strava/callback
STRAVA_WEBHOOK_ENABLED=true
STRAVA_WEBHOOK_VERIFY_TOKEN=<long random string>
STRAVA_WEBHOOK_SUBSCRIPTION_ID=<subscription id from Strava>
SESSION_COOKIE_SECURE=true
CORS_ORIGINS=https://run.home.arpa,https://run.creeth.net
VITE_API_BASE_URL=
```
