// btask-web — minimalist task dashboard + JSON API for CLI users
// Single Bun process: serves static HTML/CSS/JS + JSON API.
// Storage: SQLite at BTASK_DB env var (default /opt/data/btask-web/db.sqlite).
// Port: BTASK_PORT env var (default 8787).

import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PORT = parseInt(process.env.BTASK_PORT || (process.env.NODE_ENV === "test" ? "0" : "8787"));
const DB_PATH = process.env.BTASK_DB || (process.env.NODE_ENV === "test" ? `/tmp/btask-test-${process.pid}.sqlite` : join(import.meta.dir, "db.sqlite"));
const STATIC_DIR = join(import.meta.dir, "public");

// ── DB ──────────────────────────────────────────────────────────────
export const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    is_public INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('code','read','health','personal','work','maintenance','learn','build')),
    title TEXT NOT NULL,
    progress INTEGER DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    status TEXT DEFAULT 'open' CHECK(status IN ('open','done','review','dev','idle','run')),
    time_estimate TEXT,
    archived INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS tasks_user_status ON tasks(user_id, status, archived);
  CREATE INDEX IF NOT EXISTS users_public ON users(is_public, username);
  CREATE TABLE IF NOT EXISTS focus_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    minutes INTEGER NOT NULL,
    logged_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS activity (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    PRIMARY KEY(user_id, day),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

export const ALLOWED_CATEGORIES = ["learn", "code", "health", "read", "build", "personal", "work", "maintenance"];

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
  try {
    database.exec(`
      UPDATE tasks SET category = 'build' WHERE category = 'work';
      UPDATE tasks SET category = 'health' WHERE category = 'personal';
      UPDATE tasks SET category = 'code' WHERE category = 'maintenance';
    `);
  } catch {
    database.exec("PRAGMA ignore_check_constraints = ON;");
    database.exec(`
      UPDATE tasks SET category = 'build' WHERE category = 'work';
      UPDATE tasks SET category = 'health' WHERE category = 'personal';
      UPDATE tasks SET category = 'code' WHERE category = 'maintenance';
    `);
    database.exec("PRAGMA ignore_check_constraints = OFF;");
  }
}

runMigrations(db);


// ── In-process pub/sub for SSE ─────────────────────────────────────
type Evt = { userId: number; type: string; payload: any };
const subs = new Set<(e: Evt) => void>();
function publish(e: Evt) { for (const fn of subs) try { fn(e); } catch {} }
function bumpActivity(userId: number) {
  const today = new Date().toISOString().slice(0, 10);
  db.query("INSERT INTO activity (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1").run(userId, today);
  publish({ userId, type: "activity", payload: { day: today } });
}

