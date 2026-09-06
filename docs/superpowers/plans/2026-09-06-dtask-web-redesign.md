# dtask-web Redesign & Gamification Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `dtask-web` into a unified 5-view SPA using the Stitch *"Neutrals for Balance"* obsidian design system, and upgrade the Bun+SQLite backend with `dtask`'s complete RPG gamification, wallet/rewards economy, scheduled timeline slots, and live focus engines.

**Architecture:** A lightweight Bun + SQLite backend serving a zero-build modular vanilla JavaScript SPA styled with Tailwind CSS. The client manages a persistent reactive store so that background timers, SSE live events, XP accruals, and coin balances stay uninterrupted across all 5 navigation views (`[1] Tasks`, `[2] Timeline`, `[3] Focus`, `[4] Shop`, `[5] Telemetry`).

**Tech Stack:** Bun, SQLite (`bun:sqlite`), Vanilla ES6 Modules, Tailwind CSS CDN with custom tokens, Web Audio API, Server-Sent Events (SSE).

**Spec:** [`docs/superpowers/specs/2026-09-06-dtask-web-redesign-design.md`](file:///home/caothongdev/dtask-web/docs/superpowers/specs/2026-09-06-dtask-web-redesign-design.md)

## Global Constraints

- **Design System**: Strict *"Neutrals for Balance"* tokens (Obsidian `#090A0C`, Void `#000000`, Surface `#121315`, Warm Stone `#D8D2C6`, Off-White `#F4F4F0`, 0px border radius).
- **Typography**: `Space Mono` for display headers and ASCII banners; `Geist` for body copy; `JetBrains Mono` for telemetry and tabular metrics.
- **Categories**: Only `learn`, `code`, `health`, `read`, `build` (with legacy migrations: `work` → `build`, `personal` → `health`, `maintenance` → `code`).
- **Gamification Formula**: $\text{XP}_{\text{needed}}(L) = 100 + (L - 1) \times 20$. Level-up grants $+50$ bonus coins.
- **Zero Heavy Frontend Dependencies**: No Node/npm/Vite bundle step required; Bun serves the static files directly from `public/`.
- **Audio Feedback**: Native Web Audio API synthesizer only, zero external audio asset files.

---

### Task 1: Backend Database Migration & Extended Schema

**Files:**
- Modify: `server.ts:14-60`
- Test: `tests/migrations.test.ts`

**Interfaces:**
- Consumes: Existing SQLite connection `db` in `server.ts`.
- Produces:
  - Extended `tasks` columns (`at`, `mins`, `time_spent`, `book_title`, `book_text`, `page`, `pages`, `xp`, `coins`, `running_since`, `prev_time_spent`, `prev_page`, `prev_progress`).
  - Extended `users` columns (`coins`, `lifetime_earned`, `lifetime_spent`).
  - New `rewards` and `transactions` tables.
  - Safe migration function `runMigrations(db)` that runs idempotently on startup.

- [ ] **Step 1: Write the failing migration test**

Create `tests/migrations.test.ts` checking that `runMigrations(db)` creates all required columns and tables in a legacy SQLite schema:

```typescript
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations, DEFAULT_REWARDS } from "../server";

test("runMigrations upgrades legacy schema with all dtask columns and tables", () => {
  const memDb = new Database(":memory:");
  memDb.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, api_key TEXT UNIQUE, is_public INTEGER DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, category TEXT, title TEXT, progress INTEGER DEFAULT 0, status TEXT DEFAULT 'open');
  `);

  runMigrations(memDb);

  // Check tasks columns
  const taskCols = memDb.query("PRAGMA table_info(tasks)").all().map((c: any) => c.name);
  expect(taskCols).toContain("at");
  expect(taskCols).toContain("mins");
  expect(taskCols).toContain("time_spent");
  expect(taskCols).toContain("book_title");
  expect(taskCols).toContain("book_text");
  expect(taskCols).toContain("page");
  expect(taskCols).toContain("pages");
  expect(taskCols).toContain("xp");
  expect(taskCols).toContain("coins");

  // Check users columns
  const userCols = memDb.query("PRAGMA table_info(users)").all().map((c: any) => c.name);
  expect(userCols).toContain("coins");
  expect(userCols).toContain("lifetime_earned");
  expect(userCols).toContain("lifetime_spent");

  // Check rewards table exists
  const rewards = memDb.query("SELECT COUNT(*) as count FROM rewards").get() as any;
  expect(rewards.count).toBeGreaterThanOrEqual(DEFAULT_REWARDS.length);

  // Check transactions table exists
  const txTable = memDb.query("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'").get();
  expect(txTable).toBeTruthy();

  memDb.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/migrations.test.ts`  
Expected: FAIL with `runMigrations` is not exported / defined.

- [ ] **Step 3: Implement database migration runner in `server.ts`**

Export `DEFAULT_REWARDS` and `runMigrations(db)` in `server.ts`:
```typescript
export const DEFAULT_REWARDS = [
  { name: "20 min Anime / Show", cost: 20, mins: 20, type: "timed", icon: "🍿" },
  { name: "Coffee & Snack Break", cost: 15, mins: 15, type: "timed", icon: "☕" },
  { name: "45 min Video Games", cost: 45, mins: 45, type: "timed", icon: "🎮" },
  { name: "15 min Social Media", cost: 15, mins: 15, type: "timed", icon: "📱" },
  { name: "1 Movie / 2 Episodes", cost: 60, mins: 60, type: "timed", icon: "🎬" },
  { name: "Cheat Meal / Treat", cost: 100, mins: 0, type: "instant", icon: "🍕" },
  { name: "Wishlist Item Purchase", cost: 250, mins: 0, type: "instant", icon: "🎁" },
];

