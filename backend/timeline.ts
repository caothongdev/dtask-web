// Pure time/schedule helpers — no DB or IO, trivially unit-testable.

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

// Last-7-days with zero-filled gaps (oldest first)
export function last7Days(rows: { day: string; count: number }[]) {
  const map = new Map(rows.map(r => [r.day, r.count]));
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const out: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setUTCDate(today.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: map.get(key) ?? 0 });
  }
  return out;
}
