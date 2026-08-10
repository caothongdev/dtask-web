#!/bin/bash
# btask-web supervisor — restart bun if dead
# Registered as a no-agent Hermes cron (every 5m) so btask-web auto-heals
# after VPS restarts or accidental kills.
#
# Logic:
#  1. Skip if bun just started <2 min ago (avoid restart churn)
#  2. Health = pgrep finds bun AND /api/health returns {"ok":true}
#  3. If unhealthy → kills + relaunches via nohup
#
# Logs:
#  /tmp/btask-supervisor.log  (only when action taken)
#  /tmp/btask.log             (bun stdout — always append)

set -e
PORT="${BTASK_PORT:-8787}"
DIR="${BTASK_DIR:-/opt/data/repos/btask-web}"
MIN_UPTIME_S=120  # don't restart if bun started <2 min ago

# If a bun is running, check its actual uptime via /api/health
if pgrep -f "btask-web/server.ts" >/dev/null; then
  health=$(curl -sS -m 3 "http://127.0.0.1:$PORT/api/health" 2>/dev/null || echo "{}")
  if printf '%s' "$health" | grep -q '"ok":true'; then
    uptime=$(printf '%s' "$health" | grep -o '"uptime_s":[0-9]*' | cut -d: -f2)
    uptime="${uptime:-0}"
    if [[ "$uptime" -lt "$MIN_UPTIME_S" ]]; then
      # bun just restarted — leave it alone, give it a chance
      exit 0
    fi
    exit 0  # healthy + mature enough
  fi
fi

# unhealthy — relaunch
echo "[btask-supervisor] $(date -u) bun unhealthy, restarting" >> /tmp/btask-supervisor.log
pkill -9 -f "btask-web/server.ts" 2>/dev/null || true
sleep 1
cd "$DIR"
nohup /opt/data/.bun/bin/bun server.ts >> /tmp/btask.log 2>&1 &
disown
sleep 2
echo "[btask-supervisor] restarted pid=$!" >> /tmp/btask-supervisor.log