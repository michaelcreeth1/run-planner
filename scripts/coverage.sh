#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PYTHON="${BACKEND_PYTHON:-$ROOT_DIR/backend/.venv/bin/python}"

if [[ "$BACKEND_PYTHON" == */* && "$BACKEND_PYTHON" != /* ]]; then
  BACKEND_PYTHON="$ROOT_DIR/$BACKEND_PYTHON"
fi

if ! command -v "$BACKEND_PYTHON" >/dev/null 2>&1; then
  echo "Backend Python not found at $BACKEND_PYTHON" >&2
  echo "Create backend/.venv or set BACKEND_PYTHON to the Python executable to use." >&2
  exit 1
fi

echo "Measuring backend coverage..."
(cd "$ROOT_DIR/backend" && "$BACKEND_PYTHON" -m pytest --cov=app --cov-report=term-missing --cov-report=html)

echo "Measuring frontend coverage..."
npm --prefix "$ROOT_DIR/frontend" run test:coverage
