/**
 * Manual load test for dtask-web. NOT part of CI.
 *
 * Spins up N virtual users that register, create tasks, complete them,
 * log focus sessions and read stats against a RUNNING dtask-web instance,
 * then reports request counts, status distribution and latency percentiles.
 *
 * Note: creates real users (`loadtest_<rand>`) in the target DB — point it
 * at a scratch instance, not production.
 *
 * Usage:
 *   bun server.ts &                        # or any running instance
 *   bun scripts/load-test.ts               # defaults: 10 users, 5 tasks each
 *   USERS=50 TASKS=10 TARGET=http://localhost:8787 bun scripts/load-test.ts
 */

const TARGET = process.env.TARGET || "http://localhost:8787";
const USERS = parseInt(process.env.USERS || "10");
const TASKS_PER_USER = parseInt(process.env.TASKS || "5");
const CATEGORIES = ["code", "read", "health", "build"];

const latencies: number[] = [];
const statusCounts = new Map<number, number>();
let failures = 0;

async function timed(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const t0 = performance.now();
  let status = 0;
  let body: any = null;
  try {
    const res = await fetch(TARGET + path, init);
    status = res.status;
    body = await res.json().catch(() => null);
    if (status >= 400) failures++;
  } catch {
    failures++;
  } finally {
    latencies.push(performance.now() - t0);
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  }
  return { status, body };
}

function percentile(p: number): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx] * 10) / 10;
}

async function virtualUser(userIdx: number) {
  const username = `loadtest_${Date.now()}_${userIdx}`;
  const reg = await timed("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const key = reg.body?.user?.api_key;
  if (!key) return;

  const auth = { "content-type": "application/json", authorization: `Bearer ${key}` };

  for (let t = 0; t < TASKS_PER_USER; t++) {
    const created = await timed("/api/tasks", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        title: `Load test task ${t}`,
        category: CATEGORIES[t % CATEGORIES.length],
        mins: 25,
      }),
    });
    const id = created.body?.task?.id;
    if (!id) continue;
    await timed(`/api/tasks/${id}/done`, { method: "POST", headers: auth });
  }

  await timed("/api/stats/focus", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ minutes: 25 }),
  });
  await timed("/api/me", { headers: auth });
  await timed("/api/stats", { headers: auth });
  await timed("/api/health");
}

console.log(`Load testing ${TARGET} — ${USERS} users x ${TASKS_PER_USER} tasks...`);
const t0 = performance.now();
await Promise.all(Array.from({ length: USERS }, (_, i) => virtualUser(i)));
const wallSec = (performance.now() - t0) / 1000;

const total = latencies.length;
console.log(`
── Results ──────────────────────────────────────
Requests:      ${total}  (${failures} failed)
Wall time:     ${wallSec.toFixed(1)}s  (${(total / wallSec).toFixed(1)} req/s)
Status codes:  ${[...statusCounts.entries()].sort((a, b) => a[0] - b[0]).map(([s, c]) => `${s}:${c}`).join("  ")}
Latency p50:   ${percentile(50)} ms
Latency p95:   ${percentile(95)} ms
Latency p99:   ${percentile(99)} ms
Max:           ${percentile(100)} ms
─────────────────────────────────────────────────`);

process.exit(failures > 0 ? 1 : 0);

export {}; // module marker: allows top-level await under strict TS
