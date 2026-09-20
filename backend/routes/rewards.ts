import { db } from "../db";
import { getUser } from "../auth";
import { json, err } from "../http";
import { publish } from "../sse";
import type { Route } from "./types";

export const rewardRoutes: Route[] = [
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
];
