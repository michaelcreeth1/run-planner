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
`scripts/deploy.sh` there. Before the sync, it runs the repository's local
`make check` verification gate; a failure leaves the remote bundle unchanged.
Use `--skip-checks` only when the same checkout has already passed verification.

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

`run.creeth.net` is private-only: it resolves through the homelab DNS server and
is reachable only from the LAN or through Tailscale. Strava therefore cannot
deliver webhooks to this deployment. Keep webhooks disabled and use the worker's
30-minute reconciliation poll for activity freshness.

Set these environment values when serving through Caddy:

```text
APP_BASE_URL=https://run.creeth.net
API_BASE_URL=https://run.creeth.net
STRAVA_REDIRECT_URI=https://run.creeth.net/api/auth/strava/callback
STRAVA_SYNC_ENABLED=true
STRAVA_SYNC_INTERVAL_SECONDS=1800
STRAVA_SYNC_LOOKBACK_DAYS=14
STRAVA_WEBHOOK_ENABLED=false
SESSION_COOKIE_SECURE=true
CORS_ORIGINS=https://run.home.arpa,https://run.creeth.net
VITE_API_BASE_URL=
```
