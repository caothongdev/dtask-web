#!/bin/bash
# Entrypoint for btask-web. Listens on BTASK_PORT (default 8787).
# Pick up env from .env so future secrets work too.
set -e
cd "$(dirname "$0")"

# Source .env for BTASK_* overrides if present
if [ -f /opt/data/.env ]; then
  set -a
  # shellcheck disable=SC1091
  source /opt/data/.env
  set +a
fi

export BTASK_PORT="${BTASK_PORT:-8787}"
export BTASK_DB="${BTASK_DB:-$(pwd)/db.sqlite}"

echo "[btask-web] starting on :$BTASK_PORT  db=$BTASK_DB"
exec /opt/data/.bun/bin/bun server.ts