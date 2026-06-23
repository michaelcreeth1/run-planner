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
  -h, --help          Show this help text

Examples:
  scripts/deploy-remote.sh
  scripts/deploy-remote.sh --dry-run
  scripts/deploy-remote.sh -- --skip-build
  scripts/deploy-remote.sh --host docker --remote-dir /home/mike/compose/run-planner

The remote .env is intentionally not synced. Create and maintain it on the
Docker host, or the remote deploy step will fail before touching containers.
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
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

fail_on_extra_env_files

TAR_EXCLUDES=(
  --exclude "./.git"
  --exclude "./.DS_Store"
  --exclude "./._*"
  --exclude "*/._*"
  --exclude "./.env"
  --exclude "./__pycache__"
  --exclude "./*.py[cod]"
  --exclude "./.pytest_cache"
  --exclude "./.ruff_cache"
  --exclude "./.venv"
  --exclude "./*.egg-info"
  --exclude "./backend/data"
  --exclude "./node_modules"
  --exclude "./dist"
  --exclude "./frontend/dist"
  --exclude "./frontend/.vite"
  --exclude "./data/*.db"
  --exclude "./data/*.db-*"
  --exclude "./backups"
)

REMOTE_DIR_QUOTED="$(shell_quote "$REMOTE_DIR")"
DEPLOY_ARGS_QUOTED=""
if (( ${#DEPLOY_ARGS[@]} > 0 )); then
  DEPLOY_ARGS_QUOTED="$(join_quoted_args "${DEPLOY_ARGS[@]}")"
fi
REMOTE_DEPLOY_COMMAND="cd $REMOTE_DIR_QUOTED && if [[ ! -f .env ]]; then echo 'Missing remote .env. Create it on the Docker host before deploying.' >&2; exit 1; fi && scripts/deploy.sh"

if [[ -n "$DEPLOY_ARGS_QUOTED" ]]; then
  REMOTE_DEPLOY_COMMAND+=" $DEPLOY_ARGS_QUOTED"
fi

echo "Syncing $ROOT_DIR to $REMOTE_HOST:$REMOTE_DIR"
echo "Preserving remote .env and generated local artifacts."

if (( DRY_RUN == 1 )); then
  ssh "$REMOTE_HOST" "test -f $REMOTE_DIR_QUOTED/.env && echo 'Remote .env exists.' || { echo 'Missing remote .env.' >&2; exit 1; }"
  echo
  echo "Archive would include:"
  COPYFILE_DISABLE=1 tar -czvf /dev/null "${TAR_EXCLUDES[@]}" -C "$ROOT_DIR" .
  echo
  echo "Dry run complete. Remote deploy command would be:"
  echo "ssh $REMOTE_HOST $(shell_quote "$REMOTE_DEPLOY_COMMAND")"
  exit 0
fi

REMOTE_SYNC_SCRIPT="
set -euo pipefail

remote_dir=$REMOTE_DIR_QUOTED
staging=\$(mktemp -d)
preserve_dir=\$(mktemp -d)

cleanup() {
  rm -rf \"\$staging\" \"\$preserve_dir\"
}
trap cleanup EXIT

tar -xzf - -C \"\$staging\"
mkdir -p \"\$remote_dir\"

if [[ ! -f \"\$remote_dir/.env\" ]]; then
  echo 'Missing remote .env. Create it on the Docker host before deploying.' >&2
  exit 1
fi

for path in .env backend/data data backups; do
  if [[ -e \"\$remote_dir/\$path\" ]]; then
    mkdir -p \"\$preserve_dir/\$(dirname \"\$path\")\"
    mv \"\$remote_dir/\$path\" \"\$preserve_dir/\$path\"
  fi
done

find \"\$remote_dir\" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a \"\$staging\"/. \"\$remote_dir\"/

for path in .env backend/data data backups; do
  if [[ -e \"\$preserve_dir/\$path\" ]]; then
    mkdir -p \"\$remote_dir/\$(dirname \"\$path\")\"
    mv \"\$preserve_dir/\$path\" \"\$remote_dir/\$path\"
  fi
done
"

COPYFILE_DISABLE=1 tar -czf - "${TAR_EXCLUDES[@]}" -C "$ROOT_DIR" . | ssh "$REMOTE_HOST" "bash -lc $(shell_quote "$REMOTE_SYNC_SCRIPT")"

echo
echo "Running remote deploy on $REMOTE_HOST..."
ssh "$REMOTE_HOST" "$REMOTE_DEPLOY_COMMAND"
