# Caddy Route Notes

Phase 0 local development uses direct ports:

```text
frontend: http://localhost:5173
api:      http://localhost:8000
```

When deploying behind the existing Caddy LXC, route the app hostname to the frontend and proxy API paths to the backend.

Example shape:

```caddyfile
run-planner.example.internal {
  reverse_proxy /api/* docker-host:8000
  reverse_proxy /healthz docker-host:8000
  reverse_proxy /readyz docker-host:8000
  reverse_proxy docker-host:5173
}
```

Keep the hostname private behind Tailscale for MVP. Public Strava webhooks are deferred.

Set these environment values when serving through Caddy:

```text
APP_BASE_URL=https://run-planner.example.internal
API_BASE_URL=https://run-planner.example.internal
STRAVA_REDIRECT_URI=https://run-planner.example.internal/api/auth/strava/callback
SESSION_COOKIE_SECURE=true
```
