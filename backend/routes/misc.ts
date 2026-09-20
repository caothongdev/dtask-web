import { db } from "../db";
import { getUser, getOrCreateUser } from "../auth";
import { json, err, corsHeaders, securityHeaders } from "../http";
import { addXpAndCoins, getUserStreak } from "../gamification";
import { getTimelineStatus, last7Days } from "../timeline";
import { subs, bumpActivity, publish, type Evt } from "../sse";
import type { Route } from "./types";

export const miscRoutes: Route[] = [
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
    `).all(u.id) as { day: string; count: number }[];
    const streak = getUserStreak(u.id);
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
    const earnedCoins = Math.floor(m / 2);
    addXpAndCoins(db, u.id, m, earnedCoins, `Focus session: ${m} mins`);
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
    `).all(u.id) as { day: string; count: number }[];
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
        ...securityHeaders,
        ...corsHeaders(),
        "x-accel-buffering": "no",
      },
    });
  }},
];
