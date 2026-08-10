#!/bin/bash
# btask-web supervisor — restart bun if dead
# Registered as a no-agent Hermes cron (every 5m) so btask-web auto-heals
# after VPS restarts or accidental kills.
#
# Checks:
#  1. pgrep finds a bun process running server.ts
#  2. curl /api/health returns {"ok":true}
# If either fails → kills + relaunches via nohup.
#
# Logs:
#  /tmp/btask-supervisor.log  (only when action taken)
#  /tmp/btask.log             (bun stdout — always append)

set -e
PORT="${BTASK_PORT:-8787}"
DIR="${BTASK_DIR:-/opt/data/repos/btask-web}"

if pgrep -f "btask-web/server.ts" >/dev/null && curl -sS -m 3 "http://127.0.0.1:$PORT/api/health" | grep -q '"ok":true'; then
  exit 0
fi

echo "[btask-supervisor] $(date -u) bun unhealthy, restarting" >> /tmp/btask-supervisor.log
pkill -9 -f "btask-web/server.ts" 2>/dev/null || true
sleep 1
cd "$DIR"
nohup /opt/data/.bun/bin/bun server.ts >> /tmp/btask.log 2>&1 &
disown
sleep 2
echo "[btask-supervisor] restarted pid=$!" >> /tmp/btask-supervisor.log