export function runMigrations(database: Database) {
  // 1. users table columns
  const userCols = new Set(database.query("PRAGMA table_info(users)").all().map((c: any) => c.name));
  if (!userCols.has("coins")) database.exec("ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0;");
  if (!userCols.has("lifetime_earned")) database.exec("ALTER TABLE users ADD COLUMN lifetime_earned INTEGER DEFAULT 0;");
  if (!userCols.has("lifetime_spent")) database.exec("ALTER TABLE users ADD COLUMN lifetime_spent INTEGER DEFAULT 0;");

  // 2. tasks table columns
  const taskCols = new Set(database.query("PRAGMA table_info(tasks)").all().map((c: any) => c.name));
  const newCols: [string, string][] = [
    ["at", "TEXT"],
    ["mins", "INTEGER DEFAULT 0"],
    ["time_spent", "INTEGER DEFAULT 0"],
    ["book_title", "TEXT"],
    ["book_text", "TEXT"],
    ["page", "INTEGER DEFAULT 0"],
    ["pages", "INTEGER DEFAULT 0"],
    ["xp", "INTEGER DEFAULT 10"],
    ["coins", "INTEGER DEFAULT 10"],
    ["running_since", "INTEGER"],
    ["prev_time_spent", "INTEGER"],
    ["prev_page", "INTEGER"],
    ["prev_progress", "INTEGER"],
  ];
  for (const [col, def] of newCols) {
    if (!taskCols.has(col)) {
      database.exec(`ALTER TABLE tasks ADD COLUMN ${col} ${def};`);
    }
  }

  // 3. rewards table
  database.exec(`
    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      cost INTEGER NOT NULL,
      mins INTEGER DEFAULT 0,
      type TEXT CHECK(type IN ('timed', 'instant')),
      icon TEXT DEFAULT '🎁',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed default rewards if empty
  const count = (database.query("SELECT COUNT(*) as c FROM rewards WHERE user_id IS NULL").get() as any)?.c || 0;
  if (count === 0) {
    const ins = database.prepare("INSERT INTO rewards (user_id, name, cost, mins, type, icon) VALUES (NULL, ?, ?, ?, ?, ?)");
    for (const r of DEFAULT_REWARDS) {
      ins.run(r.name, r.cost, r.mins, r.type, r.icon);
    }
  }

  // 4. transactions table
  database.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT CHECK(type IN ('earn', 'spend', 'revert')),
      amount INTEGER NOT NULL,
      reason TEXT,
      reward_id INTEGER,
      ts TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // 5. Category migration for legacy data
  database.exec(`
    UPDATE tasks SET category = 'build' WHERE category = 'work';
    UPDATE tasks SET category = 'health' WHERE category = 'personal';
    UPDATE tasks SET category = 'code' WHERE category = 'maintenance';
  `);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/migrations.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server.ts tests/migrations.test.ts
git commit -m "feat(db): add non-destructive SQLite migrations for dtask schema"
```

---

### Task 2: Gamification Formulas & Wallet/Rewards API Endpoints

**Files:**
- Modify: `server.ts`
- Test: `tests/gamification.test.ts`

**Interfaces:**
- Consumes: `users`, `rewards`, `transactions` tables.
- Produces:
  - `xpForLevel(lvl: number): number`
  - `getLevelInfo(totalXp: number): { level, rank, prog_xp, needed_xp, pct, total_xp }`
  - `addXpAndCoins(db, userId, xp, coins, reason)`
  - `GET /api/me` returning wallet, level, rank.
  - `GET /api/rewards`, `POST /api/rewards`, `POST /api/rewards/:id/buy`
  - `GET /api/transactions`

- [ ] **Step 1: Write failing gamification and economy tests**

Create `tests/gamification.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { xpForLevel, getLevelInfo } from "../server";

test("xpForLevel matches dtask curve: 100, 120, 140, 160...", () => {
  expect(xpForLevel(1)).toBe(100);
  expect(xpForLevel(2)).toBe(120);
  expect(xpForLevel(3)).toBe(140);
  expect(xpForLevel(4)).toBe(160);
});

test("getLevelInfo computes accurate rank and progress", () => {
  // 0 XP -> Level 1 Apprentice
  const l1 = getLevelInfo(0);
  expect(l1.level).toBe(1);
  expect(l1.rank).toBe("Apprentice");
  expect(l1.prog_xp).toBe(0);
  expect(l1.needed_xp).toBe(100);

  // 150 XP -> Level 2 (100 used for L1, 50/120 into L2)
  const l2 = getLevelInfo(150);
  expect(l2.level).toBe(2);
  expect(l2.rank).toBe("Apprentice");
  expect(l2.prog_xp).toBe(50);
  expect(l2.needed_xp).toBe(120);

  // High XP ranks
  expect(getLevelInfo(2000).level).toBeGreaterThanOrEqual(10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/gamification.test.ts`  
Expected: FAIL with functions not defined.

- [ ] **Step 3: Implement gamification functions and API routes in `server.ts`**

Add in `server.ts`:
```typescript
export function xpForLevel(lvl: number): number {
  return 100 + (lvl - 1) * 20;
}

export function getLevelInfo(totalXp: number) {
  let lvl = 1;
  let rem = Math.max(0, totalXp);
  while (true) {
    const req = xpForLevel(lvl);
    if (rem < req) break;
    rem -= req;
    lvl++;
  }
  const needed = xpForLevel(lvl);
  const pct = needed > 0 ? (rem / needed) * 100 : 0;

  let rank = "Apprentice";
  if (lvl >= 50) rank = "Grandmaster";
  else if (lvl >= 40) rank = "Champion";
  else if (lvl >= 30) rank = "Veteran";
  else if (lvl >= 20) rank = "Adept";
  else if (lvl >= 10) rank = "Journeyman";

  return { level: lvl, rank, prog_xp: rem, needed_xp: needed, pct: Math.round(pct * 10) / 10, total_xp: totalXp };
}

export function addXpAndCoins(database: Database, userId: number, xpToAdd: number, coinsToAdd: number, reason: string) {
  // Fetch current user total XP & coins
  const user = database.query("SELECT coins, lifetime_earned FROM users WHERE id = ?").get(userId) as any;
  const totals = database.query(`
    SELECT
      (SELECT COALESCE(SUM(xp), 0) FROM tasks WHERE user_id = ? AND status = 'done' AND archived = 0) +
      (SELECT COALESCE(SUM(minutes), 0) FROM focus_sessions WHERE user_id = ?) AS total_xp
  `).get(userId, userId) as any;

  const oldXp = totals?.total_xp || 0;
  const oldLvl = getLevelInfo(oldXp).level;
  const newLvl = getLevelInfo(oldXp + xpToAdd).level;

  let bonusCoins = 0;
  if (newLvl > oldLvl) {
    bonusCoins = (newLvl - oldLvl) * 50;
  }

  const finalCoins = coinsToAdd + bonusCoins;
  database.query("UPDATE users SET coins = MAX(0, coins + ?), lifetime_earned = lifetime_earned + ? WHERE id = ?")
    .run(finalCoins, Math.max(0, finalCoins), userId);

  if (finalCoins > 0) {
    database.query("INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, 'earn', ?, ?)")
      .run(userId, finalCoins, reason + (bonusCoins > 0 ? ` (+${bonusCoins} Level Up bonus!)` : ""));
  }

  return { newLvl, bonusCoins, totalXp: oldXp + xpToAdd };
}
```

Implement API routes:
- `GET /api/me`: includes `wallet: { coins, lifetime_earned, lifetime_spent }`, `level_info`.
- `GET /api/rewards`: returns user rewards union default rewards, with `is_locked: coins < cost`.
- `POST /api/rewards`: adds custom reward for `user_id`.
- `POST /api/rewards/:id/buy`:
  1. Checks user coin balance.
  2. If `user.coins < reward.cost`, returns `400 { error: "Insufficient coins", required: reward.cost, available: user.coins }`.
  3. Deducts `reward.cost` from `users.coins`, adds `reward.cost` to `users.lifetime_spent`.
  4. Inserts row into `transactions (user_id, type, amount, reason, reward_id) VALUES (?, 'spend', ?, ?, ?)`.
  5. Returns `{ ok: true, reward, coins_left, relax_mins: reward.mins }`.
- `GET /api/transactions`: returns latest 50 rows for `user_id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/gamification.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server.ts tests/gamification.test.ts
git commit -m "feat(api): implement dtask gamification formulas and wallet/rewards endpoints"
```

---

### Task 3: Task Modes (Time, Book, Schedule) & Daily Timeline Logic

**Files:**
- Modify: `server.ts`
- Test: `tests/tasks_modes.test.ts`

**Interfaces:**
- Consumes: `tasks` table with new columns.
- Produces:
  - Enhanced `POST /api/tasks` & `PATCH /api/tasks/:id` with validation for `at` (HH:MM), `mins`, `book_title`, `pages`.
  - `POST /api/tasks/:id/done` & `POST /api/tasks/:id/undone`.
  - `POST /api/tasks/:id/timer` (start/pause/bank).
  - `POST /api/tasks/:id/book` (stepper / reader progress).
  - `GET /api/timeline` (chronological list + `active_task` + `next_task`).

- [ ] **Step 1: Write failing task mode tests**

Create `tests/tasks_modes.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { parseAtTime, getTimelineStatus } from "../server";

test("parseAtTime converts HH:MM to minutes since midnight", () => {
  expect(parseAtTime("00:00")).toBe(0);
  expect(parseAtTime("09:30")).toBe(570);
  expect(parseAtTime("23:59")).toBe(1439);
  expect(parseAtTime("invalid")).toBeNull();
});

test("getTimelineStatus determines active and upcoming task slots", () => {
  const tasks = [
    { id: 1, title: "Morning Standup", at: "09:00", mins: 30, status: "open" },
    { id: 2, title: "Deep Work", at: "14:00", mins: 90, status: "open" }
  ];

  // At 09:15, task 1 is active (end is 09:30)
  const at915 = getTimelineStatus(tasks, 9 * 60 + 15);
  expect(at915.active_task?.id).toBe(1);
  expect(at915.next_task?.id).toBe(2);

  // At 10:00, no active task, next task is task 2
  const at1000 = getTimelineStatus(tasks, 10 * 60);
  expect(at1000.active_task).toBeNull();
  expect(at1000.next_task?.id).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/tasks_modes.test.ts`  
Expected: FAIL with functions not defined.

- [ ] **Step 3: Implement task modes and timeline endpoints in `server.ts`**

Add helper functions:
```typescript
export function parseAtTime(atStr: string | null): number | null {
  if (!atStr || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(atStr)) return null;
  const [h, m] = atStr.split(":").map(Number);
  return h * 60 + m;
}

export function getTimelineStatus(tasks: any[], nowMins: number) {
  const timed = tasks
    .filter(t => t.at && t.status !== "done" && !t.archived)
    .sort((a, b) => (parseAtTime(a.at) ?? 0) - (parseAtTime(b.at) ?? 0));

  let active_task: any = null;
  let next_task: any = null;

  for (const t of timed) {
    const startM = parseAtTime(t.at)!;
    const duration = t.mins || 30;
    const endM = startM + duration;

    if (startM <= nowMins && nowMins < endM) {
      active_task = { ...t, remaining_mins: endM - nowMins };
    } else if (startM > nowMins) {
      if (!next_task) {
        next_task = { ...t, mins_until_start: startM - nowMins };
      }
    }
  }

  return { active_task, next_task, timed_tasks: timed };
}
```

Implement routes:
- Update `POST /api/tasks`: Parse `at`, `mins`, `book_title`, `pages`, `book_text`. Validate categories `learn|code|health|read|build`.
- `POST /api/tasks/:id/done`:
  1. If `task.mins > 0`, set `time_spent = mins * 60`.
  2. If `task.pages > 0`, set `page = pages`.
  3. Set `status = 'done'`, `progress = 100`, `completed_at = datetime('now')`.
  4. Call `addXpAndCoins(db, user.id, task.xp || 10, task.coins || 10, "Completed task: " + task.title)`.
  5. Publish SSE event.
- `POST /api/tasks/:id/undone`:
  1. Revert previous `time_spent`, `page`, `progress`.
  2. Deduct previously awarded XP and coins, record `revert` transaction.
- `POST /api/tasks/:id/timer`:
  Accepts `{ action: 'start' | 'pause' | 'bank', time_spent?: number }`. Updates `time_spent`, logs focus session when banking.
- `POST /api/tasks/:id/book`:
  Accepts `{ page: number, pages?: number, book_text?: string }`. If `page >= pages`, automatically marks done.
- `GET /api/timeline`:
  Calculates `nowMins = new Date().getHours() * 60 + new Date().getMinutes()` and returns `{ ...getTimelineStatus(tasks, nowMins), all_scheduled: timed }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/tasks_modes.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server.ts tests/tasks_modes.test.ts
git commit -m "feat(api): implement task modes (time, book, schedule) and timeline endpoint"
```

---

### Task 4: Frontend Infrastructure, Design Tokens & Audio Synth

**Files:**
- Create: `public/js/store.js`
- Create: `public/js/api.js`
- Create: `public/js/audio.js`
- Modify: `public/index.html`

**Interfaces:**
- Consumes: Backend REST API + SSE (`/api/events`).
- Produces:
  - `store`: Reactive state container with event bus (`store.subscribe(event, callback)`).
  - `api`: HTTP request utility with automatic auth header injection.
  - `audio`: Zero-dependency Web Audio API synthesizer for sound effects (`playComplete()`, `playCoinTick()`, `playBell()`).
  - `index.html`: Base application frame with Stitch obsidian theme tokens, topbar status HUD, navigation links, and view mounts.

- [ ] **Step 1: Create `public/js/audio.js`**

Implement synthesizer:
```javascript
// Zero-dependency native Web Audio API synthesizer
class SoundManager {
  constructor() {
    this.ctx = null;
  }
  _init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }
  playCoinTick() {
    try {
      this._init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1800, this.ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {}
  }
  playComplete() {
    try {
      this._init();
      if (!this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const start = this.ctx.currentTime + idx * 0.09;
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      });
    } catch {}
  }
  playBell() {
    try {
      this._init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 1.2);
    } catch {}
  }
}
export const sound = new SoundManager();
```

- [ ] **Step 2: Create `public/js/api.js` and `public/js/store.js`**

Implement standard fetch client and reactive store with timer state management, SSE connectivity, and local storage token caching.

- [ ] **Step 3: Update `public/index.html`**

Update `index.html` to integrate Tailwind config with exact *Neutrals for Balance* palette tokens, Google Fonts (`Space Mono`, `Geist`, `JetBrains Mono`), Material Symbols, fixed topbar HUD (`+-.[ dtask ].-+`, level badge, coin counter, system clock), nav tabs (`[1] Tasks` through `[5] Telemetry`), and mount `<div id="view-root"></div>`.

- [ ] **Step 4: Verify in browser / via curl**

Run: `bun server.ts &` and curl `http://localhost:8787` to verify HTTP 200 and valid HTML markup.

- [ ] **Step 5: Commit**

```bash
git add public/js/audio.js public/js/api.js public/js/store.js public/index.html
git commit -m "feat(frontend): set up core SPA store, audio synth, and topbar status HUD"
```

---

### Task 5: Frontend View 1 — [1] Dashboard / Tasks & Hybrid Book Reader Modal

**Files:**
- Create: `public/js/views/tasks.js`
- Create: `public/js/views/reader.js`
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `store.tasks`, `store.categories`, `api.createTask`, `api.toggleDone`, `api.deleteTask`.
- Produces:
  - Render function `renderTasksView(container)`.
  - Quick-add form with category pills (`[Code]`, `[Learn]`, `[Health]`, `[Read]`, `[Build]`), scheduled time (`--at`), target minutes (`--mins`), or book (`--book`).
  - Task item card components:
    - Time task: progress bar, time spent / target minutes, click to launch Focus Engine.
    - Book task: page stepper (`-1`, `+1`), progress percentage, `[Read]` button opening reader modal.
    - Check task: standard Done checkbox.
  - Hybrid Book Reader modal with page stepper, reading timer, and text view.

- [ ] **Step 1: Implement `public/js/views/reader.js`**

Create reader modal displaying current page, total pages, elapsed reading session timer, text reading area, and "Finish Chapter" / "Save Progress" button.

- [ ] **Step 2: Implement `public/js/views/tasks.js`**

Create tasks view matching the Stitch design:
- Quick capture bar with category selector and mode options.
- Filter chips (`all`, `open`, `done`, search).
- Task cards displaying mode icons, category badge, time/page meters, and action buttons.

- [ ] **Step 3: Test task creation and interactions in browser**

Verify creating a plain task, time task, and book task, toggling done, and launching the reader modal.

- [ ] **Step 4: Commit**

```bash
git add public/js/views/tasks.js public/js/views/reader.js
git commit -m "feat(ui): implement Dashboard/Tasks view with mode cards and book reader modal"
```

---

### Task 6: Frontend View 2 — [2] Daily Timeline

**Files:**
- Create: `public/js/views/timeline.js`
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `api.getTimeline()`, `store.tasks`.
- Produces:
  - Render function `renderTimelineView(container)`.
  - Left pane: ASCII matrix mini-calendar with date switcher (`SU MO TU WE TH FR SA`, `◀ TODAY ▶`), Category slot counters, and Daily Quota allocation gauges.
  - Center pane: 24-hour vertical timeline grid with scheduled slot blocks, duration bars, category tags, and dynamic `► NOW` marker line indicating current system hour/minute.

- [ ] **Step 1: Implement `public/js/views/timeline.js`**

Build the 24-hour timeline and mini ASCII calendar matrix according to `dtask_daily_timeline_neutrals_1/code.html`. Include the real-time position calculation for `► NOW`.

- [ ] **Step 2: Connect scheduling actions**

Allow clicking an unscheduled task to set `--at HH:MM`, or rescheduling an existing timeline slot.

- [ ] **Step 3: Test timeline rendering and time calculations**

Verify slots align correctly to hours (00:00 to 23:00) and that the `► NOW` marker sits at the accurate current time position.

- [ ] **Step 4: Commit**

```bash
git add public/js/views/timeline.js
git commit -m "feat(ui): implement Daily Timeline view with 24h grid, calendar, and NOW marker"
```

---

### Task 7: Frontend View 3 — [3] Live Focus Engine & Dual-Mode Timers

**Files:**
- Create: `public/js/views/focus.js`
- Modify: `public/js/store.js`

**Interfaces:**
- Consumes: `store.activeTimer`, `api.syncTimer`, `sound`.
- Produces:
  - Render function `renderFocusView(container)`.
  - Live Focus Engine terminal HUD:
    - Digital clock display (`MM:SS / TARGET`).
    - Flow pulse status indicator (`ACTIVE_FLOW_PULSE [TICK: Xs]`).
    - Signature btop-style segmented ASCII fill bar (`██████████░░░░░░░░`).
    - Live XP accrual card (`+X XP ACCRUED`) and Coin ledger card (`+X BANKED`).
    - Hotkey command buttons: `[Space] Pause Session`, `[Enter] Mark Complete Now`, `[Ctrl+C / Esc] Stop & Bank`.
    - Dual mode: Focus mode vs. Relax Daemon countdown mode for guilt-free break.

- [ ] **Step 1: Implement timer logic in `public/js/store.js`**

Add background interval ticker in store that persists across tab navigation, calculates elapsed seconds, accrues XP/coins, and plays sound chime upon completion.

- [ ] **Step 2: Implement `public/js/views/focus.js`**

Render the high-contrast terminal focus interface based on `dtask_live_focus_engine_neutrals/code.html` and `dtask_live_timer_neutrals/code.html`.

- [ ] **Step 3: Wire keyboard controls**

Bind `Space` to pause/resume, `Enter` to complete, and `Escape` to stop & bank coins.

- [ ] **Step 4: Verify focus session and relax timer**

Start focus timer, watch progress bar fill, test pause/resume, test completion fanfare chime, and test relax timer switch.

- [ ] **Step 5: Commit**

```bash
git add public/js/views/focus.js public/js/store.js
git commit -m "feat(ui): implement Live Focus Engine with ASCII meters, accrual cards, and relax timer"
```

---

### Task 8: Frontend View 4 & 5 — [4] Rewards Shop & [5] Telemetry / Stats

**Files:**
- Create: `public/js/views/shop.js`
- Create: `public/js/views/telemetry.js`

**Interfaces:**
- Consumes: `api.getRewards`, `api.buyReward`, `api.getStats`, `api.getTransactions`.
- Produces:
  - Render function `renderShopView(container)`:
    - Rewards catalog items with price in 🪙, type (`timed` vs `instant`), icon, and duration tag.
    - Locked vs unlocked visual treatment (`Need X more coins`).
    - `[BUY]` triggers coin deduction, ledger audit entry, and instant launch of the relax countdown timer.
    - Custom reward creation drawer.
    - Recent transaction audit feed.
  - Render function `renderTelemetryView(container)`:
    - RPG tier progression banner (`Apprentice → Practitioner → Adept → Champion → Grandmaster`).
    - Segmented Experience Buffer meter showing progress toward the next level threshold.
    - 7-day XP velocity histogram chart with hover details.
    - Economy metrics summary cards (Balance, Lifetime Earned, Lifetime Spent).

- [ ] **Step 1: Implement `public/js/views/shop.js`**

Build Rewards Shop view according to `dtask_rewards_shop_neutrals/code.html`, including custom reward creation and transaction audit feed.

- [ ] **Step 2: Implement `public/js/views/telemetry.js`**

Build Telemetry & Stats view according to `dtask_telemetry_analytics_neutrals_1/code.html`, including the 7-day XP velocity histogram and RPG level progression banner.

- [ ] **Step 3: Test reward purchasing and telemetry metrics**

Verify purchasing an item deducts coins, adds a transaction row, and launches the relax timer; verify XP velocity chart displays recent activity correctly.

- [ ] **Step 4: Commit**

```bash
git add public/js/views/shop.js public/js/views/telemetry.js
git commit -m "feat(ui): implement Rewards Shop with live purchases and Telemetry/Stats view"
```

---

### Task 9: Global Keyboard Shortcuts, Public Board & Full Verification

**Files:**
- Modify: `public/js/app.js`
- Modify: `public/public.html`
- Test: `tests/e2e.test.ts`

**Interfaces:**
- Consumes: All views and backend endpoints.
- Produces:
  - Full router switching views `[1]` through `[5]` with keys `1`, `2`, `3`, `4`, `5`.
  - Public profile board at `/u/:username` updated to the obsidian *Neutrals for Balance* aesthetic.
  - End-to-end test suite verifying the complete application workflow.

- [ ] **Step 1: Connect hotkey router in `public/js/app.js`**

Handle keys `1`–`5` for instant tab switching, `A` for quick task add, and update URL hash (`#tasks`, `#timeline`, `#focus`, `#shop`, `#stats`).

- [ ] **Step 2: Update public profile board in `public/public.html`**

Restyle public board with obsidian background, sharp borders, level rank badge, and read-only task list.

- [ ] **Step 3: Write and run end-to-end test suite**

Create `tests/e2e.test.ts` testing the complete lifecycle:
```typescript
import { test, expect } from "bun:test";
import { server } from "../server";

test("full user lifecycle: user -> task -> timer -> level up -> shop buy", async () => {
  const base = `http://localhost:${server.port}/api`;
  const username = "testuser_" + Date.now();

  // 1. Register user
  const regRes = await fetch(`${base}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const { user } = await regRes.json();
  const auth = { Authorization: `Bearer ${user.api_key}` };

  // 2. Add time task
  const taskRes = await fetch(`${base}/tasks`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ category: "learn", title: "Study Zig", mins: 30, at: "10:00" }),
  });
  const { task } = await taskRes.json();
  expect(task.mins).toBe(30);

  // 3. Mark done -> awards XP and coins
  await fetch(`${base}/tasks/${task.id}/done`, { method: "POST", headers: auth });

  // 4. Check user stats
  const meRes = await fetch(`${base}/me`, { headers: auth });
  const me = await meRes.json();
  expect(me.user.coins).toBeGreaterThanOrEqual(10);

  // 5. Buy reward if enough coins
  const rewardsRes = await fetch(`${base}/rewards`, { headers: auth });
  const { rewards } = await rewardsRes.json();
  const cheap = rewards.find((r: any) => r.cost <= me.user.coins);
  if (cheap) {
    const buyRes = await fetch(`${base}/rewards/${cheap.id}/buy`, { method: "POST", headers: auth });
    expect(buyRes.status).toBe(200);
  }
});
```
Run: `bun test`  
Expected: All test suites pass.

- [ ] **Step 4: Final commit**

```bash
git add public/js/app.js public/public.html tests/e2e.test.ts
git commit -m "feat: complete dtask-web redesign with global hotkeys and e2e test suite"
```