// ── Gamification formulas ──────────────────────────────────────────
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
  const totals = database.query(`
    SELECT
      (SELECT COALESCE(SUM(COALESCE(xp, 10)), 0) FROM tasks WHERE user_id = ? AND status = 'done' AND archived = 0) +
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

export function parseAtTime(atStr: string | null): number | null {
  if (!atStr || typeof atStr !== "string" || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(atStr)) return null;
  const [h, m] = atStr.split(":").map(Number);
  return h * 60 + m;
}

export function getTimelineStatus(tasks: any[], nowMins: number) {
  const timed = tasks
    .filter(t => t.at && parseAtTime(t.at) !== null && t.status !== "done" && !t.archived)
    .sort((a, b) => (parseAtTime(a.at) ?? 0) - (parseAtTime(b.at) ?? 0));

  let active_task: any = null;
  let next_task: any = null;

  for (const t of timed) {
    const startM = parseAtTime(t.at)!;
    const duration = t.mins || 30;
    const endM = startM + duration;

    if (!active_task && startM <= nowMins && nowMins < endM) {
      active_task = { ...t, remaining_mins: endM - nowMins };
    } else if (startM > nowMins) {
      if (!next_task) {
        next_task = { ...t, mins_until_start: startM - nowMins };
      }
    }
  }

  return { active_task, next_task, timed_tasks: timed };
}

export function completeTask(task: any, userId: number) {
  if (task.status === "done") {
    return task;
  }

  let newTimeSpent = task.time_spent ?? 0;
  let prevTimeSpent = task.prev_time_spent;
  if ((task.mins ?? 0) > 0 && (task.time_spent ?? 0) < (task.mins * 60)) {
    prevTimeSpent = task.time_spent ?? 0;
    newTimeSpent = task.mins * 60;
  }

  let newPage = task.page ?? 0;
  let prevPage = task.prev_page;
  if ((task.pages ?? 0) > 0 && (task.page ?? 0) < task.pages) {
    prevPage = task.page ?? 0;
    newPage = task.pages;
  }

  const prevProgress = task.progress ?? 0;

  const xp = task.xp !== undefined && task.xp !== null ? task.xp : 10;
  const coins = task.coins !== undefined && task.coins !== null ? task.coins : 10;
  addXpAndCoins(db, userId, xp, coins, `Completed task: ${task.title}`);

  db.query(`
    UPDATE tasks
    SET status = 'done',
        progress = 100,
        completed_at = datetime('now'),
        updated_at = datetime('now'),
        time_spent = ?,
        prev_time_spent = ?,
        page = ?,
        prev_page = ?,
        prev_progress = ?,
        running_since = NULL
    WHERE id = ? AND user_id = ?
  `).run(newTimeSpent, prevTimeSpent, newPage, prevPage, prevProgress, task.id, userId);

  bumpActivity(userId);
  const updated = db.query("SELECT * FROM tasks WHERE id = ?").get(task.id);
  publish({ userId, type: "task", payload: updated });
  return updated;
}

// ── Helpers ─────────────────────────────────────────────────────────
function genKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
function json(data: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store", ...extraHeaders },
  });
}
function err(msg: string, status = 400) { return json({ error: msg }, status); }

function getUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  let apiKey = "";
  if (auth.toLowerCase().startsWith("bearer ")) apiKey = auth.slice(7).trim();
  else {
    try {
      const u = new URL(req.url);
      apiKey = u.searchParams.get("api_key") || "";
    } catch {}
  }
  if (!apiKey) return null;
  return Q.getUserByKey.get(apiKey) as { id: number; username: string; is_public: number; coins: number; lifetime_earned: number; lifetime_spent: number; created_at: string } | null;
}

function getOrCreateUser(req: Request, bodyUsername?: string): { user: any; created: boolean } | null {
  let user = getUser(req);
  if (user) return { user, created: false };
  const username = (req.headers.get("x-btask-user") || bodyUsername || "").trim().toLowerCase();
  if (!username || !/^[a-z0-9_-]{2,32}$/.test(username)) return null;
  const existing = Q.getUserByName.get(username) as any;
  if (existing) return { user: existing, created: false };
  const api_key = genKey();
  const info = Q.insertUser.run(username, api_key);
  return { user: { id: info.lastInsertRowid, username, api_key, is_public: 0, coins: 0, lifetime_earned: 0, lifetime_spent: 0 }, created: true };
}

// Last-7-days with zero-filled gaps (oldest first)
function last7Days(rows: { day: string; count: number }[]) {
  const map = new Map(rows.map(r => [r.day, r.count]));
  const today = new Date(); today.setUTCHours(0,0,0,0);
  const out: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setUTCDate(today.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: map.get(key) ?? 0 });
  }
  return out;
}

// ── Prepared statements (hot path cache) ────────────────────────
// .query() compiles each call; .prepare() caches the bytecode.
// Significant for high-RQ endpoints (SSE-pushed reloads).
const Q = {
  getUserByKey: db.prepare("SELECT id, username, is_public, coins, lifetime_earned, lifetime_spent, created_at FROM users WHERE api_key = ?"),
  getUserByName: db.prepare("SELECT id, username, api_key, is_public, coins, lifetime_earned, lifetime_spent, created_at FROM users WHERE username = ?"),
  getUserByNamePublic: db.prepare("SELECT id, username, is_public, created_at FROM users WHERE username = ?"),
  isUsernameTaken: db.prepare("SELECT id FROM users WHERE username = ? AND id != ?"),
  updateUser: db.prepare("UPDATE users SET is_public = ? WHERE id = ?"),
  updateUsername: db.prepare("UPDATE users SET username = ? WHERE id = ?"),
  bumpActivity: db.prepare("INSERT INTO activity (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1"),
  insertTask: db.prepare("INSERT INTO tasks (user_id, category, title, progress, status, time_estimate) VALUES (?, ?, ?, ?, ?, ?)"),
  insertUser: db.prepare("INSERT INTO users (username, api_key) VALUES (?, ?)"),
  selectTask: db.prepare("SELECT * FROM tasks WHERE id = ?"),
  archiveTask: db.prepare("UPDATE tasks SET archived = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?"),
  hardDeleteTask: db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?"),
  markDone: db.prepare("UPDATE tasks SET status='done', progress=100, completed_at=datetime('now'), updated_at=datetime('now') WHERE id = ? AND user_id = ?"),
  setProgress: db.prepare("UPDATE tasks SET progress = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"),
  focusSum: db.prepare("SELECT COALESCE(SUM(minutes),0) AS total_min FROM focus_sessions WHERE user_id = ?"),
  insertFocus: db.prepare("INSERT INTO focus_sessions (user_id, minutes) VALUES (?, ?)"),
  activity7d: db.prepare("SELECT day, count FROM activity WHERE user_id = ? AND day >= date('now', '-6 days') ORDER BY day"),
  totalsFor: db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN archived=1 THEN 1 ELSE 0 END) AS archived FROM tasks WHERE user_id = ?`),
};

