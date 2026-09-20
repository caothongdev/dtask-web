// dtask-web — minimalist task dashboard + JSON API for CLI users
// Entry point. Implementation lives in backend/:
//   config.ts       env-driven knobs (port, paths, CORS, rate limits)
//   db.ts           SQLite connection, schema, migrations, prepared statements
//   keys.ts         API key generation + SHA-256 hashing
//   auth.ts         bearer-key auth + username auto-registration
//   sse.ts          in-process pub/sub for the event stream
//   gamification.ts XP / levels / coins / streaks
//   timeline.ts     pure schedule helpers
//   routes/         route handlers grouped by domain
//   app.ts          Bun.serve composition (rate limiting, static, ETag)
// Storage: SQLite at DTASK_DB env var (default /opt/data/dtask-web/db.sqlite).
// Port: DTASK_PORT env var (default 8787).

import { createServer } from "./backend/app";
import { DB_PATH } from "./backend/config";

// Public API (also the surface the test suite imports).
export { db, runMigrations, DEFAULT_REWARDS, ALLOWED_CATEGORIES, Q } from "./backend/db";
export { genKey, hashApiKey } from "./backend/keys";
export { getUser, getOrCreateUser } from "./backend/auth";
export { publish, bumpActivity, subs, type Evt } from "./backend/sse";
export { xpForLevel, getLevelInfo, addXpAndCoins, getUserStreak, completeTask } from "./backend/gamification";
export { parseAtTime, getTimelineStatus, last7Days } from "./backend/timeline";
export { createServer } from "./backend/app";
export { SlidingWindowLimiter } from "./backend/rate-limit";

let _server = createServer();

export const server = new Proxy({} as any, {
  get(_target, prop) {
    if (prop === "port" && (!_server || _server.port === 0)) {
      _server = createServer();
    }
    const val = (_server as any)[prop];
    if (typeof val === "function") {
      return val.bind(_server);
    }
    return val;
  },
});

console.log(`[dtask-web] listening on http://0.0.0.0:${server.port}  db=${DB_PATH}  v1.1.0`);
