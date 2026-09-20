// In-process pub/sub backing the SSE event stream. One server process, so
// an in-memory subscriber set is all we need.
import { db } from "./db";

export type Evt = { userId: number; type: string; payload: any };

export const subs = new Set<(e: Evt) => void>();

export function publish(e: Evt) {
  for (const fn of subs) try { fn(e); } catch {}
}

export function bumpActivity(userId: number) {
  const today = new Date().toISOString().slice(0, 10);
  db.query("INSERT INTO activity (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1").run(userId, today);
  publish({ userId, type: "activity", payload: { day: today } });
}
