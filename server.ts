// btask-web — minimalist task dashboard + JSON API for CLI users
// Single Bun process: serves static HTML/CSS/JS + JSON API.
// Storage: SQLite at BTASK_DB env var (default /opt/data/btask-web/db.sqlite).
// Port: BTASK_PORT env var (default 8787).

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PORT = parseInt(process.env.BTASK_PORT || "8787");
const DB_PATH = process.env.BTASK_DB || join(import.meta.dir, "db.sqlite");
const STATIC_DIR = join(import.meta.dir, "public");

// ── DB ──────────────────────────────────────────────────────────────
const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('code','read','health','personal','work','maintenance')),
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

// ── Helpers ─────────────────────────────────────────────────────────
function genKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
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
  return db.query("SELECT id, username FROM users WHERE api_key = ?").get(apiKey) as { id: number; username: string } | null;
}

function getOrCreateUser(req: Request, bodyUsername?: string): { user: any; created: boolean } | null {
  let user = getUser(req);
  if (user) return { user, created: false };
  // Auto-register via X-Btask-User header (GitHub-style for CLI)
  const username = (req.headers.get("x-btask-user") || bodyUsername || "").trim().toLowerCase();
  if (!username || !/^[a-z0-9_-]{2,32}$/.test(username)) return null;
  const existing = db.query("SELECT id, username, api_key FROM users WHERE username = ?").get(username) as any;
  if (existing) return { user: existing, created: false };
  const api_key = genKey();
  const info = db.query("INSERT INTO users (username, api_key) VALUES (?, ?)").run(username, api_key);
  return { user: { id: info.lastInsertRowid, username, api_key }, created: true };
}

function bumpActivity(userId: number) {
  const today = new Date().toISOString().slice(0, 10);
  db.query("INSERT INTO activity (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1").run(userId, today);
}

// ── Routes ──────────────────────────────────────────────────────────
const routes: { method: string; path: RegExp; handler: (req: Request, params: any) => Promise<Response> | Response }[] = [
  // health
  { method: "GET", path: /^\/api\/health$/, handler: () => json({ ok: true, service: "btask-web", version: "1.0.0" }) },

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
    return json({ user: u });
  }},

  // tasks CRUD
  { method: "GET", path: /^\/api\/tasks$/, handler: (req) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");
    const includeArchived = url.searchParams.get("archived") === "1";
    let q = "SELECT * FROM tasks WHERE user_id = ?";
    const args: any[] = [u.id];
    if (!includeArchived) q += " AND archived = 0";
    if (category) { q += " AND category = ?"; args.push(category); }
    if (status) { q += " AND status = ?"; args.push(status); }
    q += " ORDER BY created_at DESC";
    return json({ tasks: db.query(q).all(...args) });
  }},

  { method: "POST", path: /^\/api\/tasks$/, handler: async (req) => {
    const r = getOrCreateUser(req);
    if (!r) return err("unauthorized (provide Authorization: Bearer <key> OR X-Btask-User: <username>)", 401);
    const u = r.user;
    const body = await req.json().catch(() => ({}));
    const { category, title, progress, status, time_estimate } = body;
    if (!category || !["code","read","health","personal","work","maintenance"].includes(category))
      return err("category must be: code|read|health|personal|work|maintenance", 400);
    if (!title || typeof title !== "string" || title.length > 200) return err("title required (max 200)", 400);
    const prog = Math.max(0, Math.min(100, parseInt(progress ?? "0")));
    const st = status || "open";
    const info = db.query(
      "INSERT INTO tasks (user_id, category, title, progress, status, time_estimate) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(u.id, category, title, prog, st, time_estimate || null);
    bumpActivity(u.id);
    const task = db.query("SELECT * FROM tasks WHERE id = ?").get(info.lastInsertRowid);
    return json({ task, api_key: r.created ? u.api_key : undefined }, 201);
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
      if (!["code","read","health","personal","work","maintenance"].includes(body.category))
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
    if (updates.length === 0) return json({ task }); // noop
    updates.push("updated_at = datetime('now')");
    args.push(id, u.id);
    db.query(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).run(...args);
    if (body.status === "done") bumpActivity(u.id);
    const updated = db.query("SELECT * FROM tasks WHERE id = ?").get(id);
    return json({ task: updated });
  }},

  { method: "DELETE", path: /^\/api\/tasks\/(\d+)$/, handler: (req, params) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const id = parseInt(params[1]);
    // Soft delete (archive) by default; ?hard=1 for permanent
    const url = new URL(req.url);
    const hard = url.searchParams.get("hard") === "1";
    if (hard) {
      const r = db.query("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, u.id);
      return r.changes > 0 ? json({ deleted: id }) : err("not found", 404);
    }
    const r = db.query("UPDATE tasks SET archived = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(id, u.id);
    return r.changes > 0 ? json({ archived: id }) : err("not found", 404);
  }},

  // quick actions
  { method: "POST", path: /^\/api\/tasks\/(\d+)\/done$/, handler: (req, params) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const id = parseInt(params[1]);
    const r = db.query("UPDATE tasks SET status='done', progress=100, completed_at=datetime('now'), updated_at=datetime('now') WHERE id = ? AND user_id = ?").run(id, u.id);
    if (r.changes === 0) return err("not found", 404);
    bumpActivity(u.id);
    return json({ task: db.query("SELECT * FROM tasks WHERE id = ?").get(id) });
  }},
  { method: "POST", path: /^\/api\/tasks\/(\d+)\/progress$/, handler: async (req, params) => {
    const u = getUser(req);
    if (!u) return err("unauthorized", 401);
    const id = parseInt(params[1]);
    const body = await req.json().catch(() => ({}));
    const p = Math.max(0, Math.min(100, parseInt(body.progress ?? "0")));
    const r = db.query("UPDATE tasks SET progress = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(p, id, u.id);
    if (r.changes === 0) return err("not found", 404);
    return json({ task: db.query("SELECT * FROM tasks WHERE id = ?").get(id) });
  }},

  // stats
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
    // streak = consecutive days with count > 0 ending today or yesterday
    const days = recent.map(r => r.day);
    let streak = 0;
    const today = new Date(); today.setUTCHours(0,0,0,0);
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setUTCDate(today.getUTCDate() - i);
      const key = d.toISOString().slice(0,10);
      const hit = recent.find(r => r.day === key);
      if (hit && hit.count > 0) streak++;
      else if (i > 0) break;
    }
    // XP: 10 per done task + 1 per focus minute
    const xp = (totals.done || 0) * 10 + (focus.total_min || 0);
    return json({
      totals,
      focus_minutes: focus.total_min,
      streak_days: streak,
      xp,
      activity_7d: recent,
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
    return json({ activity: rows });
  }},
];

// ── Server ──────────────────────────────────────────────────────────
const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);

    // CORS preflight
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

    // API routes
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.path);
      if (m) return r.handler(req, m);
    }

    // Static files (fallback to index.html)
    if (req.method === "GET") {
      let p = url.pathname === "/" ? "/index.html" : url.pathname;
      const full = join(STATIC_DIR, p);
      if (existsSync(full)) {
        const file = Bun.file(full);
        return new Response(file, { headers: { "cache-control": "public, max-age=300" } });
      }
      // SPA fallback
      const idx = join(STATIC_DIR, "index.html");
      if (existsSync(idx)) return new Response(Bun.file(idx), { headers: { "content-type": "text/html" } });
    }

    return json({ error: "not found" }, 404);
  },
});

console.log(`[btask-web] listening on http://0.0.0.0:${server.port}  db=${DB_PATH}`);