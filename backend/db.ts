// SQLite storage: connection, schema, migrations, and hot-path prepared
// statements. Importing this module creates/opens the database and runs
// migrations — same behavior the original single-file server had.
import { Database } from "bun:sqlite";
import { DB_PATH } from "./config";
import { hashApiKey } from "./keys";

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
    // lifecycle columns a pre-archiving legacy DB may be missing
    ["archived", "INTEGER DEFAULT 0"],
    ["created_at", "TEXT"],
    ["updated_at", "TEXT"],
    ["completed_at", "TEXT"],
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

  // 6. API keys at rest are SHA-256 digests; the raw key is shown exactly once
  //    at creation. Idempotent: only values that are not already 64-hex
  //    digests (i.e. legacy plaintext 48-hex keys) are hashed in place.
  const keyRows = database.query("SELECT id, api_key FROM users").all() as any[];
  const updKey = database.prepare("UPDATE users SET api_key = ? WHERE id = ?");
  for (const row of keyRows) {
    if (typeof row.api_key === "string" && row.api_key.length !== 64 && row.api_key.length > 0) {
      updKey.run(hashApiKey(row.api_key), row.id);
    }
  }

  // 7. Hot-path indexes (idempotent; skipped when a legacy shape lacks the
  //    prerequisites — they get created once the DB has the needed shape).
  const hasTable = (name: string) =>
    !!database.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  const hasCol = (table: string, col: string) =>
    database.query(`PRAGMA table_info(${table})`).all().some((c: any) => c.name === col);

  if (hasTable("tasks") && hasCol("tasks", "archived") && hasCol("tasks", "created_at")) {
    database.exec("CREATE INDEX IF NOT EXISTS idx_tasks_user_archived_created ON tasks(user_id, archived, created_at DESC);");
  }
  if (hasTable("transactions")) {
    database.exec("CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, id DESC);");
  }
  if (hasTable("focus_sessions")) {
    database.exec("CREATE INDEX IF NOT EXISTS idx_focus_user ON focus_sessions(user_id);");
  }
}

runMigrations(db);

// ── Prepared statements (hot path cache) ────────────────────────────
// .query() compiles each call; .prepare() caches the bytecode.
// Significant for high-RQ endpoints (SSE-pushed reloads).
export const Q = {
  getUserByKey: db.prepare("SELECT id, username, is_public, coins, lifetime_earned, lifetime_spent, created_at FROM users WHERE api_key = ?"),
  // NOTE: deliberately excludes api_key — stored keys are hashes and must
  // never ride along on user objects.
  getUserByName: db.prepare("SELECT id, username, is_public, coins, lifetime_earned, lifetime_spent, created_at FROM users WHERE username = ?"),
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
