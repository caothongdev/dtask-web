// XP / level / coin economy.
import { Database } from "bun:sqlite";
import { db } from "./db";
import { bumpActivity, publish } from "./sse";

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

export function getUserStreak(userId: number): number {
  const recent = db.query(`
    SELECT day, count FROM activity
    WHERE user_id = ? AND day >= date('now', '-30 days')
    ORDER BY day
  `).all(userId) as any[];
  let streak = 0;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setUTCDate(today.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hit = recent.find(r => r.day === key);
    if (hit && hit.count > 0) streak++;
    else if (i > 0) break;
  }
  return streak;
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
