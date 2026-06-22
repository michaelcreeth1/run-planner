# Caddy Route Notes

Phase 0 local development uses direct ports:

```text
frontend: http://localhost:5173
api:      http://localhost:8000
```

When deploying behind the existing Caddy LXC, route `run.home.arpa` and
`run.creeth.net` to the Docker host at `192.168.1.34`, with the frontend on
port `5173` and the API on port `8000`.

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

Keep the hostname private behind Tailscale for MVP. Public Strava webhooks are deferred.

Set these environment values when serving through Caddy:

```text
APP_BASE_URL=https://run.creeth.net
API_BASE_URL=https://run.creeth.net
STRAVA_REDIRECT_URI=https://run.creeth.net/api/auth/strava/callback
SESSION_COOKIE_SECURE=true
CORS_ORIGINS=https://run.home.arpa,https://run.creeth.net
VITE_API_BASE_URL=
```
