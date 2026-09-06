import { test, expect, afterAll } from "bun:test";
import { parseAtTime, getTimelineStatus, server, db } from "../server";

afterAll(() => {
  server?.stop(true);
});

test("parseAtTime converts HH:MM to minutes since midnight", () => {
  expect(parseAtTime("00:00")).toBe(0);
  expect(parseAtTime("09:30")).toBe(570);
  expect(parseAtTime("23:59")).toBe(1439);
  expect(parseAtTime("invalid")).toBeNull();
  expect(parseAtTime(null)).toBeNull();
});

test("getTimelineStatus determines active and upcoming task slots", () => {
  const tasks = [
    { id: 1, title: "Morning Standup", at: "09:00", mins: 30, status: "open" },
    { id: 2, title: "Deep Work", at: "14:00", mins: 90, status: "open" }
  ];

  // At 09:15, task 1 is active (end is 09:30)
  const at915 = getTimelineStatus(tasks, 9 * 60 + 15);
  expect(at915.active_task?.id).toBe(1);
  expect(at915.next_task?.id).toBe(2);

  // At 10:00, no active task, next task is task 2
  const at1000 = getTimelineStatus(tasks, 10 * 60);
  expect(at1000.active_task).toBeNull();
  expect(at1000.next_task?.id).toBe(2);
});

test("Task modes full API workflow: time, book, done, undone, timer, book page", async () => {
  const base = `http://localhost:${server.port}/api`;
  const username = "modetester_" + Date.now();

  // Register
  const regRes = await fetch(`${base}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const { user } = await regRes.json();
  const auth = { Authorization: `Bearer ${user.api_key}` };

  // 1. Create time task
  const tRes = await fetch(`${base}/tasks`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ category: "learn", title: "Study Rust", mins: 45, at: "11:00", xp: 15, coins: 15 }),
  });
  const { task } = await tRes.json();
  expect(task.mins).toBe(45);
  expect(task.at).toBe("11:00");

  // 2. Start timer
  const timerStart = await fetch(`${base}/tasks/${task.id}/timer`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start" }),
  });
  expect(timerStart.status).toBe(200);

  // 3. Pause timer with time_spent
  const timerPause = await fetch(`${base}/tasks/${task.id}/timer`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pause", time_spent: 120 }),
  });
  const pauseJson = await timerPause.json();
  expect(pauseJson.task.time_spent).toBe(120);

  // 4. Mark done
  const doneRes = await fetch(`${base}/tasks/${task.id}/done`, { method: "POST", headers: auth });
  const doneJson = await doneRes.json();
  expect(doneJson.task.status).toBe("done");
  expect(doneJson.task.time_spent).toBe(45 * 60);

  // Check coins and XP accrued
  const meRes = await fetch(`${base}/me`, { headers: auth });
  const me = await meRes.json();
  expect(me.user.coins).toBeGreaterThanOrEqual(15);

  // 5. Undone task
  const undoneRes = await fetch(`${base}/tasks/${task.id}/undone`, { method: "POST", headers: auth });
  const undoneJson = await undoneRes.json();
  expect(undoneJson.task.status).toBe("open");
  expect(undoneJson.task.time_spent).toBe(120);

  // 6. Create book task
  const bRes = await fetch(`${base}/tasks`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ category: "read", title: "Pragmatic Programmer", book_title: "Pragmatic Programmer", page: 10, pages: 50 }),
  });
  const { task: bookTask } = await bRes.json();
  expect(bookTask.page).toBe(10);
  expect(bookTask.pages).toBe(50);

  // Advance book page to 50 -> should auto complete
  const bookProg = await fetch(`${base}/tasks/${bookTask.id}/book`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ page: 50 }),
  });
  const bookJson = await bookProg.json();
  expect(bookJson.task.page).toBe(50);
  expect(bookJson.task.status).toBe("done");

  // 7. Test timeline endpoint
  const tlRes = await fetch(`${base}/timeline`, { headers: auth });
  const tlJson = await tlRes.json();
  expect(Array.isArray(tlJson.timed_tasks)).toBe(true);

  // 8. Test timer banking (+1 coin / 2 mins focus session)
  const bankTaskRes = await fetch(`${base}/tasks`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ category: "code", title: "Refactor core", mins: 60 }),
  });
  const { task: bankTask } = await bankTaskRes.json();

  const prevCoins = (await (await fetch(`${base}/me`, { headers: auth })).json()).user.coins;
  const timerBank = await fetch(`${base}/tasks/${bankTask.id}/timer`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "bank", time_spent: 1200 }), // 20 minutes
  });
  expect(timerBank.status).toBe(200);
  const bankJson = await timerBank.json();
  expect(bankJson.task.time_spent).toBe(1200);

  const afterBankMe = await (await fetch(`${base}/me`, { headers: auth })).json();
  // 20 mins / 2 = 10 coins earned
  expect(afterBankMe.user.coins).toBe(prevCoins + 10);

  // 9. Test PATCH /tasks/:id mode fields and validation
  const patchRes = await fetch(`${base}/tasks/${bankTask.id}`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ at: "15:30", mins: 50, category: "build" }),
  });
  expect(patchRes.status).toBe(200);
  const patchJson = await patchRes.json();
  expect(patchJson.task.at).toBe("15:30");
  expect(patchJson.task.mins).toBe(50);
  expect(patchJson.task.category).toBe("build");

  // Invalid 'at' regex rejected
  const badAt = await fetch(`${base}/tasks/${bankTask.id}`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ at: "25:99" }),
  });
  expect(badAt.status).toBe(400);
});
