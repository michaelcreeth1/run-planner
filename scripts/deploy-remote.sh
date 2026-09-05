#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-remote.sh [options] [-- deploy.sh options]

Sync this local repository to the Docker host over SSH, then run
scripts/deploy.sh from the synced server-side bundle.

Options:
  --host HOST          SSH host for the Docker server. Default: docker
  --remote-dir PATH   Server-side app bundle path. Default: /home/mike/compose/run-planner
  --dry-run           Show what would be archived and do not deploy
  --skip-checks       Skip the local make check pre-deploy gate
  --allow-development
                      Explicitly allow APP_ENV=development on the remote host
  -h, --help          Show this help text

Examples:
  scripts/deploy-remote.sh
  scripts/deploy-remote.sh --dry-run
  scripts/deploy-remote.sh --skip-checks
  scripts/deploy-remote.sh --allow-development
  scripts/deploy-remote.sh -- --skip-build
  scripts/deploy-remote.sh --host docker --remote-dir /home/mike/compose/run-planner

The local .env is synced with the checkout and is the source of truth for the
remote Compose deploy.
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

load_env_value() {
  local name="$1"
  local line

  line="$(grep -E "^${name}=" "$ROOT_DIR/.env" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    printf ""
    return
  fi

  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf "%s" "$line"
}

fail_on_extra_env_files() {
  local env_file

  for env_file in "$ROOT_DIR"/.env.*; do
    if [[ ! -e "$env_file" ]] || [[ "$(basename "$env_file")" == ".env.example" ]]; then
      continue
    fi

    echo "Refusing to sync with local secret-like env file present: $env_file" >&2
    echo "Move it out of the repo or add an explicit archive exclusion first." >&2
    exit 1
  done
}

shell_quote() {
  printf "%q" "$1"
}

join_quoted_args() {
  local arg
  local joined=""

  for arg in "$@"; do
    if [[ -n "$joined" ]]; then
      joined+=" "
    fi
    joined+="$(shell_quote "$arg")"
  done

  printf "%s" "$joined"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REMOTE_HOST="${DEPLOY_REMOTE_HOST:-docker}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/home/mike/compose/run-planner}"
DRY_RUN=0
SKIP_CHECKS=0
ALLOW_DEVELOPMENT=0
DEPLOY_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      REMOTE_HOST="$2"
      shift 2
      ;;
    --remote-dir)
      REMOTE_DIR="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-checks)
      SKIP_CHECKS=1
      shift
      ;;
    --allow-development)
      ALLOW_DEVELOPMENT=1
      shift
      ;;
    --)
      shift
      DEPLOY_ARGS=("$@")
      break
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

require_command ssh
require_command tar

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing local .env. Create it before deploying so local and remote config match." >&2
  exit 1
fi

DATABASE_URL_VALUE="$(load_env_value DATABASE_URL)"
if [[ "$DATABASE_URL_VALUE" == *"@localhost:"* ]] || [[ "$DATABASE_URL_VALUE" == *"@127.0.0.1:"* ]]; then
  echo "Refusing remote deploy with a local-only DATABASE_URL host." >&2
  echo "Use a Docker-network or remote-reachable database host in .env before deploying." >&2
  exit 1
fi

APP_ENV_VALUE="$(load_env_value APP_ENV)"
if [[ "$APP_ENV_VALUE" != "production" ]]; then
  if (( ALLOW_DEVELOPMENT == 0 )); then
    echo "Refusing remote deploy with APP_ENV=${APP_ENV_VALUE:-unset}." >&2
    echo "Set APP_ENV=production, or pass --allow-development for an intentional development deploy." >&2
    exit 1
  fi

  if [[ "$APP_ENV_VALUE" != "development" ]]; then
    echo "--allow-development only permits APP_ENV=development, not ${APP_ENV_VALUE:-unset}." >&2
    exit 1
  fi

  echo "WARNING: Explicitly allowing APP_ENV=development on the remote host." >&2
fi

fail_on_extra_env_files

