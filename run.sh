#!/bin/bash
# Entrypoint for dtask-web. Listens on DTASK_PORT (default 8787).
# Pick up env from .env so future secrets work too.
set -e
cd "$(dirname "$0")"

# Source .env for DTASK_* overrides if present
if [ -f /opt/data/.env ]; then
  set -a
  # shellcheck disable=SC1091
  source /opt/data/.env
  set +a
fi

export DTASK_PORT="${DTASK_PORT:-${BTASK_PORT:-8787}}"
export DTASK_DB="${DTASK_DB:-${BTASK_DB:-$(pwd)/db.sqlite}}"

echo "[dtask-web] starting on :$DTASK_PORT  db=$DTASK_DB"
exec /opt/data/.bun/bin/bun server.ts