import { db } from "../db";
import { getUser, getOrCreateUser } from "../auth";
import { json, err } from "../http";
import { getLevelInfo, getUserStreak } from "../gamification";
import { last7Days } from "../timeline";
import type { Route } from "./types";

export const userRoutes: Route[] = [
  { method: "GET", path: /^\/api\/health$/, handler: () => json({ ok: true, status: "ok", service: "dtask-web", version: "1.1.0", uptime_s: Math.floor(process.uptime()) }) },

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
    const recent = db.query("SELECT day, count FROM activity WHERE user_id = ? AND day >= date('now', '-6 days')").all(u.id) as { day: string; count: number }[];
    const streak = getUserStreak(u.id);
    const totalXp = (db.query(`
      SELECT
        (SELECT COALESCE(SUM(COALESCE(xp, 10)), 0) FROM tasks WHERE user_id = ? AND status = 'done' AND archived = 0) +
        (SELECT COALESCE(SUM(minutes), 0) FROM focus_sessions WHERE user_id = ?) AS total_xp
    `).get(u.id, u.id) as any)?.total_xp || 0;
    const level_info = getLevelInfo(totalXp);
    return json({
      user: { username: u.username, is_public: !!u.is_public, created_at: u.created_at },
      totals,
      tasks,
      focus_minutes: focus.m,
      streak_days: streak,
      level_info,
      activity_7d: last7Days(recent),
    });
  }},
];