// ── Routes ──────────────────────────────────────────────────────────
const routes: { method: string; path: RegExp; handler: (req: Request, params: any) => Promise<Response> | Response }[] = [
  // health
  { method: "GET", path: /^\/api\/health$/, handler: () => json({ ok: true, service: "btask-web", version: "1.1.0", uptime_s: Math.floor(process.uptime()) }) },

  // user self-register / login
  { method: "POST", path: /^\/api\/users$/, handler: async (req) => {
    const body = await req.json().catch(() => ({}));
    const r = getOrCreateUser(req, body.username);
    if (!r) return err("username required (2-32 chars: a-z 0-9 _ -)", 400);
    return json({ user: r.user, created: r.created }, r.created ? 201 : 200);
  }},

  // who am i
  { method: "GET", path: /^\/api\/me$/, handler: (req) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const fullUser = db.query("SELECT id, username, is_public, coins, lifetime_earned, lifetime_spent, created_at FROM users WHERE id = ?").get(u.id) as any;
    const totals = db.query(`
      SELECT
        (SELECT COALESCE(SUM(COALESCE(xp, 10)), 0) FROM tasks WHERE user_id = ? AND status = 'done' AND archived = 0) +
        (SELECT COALESCE(SUM(minutes), 0) FROM focus_sessions WHERE user_id = ?) AS total_xp
    `).get(u.id, u.id) as any;
    const totalXp = totals?.total_xp || 0;
    const levelInfo = getLevelInfo(totalXp);
    return json({
      user: fullUser,
      wallet: {
        coins: fullUser?.coins ?? 0,
        lifetime_earned: fullUser?.lifetime_earned ?? 0,
        lifetime_spent: fullUser?.lifetime_spent ?? 0,
      },
      level_info: levelInfo,
    });
  }},

  // update me (rename handle, toggle public board)
  { method: "PATCH", path: /^\/api\/me$/, handler: async (req) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const body = await req.json().catch(() => ({}));
    const updates: string[] = [];
    const args: any[] = [];
    if (body.username !== undefined) {
      const nu = String(body.username).trim().toLowerCase();
      if (!/^[a-z0-9_-]{2,32}$/.test(nu)) return err("invalid username (2-32: a-z 0-9 _ -)", 400);
      const conflict = db.query("SELECT id FROM users WHERE username = ? AND id != ?").get(nu, u.id);
      if (conflict) return err("username taken", 409);
      updates.push("username = ?"); args.push(nu);
    }
    if (body.is_public !== undefined) { updates.push("is_public = ?"); args.push(body.is_public ? 1 : 0); }
    if (updates.length === 0) return json({ user: u });
    args.push(u.id);
    db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...args);
    const updated = db.query("SELECT id, username, is_public, coins, lifetime_earned, lifetime_spent, created_at FROM users WHERE id = ?").get(u.id);
    return json({ user: updated });
  }},

  // public profile (read-only) by username
  { method: "GET", path: /^\/api\/u\/([a-z0-9_-]+)$/, handler: (_req, params) => {
    const username = params[1];
    const u = db.query("SELECT id, username, is_public, created_at FROM users WHERE username = ?").get(username) as any;
    if (!u || !u.is_public) return err("not found", 404);
    const totals = db.query(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done
      FROM tasks WHERE user_id = ? AND archived = 0
    `).get(u.id) as any;
    const tasks = db.query("SELECT id, category, title, progress, status, completed_at, time_estimate, created_at FROM tasks WHERE user_id = ? AND archived = 0 ORDER BY created_at DESC LIMIT 50").all(u.id);
    const focus = db.query("SELECT COALESCE(SUM(minutes),0) AS m FROM focus_sessions WHERE user_id = ?").get(u.id) as any;
    const recent = db.query("SELECT day, count FROM activity WHERE user_id = ? AND day >= date('now', '-6 days')").all(u.id);
    return json({ user: { username: u.username, is_public: !!u.is_public, created_at: u.created_at }, totals, tasks, focus_minutes: focus.m, activity_7d: last7Days(recent) });
  }},

  // rewards & wallet
  { method: "GET", path: /^\/api\/rewards$/, handler: (req) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const user = db.query("SELECT coins FROM users WHERE id = ?").get(u.id) as any;
    const coins = user?.coins ?? 0;
    const rows = db.query("SELECT * FROM rewards WHERE user_id IS NULL OR user_id = ? ORDER BY id ASC").all(u.id) as any[];
    const rewards = rows.map(r => ({
      ...r,
      is_locked: coins < r.cost,
      needed_coins: Math.max(0, r.cost - coins),
    }));
    return json({ rewards });
  }},

  { method: "POST", path: /^\/api\/rewards$/, handler: async (req) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) return err("name required (max 100)", 400);
    const cost = parseInt(body.cost);
    if (isNaN(cost) || cost < 1) return err("cost must be integer >= 1", 400);
    const mins = body.mins !== undefined ? parseInt(body.mins) : 0;
    if (isNaN(mins) || mins < 0) return err("mins must be integer >= 0", 400);
    const type = body.type || (mins > 0 ? "timed" : "instant");
    if (type !== "timed" && type !== "instant") return err("type must be timed or instant", 400);
    const icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : "🎁";
    const info = db.query(
      "INSERT INTO rewards (user_id, name, cost, mins, type, icon) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(u.id, name, cost, mins, type, icon);
    const reward = db.query("SELECT * FROM rewards WHERE id = ?").get(info.lastInsertRowid);
    publish({ userId: u.id, type: "reward_create", payload: reward });
    return json({ reward }, 201);
  }},

  { method: "POST", path: /^\/api\/rewards\/(\d+)\/buy$/, handler: (req, params) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const id = parseInt(params[1]);
    const reward = db.query("SELECT * FROM rewards WHERE id = ? AND (user_id IS NULL OR user_id = ?)").get(id, u.id) as any;
    if (!reward) return err("reward not found", 404);
    const user = db.query("SELECT coins, lifetime_spent FROM users WHERE id = ?").get(u.id) as any;
    const currentCoins = user?.coins ?? 0;
    if (currentCoins < reward.cost) {
      return json({ error: "Insufficient coins", required: reward.cost, available: currentCoins }, 400);
    }
    const coinsLeft = currentCoins - reward.cost;
    db.query("UPDATE users SET coins = coins - ?, lifetime_spent = lifetime_spent + ? WHERE id = ?").run(reward.cost, reward.cost, u.id);
    db.query("INSERT INTO transactions (user_id, type, amount, reason, reward_id) VALUES (?, 'spend', ?, ?, ?)").run(
      u.id,
      reward.cost,
      `Bought ${reward.name}`,
      reward.id
    );
    publish({ userId: u.id, type: "reward_buy", payload: { reward, coins_left: coinsLeft } });
    return json({ ok: true, reward, coins_left: coinsLeft, relax_mins: reward.mins });
  }},

  { method: "GET", path: /^\/api\/transactions$/, handler: (req) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const transactions = db.query("SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50").all(u.id);
    return json({ transactions });
  }},

  // tasks CRUD
  { method: "GET", path: /^\/api\/tasks$/, handler: (req) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");
    const includeArchived = url.searchParams.get("archived") === "1";
    const q = (url.searchParams.get("q") || "").trim();
    let sql = "SELECT * FROM tasks WHERE user_id = ?";
    const args: any[] = [u.id];
    if (!includeArchived) sql += " AND archived = 0";
    if (category) { sql += " AND category = ?"; args.push(category); }
    if (status) { sql += " AND status = ?"; args.push(status); }
    if (q) { sql += " AND title LIKE ?"; args.push(`%${q.replace(/[%_]/g, "\\$&")}%`); }
    sql += " ORDER BY created_at DESC";
    const tasks = q ? db.query(sql).all(...args) : db.query(sql).all(...args);
    return json({ tasks });
  }},

  { method: "POST", path: /^\/api\/tasks$/, handler: async (req) => {
    const r = getOrCreateUser(req);
    if (!r) return err("unauthorized (provide Authorization: Bearer *** OR X-Btask-User: <username>)", 401);
    const u = r.user;
    const body = await req.json().catch(() => ({}));
    const { category, title, progress, status, time_estimate } = body;
    if (!category || !ALLOWED_CATEGORIES.includes(category))
      return err("category must be: " + ALLOWED_CATEGORIES.join("|"), 400);
    if (!title || typeof title !== "string" || title.length > 200) return err("title required (max 200)", 400);
    const prog = Math.max(0, Math.min(100, parseInt(progress ?? "0")));
    const st = status || "open";

    let at: string | null = null;
    if (body.at !== undefined && body.at !== null && body.at !== "") {
      if (typeof body.at !== "string" || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(body.at)) {
        return err("invalid 'at' format (expected HH:MM)", 400);
      }
      at = body.at;
    }

    let mins = 0;
    if (body.mins !== undefined && body.mins !== null) {
      mins = parseInt(body.mins);
      if (isNaN(mins) || mins < 0) return err("mins must be integer >= 0", 400);
    }

    let time_spent = 0;
    if (body.time_spent !== undefined && body.time_spent !== null) {
      time_spent = parseInt(body.time_spent);
      if (isNaN(time_spent) || time_spent < 0) return err("time_spent must be integer >= 0", 400);
    }

    const book_title = body.book_title !== undefined && body.book_title !== null ? String(body.book_title) : null;
    const book_text = body.book_text !== undefined && body.book_text !== null ? String(body.book_text) : null;

    let page = 0;
    if (body.page !== undefined && body.page !== null) {
      page = parseInt(body.page);
      if (isNaN(page) || page < 0) return err("page must be integer >= 0", 400);
    }

    let pages = 0;
    if (body.pages !== undefined && body.pages !== null) {
      pages = parseInt(body.pages);
      if (isNaN(pages) || pages < 0) return err("pages must be integer >= 0", 400);
    }

    let xp = 10;
    if (body.xp !== undefined && body.xp !== null) {
      xp = parseInt(body.xp);
      if (isNaN(xp) || xp < 0) return err("xp must be integer >= 0", 400);
    }

    let coins = 10;
    if (body.coins !== undefined && body.coins !== null) {
      coins = parseInt(body.coins);
      if (isNaN(coins) || coins < 0) return err("coins must be integer >= 0", 400);
    }

    const info = db.query(`
      INSERT INTO tasks (
        user_id, category, title, progress, status, time_estimate,
        at, mins, time_spent, book_title, book_text, page, pages, xp, coins
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      u.id, category, title, prog, st, time_estimate || null,
      at, mins, time_spent, book_title, book_text, page, pages, xp, coins
    );
    bumpActivity(u.id);
    const task = db.query("SELECT * FROM tasks WHERE id = ?").get(info.lastInsertRowid);
    publish({ userId: u.id, type: "task", payload: task });
    return json({ task, api_key: r.created ? u.api_key : undefined }, 201);
  }},

  // bulk import
  { method: "POST", path: /^\/api\/tasks\/import$/, handler: async (req) => {
    const r = getOrCreateUser(req);
    if (!r) return err("unauthorized", 401);
    const u = r.user;
    const body = await req.json().catch(() => ({}));
    const items: any[] = Array.isArray(body.tasks) ? body.tasks : [];
    if (!items.length) return err("body.tasks must be a non-empty array", 400);
    let inserted = 0, errors: any[] = [];
    const ins = db.prepare(`
      INSERT INTO tasks (
        user_id, category, title, progress, status, time_estimate,
        at, mins, time_spent, book_title, book_text, page, pages, xp, coins
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((rows: any[]) => {
      for (let i = 0; i < rows.length; i++) {
        const t = rows[i];
        if (!t.title || typeof t.title !== "string" || !ALLOWED_CATEGORIES.includes(t.category)) {
          errors.push({ index: i, reason: "invalid title or category" }); continue;
        }
        let at = null;
        if (t.at && typeof t.at === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(t.at)) {
          at = t.at;
        }
        const mins = Math.max(0, parseInt(t.mins ?? "0") || 0);
        const time_spent = Math.max(0, parseInt(t.time_spent ?? "0") || 0);
        const book_title = t.book_title ? String(t.book_title) : null;
        const book_text = t.book_text ? String(t.book_text) : null;
        const page = Math.max(0, parseInt(t.page ?? "0") || 0);
        const pages = Math.max(0, parseInt(t.pages ?? "0") || 0);
        const xp = t.xp !== undefined ? Math.max(0, parseInt(t.xp)) : 10;
        const coins = t.coins !== undefined ? Math.max(0, parseInt(t.coins)) : 10;

        ins.run(
          u.id, t.category, String(t.title).slice(0, 200),
          Math.max(0, Math.min(100, parseInt(t.progress ?? "0"))),
          t.status || "open", t.time_estimate || null,
          at, mins, time_spent, book_title, book_text, page, pages, xp, coins
        );
        inserted++;
      }
    });
    tx(items);
    bumpActivity(u.id);
    publish({ userId: u.id, type: "import", payload: { count: inserted } });
    return json({ inserted, errors });
  }},

  { method: "PATCH", path: /^\/api\/tasks\/(\d+)$/, handler: async (req, params) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const id = parseInt(params[1]);
    const task = db.query("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, u.id);
    if (!task) return err("not found", 404);
    const body = await req.json().catch(() => ({}));
    const updates: string[] = [];
    const args: any[] = [];
    if (body.title !== undefined) { updates.push("title = ?"); args.push(String(body.title).slice(0, 200)); }
    if (body.category !== undefined) {
      if (!ALLOWED_CATEGORIES.includes(body.category))
        return err("invalid category", 400);
      updates.push("category = ?"); args.push(body.category);
    }
    if (body.progress !== undefined) {
      updates.push("progress = ?"); args.push(Math.max(0, Math.min(100, parseInt(body.progress))));
    }
    if (body.status !== undefined) {
      if (!["open","done","review","dev","idle","run"].includes(body.status))
        return err("invalid status", 400);
      updates.push("status = ?"); args.push(body.status);
      if (body.status === "done") { updates.push("completed_at = datetime('now')"); }
      else { updates.push("completed_at = NULL"); }
    }
    if (body.time_estimate !== undefined) { updates.push("time_estimate = ?"); args.push(body.time_estimate); }
    if (body.archived !== undefined) { updates.push("archived = ?"); args.push(body.archived ? 1 : 0); }
    if (body.at !== undefined) {
      if (body.at === null || body.at === "") {
        updates.push("at = NULL");
      } else if (typeof body.at === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(body.at)) {
        updates.push("at = ?"); args.push(body.at);
      } else {
        return err("invalid 'at' format (expected HH:MM)", 400);
      }
    }
    if (body.mins !== undefined) {
      const mins = parseInt(body.mins);
      if (isNaN(mins) || mins < 0) return err("mins must be integer >= 0", 400);
      updates.push("mins = ?"); args.push(mins);
    }
    if (body.time_spent !== undefined) {
      const ts = parseInt(body.time_spent);
      if (isNaN(ts) || ts < 0) return err("time_spent must be integer >= 0", 400);
      updates.push("time_spent = ?"); args.push(ts);
    }
    if (body.book_title !== undefined) {
      updates.push("book_title = ?"); args.push(body.book_title !== null ? String(body.book_title) : null);
    }
    if (body.book_text !== undefined) {
      updates.push("book_text = ?"); args.push(body.book_text !== null ? String(body.book_text) : null);
    }
    if (body.page !== undefined) {
      const page = parseInt(body.page);
      if (isNaN(page) || page < 0) return err("page must be integer >= 0", 400);
      updates.push("page = ?"); args.push(page);
    }
    if (body.pages !== undefined) {
      const pages = parseInt(body.pages);
      if (isNaN(pages) || pages < 0) return err("pages must be integer >= 0", 400);
      updates.push("pages = ?"); args.push(pages);
    }
    if (body.xp !== undefined) {
      const xp = parseInt(body.xp);
      if (isNaN(xp) || xp < 0) return err("xp must be integer >= 0", 400);
      updates.push("xp = ?"); args.push(xp);
    }
    if (body.coins !== undefined) {
      const coins = parseInt(body.coins);
      if (isNaN(coins) || coins < 0) return err("coins must be integer >= 0", 400);
      updates.push("coins = ?"); args.push(coins);
    }
    if (body.running_since !== undefined) {
      updates.push("running_since = ?"); args.push(body.running_since === null ? null : parseInt(body.running_since));
    }
    if (body.prev_time_spent !== undefined) {
      updates.push("prev_time_spent = ?"); args.push(body.prev_time_spent === null ? null : parseInt(body.prev_time_spent));
    }
    if (body.prev_page !== undefined) {
      updates.push("prev_page = ?"); args.push(body.prev_page === null ? null : parseInt(body.prev_page));
    }
    if (body.prev_progress !== undefined) {
      updates.push("prev_progress = ?"); args.push(body.prev_progress === null ? null : parseInt(body.prev_progress));
    }

    if (updates.length === 0) return json({ task });
    updates.push("updated_at = datetime('now')");
    args.push(id, u.id);
    db.query(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).run(...args);
    if (body.status === "done") bumpActivity(u.id);
    const updated = db.query("SELECT * FROM tasks WHERE id = ?").get(id);
    publish({ userId: u.id, type: "task", payload: updated });
    return json({ task: updated });
  }},

  { method: "DELETE", path: /^\/api\/tasks\/(\d+)$/, handler: (req, params) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const id = parseInt(params[1]);
    const url = new URL(req.url);
    const hard = url.searchParams.get("hard") === "1";
    if (hard) {
      const r = db.query("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, u.id);
      if (r.changes > 0) publish({ userId: u.id, type: "task", payload: { id, deleted: true } });
      return r.changes > 0 ? json({ deleted: id }) : err("not found", 404);
    }
    const r = db.query("UPDATE tasks SET archived = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(id, u.id);
    if (r.changes > 0) publish({ userId: u.id, type: "task", payload: { id, archived: true } });
    return r.changes > 0 ? json({ archived: id }) : err("not found", 404);
  }},

  // quick actions
  { method: "POST", path: /^\/api\/tasks\/(\d+)\/done$/, handler: (req, params) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const id = parseInt(params[1]);
    const task = db.query("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, u.id) as any;
    if (!task) return err("not found", 404);
    const t = completeTask(task, u.id);
    return json({ task: t });
  }},
  { method: "POST", path: /^\/api\/tasks\/(\d+)\/undone$/, handler: (req, params) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const id = parseInt(params[1]);
    const task = db.query("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, u.id) as any;
    if (!task) return err("not found", 404);

    if (task.status !== "done") {
      return json({ task });
    }

    const restoredTimeSpent = task.prev_time_spent !== null && task.prev_time_spent !== undefined ? task.prev_time_spent : (task.time_spent ?? 0);
    const restoredPage = task.prev_page !== null && task.prev_page !== undefined ? task.prev_page : (task.page ?? 0);
    const restoredProgress = task.prev_progress !== null && task.prev_progress !== undefined ? task.prev_progress : 0;

    const coinsToDeduct = task.coins !== undefined && task.coins !== null ? task.coins : 10;
    db.query("UPDATE users SET coins = MAX(0, coins - ?), lifetime_earned = MAX(0, lifetime_earned - ?) WHERE id = ?")
      .run(coinsToDeduct, coinsToDeduct, u.id);
    db.query("INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, 'revert', ?, ?)")
      .run(u.id, coinsToDeduct, "Reverted task: " + task.title);

    db.query(`
      UPDATE tasks
      SET status = 'open',
          completed_at = NULL,
          updated_at = datetime('now'),
          time_spent = ?,
          page = ?,
          progress = ?,
          prev_time_spent = NULL,
          prev_page = NULL,
          prev_progress = NULL
      WHERE id = ? AND user_id = ?
    `).run(restoredTimeSpent, restoredPage, restoredProgress, id, u.id);

    const updated = db.query("SELECT * FROM tasks WHERE id = ?").get(id);
    publish({ userId: u.id, type: "task", payload: updated });
    return json({ task: updated });
  }},
  { method: "POST", path: /^\/api\/tasks\/(\d+)\/timer$/, handler: async (req, params) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const id = parseInt(params[1]);
    const task = db.query("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, u.id) as any;
    if (!task) return err("not found", 404);

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    if (!["start", "pause", "bank"].includes(action)) {
      return err("action must be 'start', 'pause', or 'bank'", 400);
    }

    const nowTs = Math.floor(Date.now() / 1000);

    if (action === "start") {
      let timeSpent = task.time_spent ?? 0;
      if (body.time_spent !== undefined) {
        timeSpent = Math.max(0, parseInt(body.time_spent));
      }
      db.query("UPDATE tasks SET running_since = ?, time_spent = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
        .run(nowTs, timeSpent, id, u.id);
    } else if (action === "pause") {
      let timeSpent = task.time_spent ?? 0;
      if (body.time_spent !== undefined) {
        timeSpent = Math.max(0, parseInt(body.time_spent));
      } else if (task.running_since) {
        const elapsed = nowTs - task.running_since;
        timeSpent += Math.max(0, elapsed);
      }
      db.query("UPDATE tasks SET running_since = NULL, time_spent = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
        .run(timeSpent, id, u.id);
    } else if (action === "bank") {
      let timeSpent = task.time_spent ?? 0;
      if (body.time_spent !== undefined) {
        timeSpent = Math.max(0, parseInt(body.time_spent));
      } else if (task.running_since) {
        const elapsed = nowTs - task.running_since;
        timeSpent += Math.max(0, elapsed);
      }

      const minsToBank = body.minutes !== undefined ? parseInt(body.minutes) : Math.floor(timeSpent / 60);
      if (minsToBank > 0) {
        db.query("INSERT INTO focus_sessions (user_id, minutes) VALUES (?, ?)").run(u.id, minsToBank);
        bumpActivity(u.id);
        const earnedCoins = Math.floor(minsToBank / 2);
        if (earnedCoins > 0) {
          db.query("UPDATE users SET coins = coins + ?, lifetime_earned = lifetime_earned + ? WHERE id = ?").run(earnedCoins, earnedCoins, u.id);
          db.query("INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, 'earn', ?, ?)").run(u.id, earnedCoins, `Focus session bank: ${minsToBank} mins (+${earnedCoins} coins)`);
        }
        publish({ userId: u.id, type: "focus", payload: { minutes: minsToBank } });
      }

      db.query("UPDATE tasks SET running_since = NULL, time_spent = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
        .run(timeSpent, id, u.id);
    }

    const updated = db.query("SELECT * FROM tasks WHERE id = ?").get(id);
    publish({ userId: u.id, type: "task", payload: updated });
    return json({ task: updated });
  }},
  { method: "POST", path: /^\/api\/tasks\/(\d+)\/book$/, handler: async (req, params) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const id = parseInt(params[1]);
    const task = db.query("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, u.id) as any;
    if (!task) return err("not found", 404);

    const body = await req.json().catch(() => ({}));
    if (body.page === undefined) return err("page required", 400);
    const page = parseInt(body.page);
    if (isNaN(page) || page < 0) return err("page must be integer >= 0", 400);

    const pages = body.pages !== undefined ? parseInt(body.pages) : (task.pages || 0);
    if (isNaN(pages) || pages < 0) return err("pages must be integer >= 0", 400);

    const book_text = body.book_text !== undefined ? (body.book_text !== null ? String(body.book_text) : null) : task.book_text;

    // Update book page, pages, book_text
    db.query("UPDATE tasks SET page = ?, pages = ?, book_text = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(page, pages, book_text, id, u.id);

    const updatedTask = db.query("SELECT * FROM tasks WHERE id = ?").get(id) as any;

    if (pages > 0 && page >= pages) {
      const completed = completeTask(updatedTask, u.id);
      return json({ task: completed });
    }

    const progress = pages > 0 ? Math.min(100, Math.floor((page / pages) * 100)) : updatedTask.progress;
    db.query("UPDATE tasks SET progress = ? WHERE id = ?").run(progress, id);
    const finalTask = db.query("SELECT * FROM tasks WHERE id = ?").get(id);
    publish({ userId: u.id, type: "task", payload: finalTask });
    return json({ task: finalTask });
  }},
  { method: "POST", path: /^\/api\/tasks\/(\d+)\/progress$/, handler: async (req, params) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const id = parseInt(params[1]);
    const body = await req.json().catch(() => ({}));
    const p = Math.max(0, Math.min(100, parseInt(body.progress ?? "0")));
    const r = db.query("UPDATE tasks SET progress = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(p, id, u.id);
    if (r.changes === 0) return err("not found", 404);
    const t = db.query("SELECT * FROM tasks WHERE id = ?").get(id);
    publish({ userId: u.id, type: "task", payload: t });
    return json({ task: t });
  }},

  // timeline
  { method: "GET", path: /^\/api\/timeline$/, handler: (req) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const url = new URL(req.url);
    const nowParam = url.searchParams.get("now");
    let nowMins: number;
    if (nowParam !== null && !isNaN(parseInt(nowParam))) {
      nowMins = parseInt(nowParam);
    } else {
      const d = new Date();
      nowMins = d.getHours() * 60 + d.getMinutes();
    }
    const tasks = db.query("SELECT * FROM tasks WHERE user_id = ? AND archived = 0 ORDER BY created_at DESC").all(u.id) as any[];
    const tl = getTimelineStatus(tasks, nowMins);
    return json({ ...tl, all_scheduled: tl.timed_tasks });
  }},

  // stats (with zero-filled activity)
  { method: "GET", path: /^\/api\/stats$/, handler: (req) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const totals = db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
        SUM(CASE WHEN archived=1 THEN 1 ELSE 0 END) AS archived
      FROM tasks WHERE user_id = ?
    `).get(u.id) as any;
    const focus = db.query("SELECT COALESCE(SUM(minutes),0) AS total_min FROM focus_sessions WHERE user_id = ?").get(u.id) as any;
    const recent = db.query(`
      SELECT day, count FROM activity
      WHERE user_id = ? AND day >= date('now', '-6 days')
      ORDER BY day
    `).all(u.id) as any[];
    let streak = 0;
    const today = new Date(); today.setUTCHours(0,0,0,0);
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setUTCDate(today.getUTCDate() - i);
      const key = d.toISOString().slice(0,10);
      const hit = recent.find(r => r.day === key);
      if (hit && hit.count > 0) streak++;
      else if (i > 0) break;
    }
    const xp = (totals.done || 0) * 10 + (focus.total_min || 0);
    return json({
      totals,
      focus_minutes: focus.total_min,
      streak_days: streak,
      xp,
      activity_7d: last7Days(recent),
    });
  }},

  { method: "POST", path: /^\/api\/stats\/focus$/, handler: async (req) => {
    const r = getOrCreateUser(req);
    if (!r) return err("unauthorized", 401);
    const u = r.user;
    const body = await req.json().catch(() => ({}));
    const m = parseInt(body.minutes ?? "0");
    if (!m || m < 0 || m > 600) return err("minutes must be 1-600", 400);
    db.query("INSERT INTO focus_sessions (user_id, minutes) VALUES (?, ?)").run(u.id, m);
    bumpActivity(u.id);
    publish({ userId: u.id, type: "focus", payload: { minutes: m } });
    return json({ logged: m });
  }},

  { method: "GET", path: /^\/api\/activity$/, handler: (req) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const rows = db.query(`
      SELECT day, count FROM activity
      WHERE user_id = ? AND day >= date('now', '-6 days')
      ORDER BY day
    `).all(u.id);
    return json({ activity: last7Days(rows) });
  }},

  // SSE stream of user's events
  { method: "GET", path: /^\/api\/events$/, handler: (req) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (e: Evt) => {
          if (e.userId !== u.id) return;
          const line = `event: ${e.type}\ndata: ${JSON.stringify(e.payload)}\n\n`;
          try { controller.enqueue(enc.encode(line)); } catch {}
        };
        // initial hello
        controller.enqueue(enc.encode(`event: hello\ndata: {"user":"${u.username}","ts":${Date.now()}}\n\n`));
        // 15s keep-alive comment
        const ka = setInterval(() => {
          try { controller.enqueue(enc.encode(`: keep-alive ${Date.now()}\n\n`)); } catch { clearInterval(ka); }
        }, 15000);
        subs.add(send);
        // cleanup on close
        const close = () => { clearInterval(ka); subs.delete(send); try { controller.close(); } catch {} };
        // Bun will call cancel() when client disconnects
        (controller as any)._close = close;
      },
      cancel() { (this as any)._close?.(); },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
        "x-accel-buffering": "no",
      },
    });
  }},
];

