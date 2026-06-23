#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [options]

Deploy the running-planner Docker Compose stack from this repository.

Options:
  --env-file PATH    Path to the environment file. Default: .env
  --compose-file PATH
                    Path to the compose file. Default: docker-compose.yml
  --skip-build       Reuse existing images instead of rebuilding
  --no-wait          Do not wait for the API container health check
  -h, --help         Show this help text
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_env_var() {
  local name="$1"
  local value="${!name:-}"

  if [[ -z "$value" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_non_placeholder() {
  local name="$1"
  local value="${!name:-}"

  if [[ "$value" == replace-with-* ]] || [[ "$value" == change-me ]] || [[ "$value" == dev-* ]]; then
    echo "Environment variable $name still uses a placeholder value." >&2
    exit 1
  fi
}

wait_for_api() {
  local compose_cmd=("$@")
  local timeout_seconds=180
  local start_time
  local container_id
  local status

  start_time="$(date +%s)"
  echo "Waiting for API container health check..."

  while true; do
    container_id="$("${compose_cmd[@]}" ps -q api)"

    if [[ -n "$container_id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"

      case "$status" in
        healthy|running)
          echo "API container is $status."
          return 0
          ;;
        unhealthy|exited|dead)
          echo "API container entered status: $status" >&2
          return 1
          ;;
      esac
    fi

    if (( "$(date +%s)" - start_time >= timeout_seconds )); then
      echo "Timed out waiting for the API container to become healthy." >&2
      return 1
    fi

    sleep 2
  done
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
WAIT_FOR_API=1
BUILD_FLAG=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --skip-build)
      BUILD_FLAG=0
      shift
      ;;
    --no-wait)
      WAIT_FOR_API=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_command docker

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

require_env_var APP_ENV
require_env_var APP_BASE_URL
require_env_var API_BASE_URL
require_env_var DATABASE_URL
require_env_var SESSION_SECRET
require_env_var TOKEN_ENCRYPTION_KEY
require_env_var CORS_ORIGINS

if [[ "$APP_ENV" == "production" ]]; then
  require_env_var APP_PASSWORD
  require_non_placeholder SESSION_SECRET
  require_non_placeholder TOKEN_ENCRYPTION_KEY

  if [[ "${SESSION_COOKIE_SECURE:-}" != "true" ]]; then
    echo "SESSION_COOKIE_SECURE must be true when APP_ENV=production." >&2
    exit 1
  fi
fi

compose_cmd=(
  docker compose
  --project-directory "$ROOT_DIR"
  --env-file "$ENV_FILE"
  -f "$COMPOSE_FILE"
)

"${compose_cmd[@]}" config >/dev/null

echo "Deploying running-planner from $ROOT_DIR"

up_args=(up --detach --remove-orphans)
if (( BUILD_FLAG == 1 )); then
  up_args+=(--build)
fi

"${compose_cmd[@]}" "${up_args[@]}"

if (( WAIT_FOR_API == 1 )); then
  if ! wait_for_api "${compose_cmd[@]}"; then
    echo "Deployment failed. Recent logs:" >&2
    "${compose_cmd[@]}" logs --tail 80 api worker frontend >&2 || true
    exit 1
  fi
fi

echo
echo "Current service status:"
"${compose_cmd[@]}" ps