TAR_EXCLUDES=(
  --exclude "./.git"
  --exclude "./.claude"
  --exclude "./.DS_Store"
  --exclude "./._*"
  --exclude "*/._*"
  --exclude "./__pycache__"
  --exclude "./*.py[cod]"
  --exclude "./.pytest_cache"
  --exclude "./.ruff_cache"
  --exclude "./.coverage"
  --exclude "./htmlcov"
  --exclude "./backend/.coverage"
  --exclude "./backend/htmlcov"
  --exclude "./.venv"
  --exclude "./*.egg-info"
  --exclude "./backend/data"
  --exclude "./data"
  --exclude "./node_modules"
  --exclude "./dist"
  --exclude "./frontend/dist"
  --exclude "./frontend/.vite"
  --exclude "./frontend/.env.local"
  --exclude "./frontend/coverage"
  --exclude "./backups"
)

REMOTE_DIR_QUOTED="$(shell_quote "$REMOTE_DIR")"
DEPLOY_ARGS_QUOTED=""
if (( ${#DEPLOY_ARGS[@]} > 0 )); then
  DEPLOY_ARGS_QUOTED="$(join_quoted_args "${DEPLOY_ARGS[@]}")"
fi
REMOTE_DEPLOY_COMMAND="cd $REMOTE_DIR_QUOTED && scripts/deploy.sh"

if [[ -n "$DEPLOY_ARGS_QUOTED" ]]; then
  REMOTE_DEPLOY_COMMAND+=" $DEPLOY_ARGS_QUOTED"
fi

echo "Syncing $ROOT_DIR to $REMOTE_HOST:$REMOTE_DIR"
echo "Syncing local .env as the deploy config source of truth."

if (( DRY_RUN == 1 )); then
  echo
  echo "Archive would include:"
  COPYFILE_DISABLE=1 tar -czvf /dev/null "${TAR_EXCLUDES[@]}" -C "$ROOT_DIR" .
  echo
  echo "Dry run complete. Remote deploy command would be:"
  echo "ssh $REMOTE_HOST $(shell_quote "$REMOTE_DEPLOY_COMMAND")"
  exit 0
fi

if (( SKIP_CHECKS == 1 )); then
  echo
  echo "WARNING: Skipping local pre-deploy verification (--skip-checks)."
else
  require_command make
  echo
  echo "Running local pre-deploy verification..."
  (cd "$ROOT_DIR" && make check)
  echo "Local pre-deploy verification passed."
fi

REMOTE_SYNC_SCRIPT="
set -euo pipefail

remote_dir_input=$REMOTE_DIR_QUOTED
if [[ \"\$remote_dir_input\" != /* ]] || [[ \"\$remote_dir_input\" == / ]]; then
  echo \"Remote deploy path must be an absolute, non-root path: \$remote_dir_input\" >&2
  exit 1
fi

remote_name=\$(basename -- \"\$remote_dir_input\")
if [[ \"\$remote_name\" == . ]] || [[ \"\$remote_name\" == .. ]]; then
  echo \"Remote deploy path has an unsafe basename: \$remote_dir_input\" >&2
  exit 1
fi

remote_parent_input=\$(dirname -- \"\$remote_dir_input\")
mkdir -p \"\$remote_parent_input\"
remote_parent=\$(cd \"\$remote_parent_input\" && pwd -P)
remote_home=\$(cd \"\$HOME\" && pwd -P)
remote_dir=\"\$remote_parent/\$remote_name\"
rollback_dir=\"\$remote_parent/.\${remote_name}.rollback\"

if [[ \"\$remote_parent\" == / ]] || [[ \"\$remote_dir\" == \"\$remote_home\" ]]; then
  echo \"Refusing broad remote deploy path: \$remote_dir\" >&2
  exit 1
fi

is_run_planner_bundle() {
  local bundle=\"\$1\"

  if [[ -f \"\$bundle/.run-planner-deployment\" ]] \\
    && grep -Fxq run-planner \"\$bundle/.run-planner-deployment\"; then
    return 0
  fi

  [[ -f \"\$bundle/docker-compose.yml\" ]] \\
    && [[ -f \"\$bundle/scripts/deploy.sh\" ]] \\
    && [[ -f \"\$bundle/backend/app/workers/main.py\" ]] \\
    && [[ -f \"\$bundle/frontend/package.json\" ]] \\
    && grep -Fq running-planner \"\$bundle/scripts/deploy.sh\"
}

if [[ -L \"\$remote_dir\" ]]; then
  echo \"Refusing to replace symlinked remote deploy path: \$remote_dir\" >&2
  exit 1
fi

if [[ -e \"\$remote_dir\" ]] && [[ ! -d \"\$remote_dir\" ]]; then
  echo \"Remote deploy path exists but is not a directory: \$remote_dir\" >&2
  exit 1
fi

if [[ -d \"\$remote_dir\" ]] && ! is_run_planner_bundle \"\$remote_dir\"; then
  echo \"Refusing to replace a directory that is not a Run Planner bundle: \$remote_dir\" >&2
  exit 1
fi

if [[ -e \"\$rollback_dir\" ]]; then
  echo \"A prior rollback bundle still exists: \$rollback_dir\" >&2
  echo \"Resolve it before starting another deployment.\" >&2
  exit 1
fi

staging=\$(mktemp -d \"\$remote_parent/.\${remote_name}.staging.XXXXXX\")
previous_moved=0

cleanup() {
  status=\$?

  if (( status != 0 && previous_moved == 1 )) \\
    && [[ ! -e \"\$remote_dir\" ]] && [[ -e \"\$rollback_dir\" ]]; then
    mv \"\$rollback_dir\" \"\$remote_dir\" || true
  fi

  if [[ -n \"\$staging\" ]]; then
    rm -rf \"\$staging\"
  fi

  return \"\$status\"
}
trap cleanup EXIT

tar -xzf - -C \"\$staging\"
for required_path in .run-planner-deployment .env docker-compose.yml scripts/deploy.sh; do
  if [[ ! -e \"\$staging/\$required_path\" ]]; then
    echo \"Synced bundle is missing required path: \$required_path\" >&2
    exit 1
  fi
done

if ! grep -Fxq run-planner \"\$staging/.run-planner-deployment\"; then
  echo \"Synced bundle has an invalid Run Planner deployment sentinel.\" >&2
  exit 1
fi

# These paths are app-local only. The production Postgres data and backups live
# in the separate shared Postgres project and are never inside remote_dir.
for path in backend/data data backups; do
  if [[ -e \"\$remote_dir/\$path\" ]]; then
    if [[ -e \"\$staging/\$path\" ]]; then
      echo \"Synced bundle unexpectedly contains preserved path: \$path\" >&2
      exit 1
    fi
    mkdir -p \"\$staging/\$(dirname \"\$path\")\"
    cp -a \"\$remote_dir/\$path\" \"\$staging/\$path\"
  fi
done

chmod 600 \"\$staging/.env\"

if [[ -e \"\$remote_dir\" ]]; then
  mv \"\$remote_dir\" \"\$rollback_dir\"
  previous_moved=1
fi

if ! mv \"\$staging\" \"\$remote_dir\"; then
  if (( previous_moved == 1 )) && [[ -e \"\$rollback_dir\" ]]; then
    mv \"\$rollback_dir\" \"\$remote_dir\"
    previous_moved=0
  fi
  exit 1
fi
staging=\"\"

trap - EXIT
"

REMOTE_FINALIZE_SCRIPT="
set -euo pipefail

remote_dir_input=$REMOTE_DIR_QUOTED
remote_name=\$(basename -- \"\$remote_dir_input\")
remote_parent=\$(cd \"\$(dirname -- \"\$remote_dir_input\")\" && pwd -P)
remote_dir=\"\$remote_parent/\$remote_name\"
rollback_dir=\"\$remote_parent/.\${remote_name}.rollback\"

is_run_planner_bundle() {
  local bundle=\"\$1\"
  if [[ -f \"\$bundle/.run-planner-deployment\" ]] \\
    && grep -Fxq run-planner \"\$bundle/.run-planner-deployment\"; then
    return 0
  fi
  [[ -f \"\$bundle/docker-compose.yml\" ]] \\
    && [[ -f \"\$bundle/scripts/deploy.sh\" ]] \\
    && [[ -f \"\$bundle/backend/app/workers/main.py\" ]] \\
    && [[ -f \"\$bundle/frontend/package.json\" ]] \\
    && grep -Fq running-planner \"\$bundle/scripts/deploy.sh\"
}

if [[ -e \"\$rollback_dir\" ]]; then
  if ! is_run_planner_bundle \"\$remote_dir\" \\
    || ! is_run_planner_bundle \"\$rollback_dir\"; then
    echo \"Refusing to prune an unverified rollback bundle: \$rollback_dir\" >&2
    exit 1
  fi
  rm -rf -- \"\$rollback_dir\"
fi
"

REMOTE_ROLLBACK_SCRIPT="
set -euo pipefail

remote_dir_input=$REMOTE_DIR_QUOTED
remote_name=\$(basename -- \"\$remote_dir_input\")
remote_parent=\$(cd \"\$(dirname -- \"\$remote_dir_input\")\" && pwd -P)
remote_dir=\"\$remote_parent/\$remote_name\"
rollback_dir=\"\$remote_parent/.\${remote_name}.rollback\"

is_run_planner_bundle() {
  local bundle=\"\$1\"
  if [[ -f \"\$bundle/.run-planner-deployment\" ]] \\
    && grep -Fxq run-planner \"\$bundle/.run-planner-deployment\"; then
    return 0
  fi
  [[ -f \"\$bundle/docker-compose.yml\" ]] \\
    && [[ -f \"\$bundle/scripts/deploy.sh\" ]] \\
    && [[ -f \"\$bundle/backend/app/workers/main.py\" ]] \\
    && [[ -f \"\$bundle/frontend/package.json\" ]] \\
    && grep -Fq running-planner \"\$bundle/scripts/deploy.sh\"
}

if [[ ! -d \"\$rollback_dir\" ]] || ! is_run_planner_bundle \"\$rollback_dir\"; then
  echo \"No verified prior Run Planner release is available for rollback.\" >&2
  exit 1
fi

if [[ -e \"\$remote_dir\" ]] && ! is_run_planner_bundle \"\$remote_dir\"; then
  echo \"Refusing to replace an unverified failed release: \$remote_dir\" >&2
  exit 1
fi

failed_root=\"\"
cleanup() {
  status=\$?
  if (( status != 0 )) && [[ ! -e \"\$remote_dir\" ]] \\
    && [[ -n \"\$failed_root\" ]] && [[ -e \"\$failed_root/release\" ]]; then
    mv \"\$failed_root/release\" \"\$remote_dir\" || true
  fi
  if [[ -n \"\$failed_root\" ]] && [[ -d \"\$failed_root\" ]] \\
    && [[ ! -e \"\$failed_root/release\" ]]; then
    rmdir \"\$failed_root\" || true
  fi
  return \"\$status\"
}
trap cleanup EXIT

if [[ -e \"\$remote_dir\" ]]; then
  failed_root=\$(mktemp -d \"\$remote_parent/.\${remote_name}.failed.XXXXXX\")
  mv \"\$remote_dir\" \"\$failed_root/release\"
fi

if ! mv \"\$rollback_dir\" \"\$remote_dir\"; then
  exit 1
fi

if [[ -n \"\$failed_root\" ]]; then
  rm -rf -- \"\$failed_root\"
  failed_root=\"\"
fi

trap - EXIT
"

COPYFILE_DISABLE=1 tar -czf - "${TAR_EXCLUDES[@]}" -C "$ROOT_DIR" . | ssh "$REMOTE_HOST" "bash -lc $(shell_quote "$REMOTE_SYNC_SCRIPT")"

echo
echo "Running remote deploy on $REMOTE_HOST..."
if ssh "$REMOTE_HOST" "$REMOTE_DEPLOY_COMMAND"; then
  ssh "$REMOTE_HOST" "bash -lc $(shell_quote "$REMOTE_FINALIZE_SCRIPT")"
else
  deploy_status=$?
  echo "Remote deploy failed; attempting to restore the prior release..." >&2

  if ssh "$REMOTE_HOST" "bash -lc $(shell_quote "$REMOTE_ROLLBACK_SCRIPT")"; then
    echo "Prior source release restored; redeploying it..." >&2
    if ssh "$REMOTE_HOST" "$REMOTE_DEPLOY_COMMAND"; then
      echo "Prior release is healthy again." >&2
    else
      echo "Prior source was restored, but its deployment did not become healthy." >&2
    fi
  else
    echo "Automatic source rollback was unavailable or failed." >&2
  fi

  exit "$deploy_status"
fi