function createServer() {
  return Bun.serve({
    port: PORT,
    hostname: "0.0.0.0",
    idleTimeout: 60,        // 60s before idle TCP connection is closed
    maxRequestBodySize: 10 * 1024 * 1024,  // 10 MB cap on POST bodies
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
            "access-control-allow-headers": "authorization, content-type, x-btask-user",
            "access-control-max-age": "86400",
          },
        });
      }

      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.path);
        if (m) return r.handler(req, m);
      }

      if (req.method === "GET") {
        let p = url.pathname === "/" ? "/index.html" : url.pathname;
        // public board at /u/<username>
        const uMatch = url.pathname.match(/^\/u\/([a-z0-9_-]+)\/?$/);
        if (uMatch) {
          const publicPath = join(STATIC_DIR, "public.html");
          if (existsSync(publicPath)) {
            return new Response(Bun.file(publicPath), { headers: { "content-type": "text/html", "cache-control": "no-cache" } });
          }
        }
        const full = join(STATIC_DIR, p);
        if (existsSync(full)) {
          const file = Bun.file(full);
          // static = cache 5m; HTML = no-cache so updates roll out fast
          const isHtml = p.endsWith(".html");
          return new Response(file, {
            headers: {
              "content-type": isHtml ? "text/html" : (file.type || "application/octet-stream"),
              "cache-control": isHtml ? "no-cache" : "public, max-age=300",
            },
          });
        }
        const idx = join(STATIC_DIR, "index.html");
        if (existsSync(idx)) return new Response(Bun.file(idx), { headers: { "content-type": "text/html", "cache-control": "no-cache" } });
      }

      return json({ error: "not found" }, 404);
    },
  });
}

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

console.log(`[btask-web] listening on http://0.0.0.0:${server.port}  db=${DB_PATH}  v1.1.0`);