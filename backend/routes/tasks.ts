import { db, ALLOWED_CATEGORIES } from "../db";
import { getUser, getOrCreateUser } from "../auth";
import { json, err } from "../http";
import { completeTask } from "../gamification";
import { bumpActivity, publish } from "../sse";
import type { Route } from "./types";

const TASK_STATUSES = ["open", "done", "review", "dev", "idle", "run"];

export const taskRoutes: Route[] = [
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
    if (!r) return err("unauthorized (provide Authorization: Bearer *** OR X-Dtask-User: <username>)", 401);
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
      if (!TASK_STATUSES.includes(body.status))
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
];
