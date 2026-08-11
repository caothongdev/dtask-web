#!/bin/bash
# btask-web supervisor — restart bun if dead
# Registered as a no-agent Hermes cron (every 15m) so btask-web auto-heals
# after VPS restarts or accidental kills.
#
# Logic:
#  1. Skip if bun just started <2 min ago (avoid restart churn)
#  2. Health = btask-web's bun is alive AND /api/health returns {"ok":true}
#  3. If unhealthy → SIGTERM bun, wait for graceful exit (lets it flush WAL),
#     then SIGKILL if hung. After kill, checkpoint SQLite WAL so writes
#     hit disk before relaunching.
#
# Logs:
#  /tmp/btask-supervisor.log  (only when action taken)
#  /tmp/btask.log             (bun stdout — always append)

set -e
PORT="${BTASK_PORT:-8787}"
DIR="${BTASK_DIR:-/opt/data/repos/btask-web}"
DB="${BTASK_DB:-$DIR/db.sqlite}"
MIN_UPTIME_S=120  # don't restart if bun started <2 min ago

# Find the bun process whose cmdline is exactly "/opt/data/.bun/bin/bun server.ts"
# (NOT the bash wrapper, NOT bun server.js, NOT other bun servers).
# Returns the bun PID via stdout, or empty if not running.
find_btask_bun() {
  for p in /proc/[0-9]*; do
    [[ -r "$p/cmdline" ]] || continue
    local comm cmd
    comm=$(cat "$p/comm" 2>/dev/null || true)
    cmd=$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null | sed 's/ $//')
    if [[ "$comm" == "bun" && "$cmd" == "/opt/data/.bun/bin/bun server.ts" ]]; then
      basename "$p"
      return 0
    fi
  done
  return 1
}

# Graceful kill: SIGTERM first, give it 5s to flush WAL, then SIGKILL if stuck.
graceful_kill() {
  local pid
  pid=$(find_btask_bun) || { return 0; }
  kill -TERM "$pid" 2>/dev/null || true
  # Wait up to 5s for graceful exit (lets bun flush WAL writes via sigterm handler)
  for i in 1 2 3 4 5; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 1
  done
  kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
}

# After killing bun, checkpoint the SQLite WAL so writes are flushed to disk.
# Without this, anything written between the last automatic checkpoint
# and the kill is lost (cf. btask-web data loss incident 2026-08-10).
checkpoint_wal() {
  [[ -f "$DB" ]] || return 0
  # Skip if a bun is alive — it has the DB locked. Only run when bun is gone.
  find_btask_bun >/dev/null 2>&1 && return 0
  /opt/data/.bun/bin/bun -e "
    import { Database } from 'bun:sqlite';
    try {
      const db = new Database('$DB');
      db.exec('PRAGMA wal_checkpoint(FULL)');
      db.close();
    } catch (e) {}
  " >/dev/null 2>&1 || true
}

# If a bun is running, check its actual uptime via /api/health
if find_btask_bun >/dev/null 2>&1; then
  health=$(curl -sS -m 3 "http://127.0.0.1:$PORT/api/health" 2>/dev/null || echo "{}")
  if printf '%s' "$health" | grep -q '"ok":true'; then
    uptime=$(printf '%s' "$health" | grep -o '"uptime_s":[0-9]*' | cut -d: -f2)
    uptime="${uptime:-0}"
    if [[ "$uptime" -lt "$MIN_UPTIME_S" ]]; then
      exit 0  # bun just restarted — leave it alone
    fi
    exit 0  # healthy + mature enough
  fi
fi

# unhealthy — relaunch with WAL flush
echo "[btask-supervisor] $(date -u) bun unhealthy, restarting" >> /tmp/btask-supervisor.log
graceful_kill
sleep 1
checkpoint_wal
cd "$DIR"
nohup /opt/data/.bun/bin/bun server.ts >> /tmp/btask.log 2>&1 &
disown
sleep 2
echo "[btask-supervisor] restarted pid=$(find_btask_bun 2>/dev/null)" >> /tmp/btask-supervisor.log