import { test, expect, afterAll } from "bun:test";
import { server } from "../server";

afterAll(() => {
  server?.stop(true);
});

test("Full user lifecycle: register -> create tasks (time, book, slot) -> complete -> level up -> shop purchase -> timeline -> public profile", async () => {
  const base = `http://localhost:${server.port}/api`;
  const username = "grandmaster_" + Date.now();

  // 1. Register user
  const regRes = await fetch(`${base}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  expect(regRes.status).toBe(201);
  const { user } = await regRes.json();
  const auth = { Authorization: `Bearer ${user.api_key}` };

  // 2. Add tasks with different modes
  const timeTaskRes = await fetch(`${base}/tasks`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ category: "code", title: "Build Compiler", mins: 60, at: "14:00", xp: 50, coins: 50 }),
  });
  expect(timeTaskRes.status).toBe(201);
  const { task: timeTask } = await timeTaskRes.json();
  expect(timeTask.mins).toBe(60);
  expect(timeTask.at).toBe("14:00");

  const bookTaskRes = await fetch(`${base}/tasks`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ category: "read", title: "The Pragmatic Programmer", book_title: "The Pragmatic Programmer", page: 1, pages: 100 }),
  });
  expect(bookTaskRes.status).toBe(201);
  const { task: bookTask } = await bookTaskRes.json();
  expect(bookTask.category).toBe("read");

  // 3. Log a focus session -> awards minutes and coins
  const focusRes = await fetch(`${base}/stats/focus`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ minutes: 60 }),
  });
  expect(focusRes.status).toBe(200);

  // 4. Complete time task -> awards XP & coins, triggering Level Up (+50 bonus coins)
  const doneRes = await fetch(`${base}/tasks/${timeTask.id}/done`, {
    method: "POST",
    headers: auth,
  });
  expect(doneRes.status).toBe(200);

  // 5. Verify user level up and coin wallet
  const meRes = await fetch(`${base}/me`, { headers: auth });
  const me = await meRes.json();
  // 60 focus XP + 50 task XP = 110 XP -> Level 2 (>100 needed)
  expect(me.level_info.level).toBeGreaterThanOrEqual(2);
  // Coins: 50 (task) + 30 (focus: 60m / 2) + 50 (level up bonus) = 130 coins
  expect(me.user.coins).toBeGreaterThanOrEqual(130);

  // 6. Buy a shop reward with coins
  const rewardsRes = await fetch(`${base}/rewards`, { headers: auth });
  const { rewards } = await rewardsRes.json();
  const affordableReward = rewards.find((r: any) => r.cost <= me.user.coins && r.type === "timed");
  expect(affordableReward).toBeTruthy();

  const buyRes = await fetch(`${base}/rewards/${affordableReward.id}/buy`, {
    method: "POST",
    headers: auth,
  });
  expect(buyRes.status).toBe(200);
  const buyData = await buyRes.json();
  expect(buyData.ok).toBe(true);
  expect(buyData.coins_left).toBe(me.user.coins - affordableReward.cost);

  // 7. Verify timeline endpoint returns scheduled slot
  const tlRes = await fetch(`${base}/timeline?now=14:15`, { headers: auth });
  const tlData = await tlRes.json();
  expect(Array.isArray(tlData.timed_tasks)).toBe(true);

  // 8. Verify public profile board
  // Set is_public = true
  await fetch(`${base}/me`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ is_public: true }),
  });

  // Verify public profile API endpoint
  const pubApiRes = await fetch(`${base}/u/${username}`);
  expect(pubApiRes.status).toBe(200);
  const pubApiData = await pubApiRes.json();
  expect(pubApiData.user.username).toBe(username);
  expect(pubApiData.tasks.length).toBeGreaterThanOrEqual(2);
  expect(pubApiData.focus_minutes).toBeGreaterThanOrEqual(60);
  expect(Array.isArray(pubApiData.activity_7d)).toBe(true);

  // Verify rendered public HTML page
  const pubRes = await fetch(`http://localhost:${server.port}/u/${username}`);
  expect(pubRes.status).toBe(200);
  const pubHtml = await pubRes.text();
  expect(pubHtml).toContain("dtask");
  expect(pubHtml).toContain("Space Mono");
  expect(pubHtml).toContain("+-.[ dtask ].-+");
  expect(pubHtml).toContain("[SYS: DAEMON ACTIVE]");
  expect(pubHtml).toContain("[PUBLIC PROFILE]");
  expect(pubHtml).toContain("DIRECT JSON API");
  expect(pubHtml).toContain("#090a0c");
});

test("Global hotkey router handles navigation 1-5, quick add A, ? shortcuts modal, and input protection", async () => {
  const { handleGlobalKeydown, VIEW_HOTKEYS } = await import("../public/app.js");
  expect(VIEW_HOTKEYS["1"]).toBe("tasks");
  expect(VIEW_HOTKEYS["2"]).toBe("timeline");
  expect(VIEW_HOTKEYS["3"]).toBe("focus");
  expect(VIEW_HOTKEYS["4"]).toBe("shop");
  expect(VIEW_HOTKEYS["5"]).toBe("stats");

  // 1. Keys 1-5 navigate when no input is focused
  let navigatedTo = "";
  const mockOptions = {
    onNavigate: (view: string) => { navigatedTo = view; },
  };

  const event1 = { key: "1", target: { tagName: "BODY" }, preventDefault: () => {} };
  expect(handleGlobalKeydown(event1, mockOptions)).toBe(true);
  expect(navigatedTo).toBe("tasks");

  const event3 = { key: "3", target: { tagName: "DIV" }, preventDefault: () => {} };
  expect(handleGlobalKeydown(event3, mockOptions)).toBe(true);
  expect(navigatedTo).toBe("focus");

  // 2. Protected input fields ignore hotkeys
  navigatedTo = "";
  const inputEvent = { key: "1", target: { tagName: "INPUT" }, preventDefault: () => {} };
  expect(handleGlobalKeydown(inputEvent, mockOptions)).toBe(false);
  expect(navigatedTo).toBe("");

  const textareaEvent = { key: "2", target: { tagName: "TEXTAREA" }, preventDefault: () => {} };
  expect(handleGlobalKeydown(textareaEvent, mockOptions)).toBe(false);
  expect(navigatedTo).toBe("");

  const selectEvent = { key: "4", target: { tagName: "SELECT" }, preventDefault: () => {} };
  expect(handleGlobalKeydown(selectEvent, mockOptions)).toBe(false);
  expect(navigatedTo).toBe("");

  // 3. Escape blurs input
  let blurred = false;
  const escEvent = {
    key: "Escape",
    target: { tagName: "INPUT", blur: () => { blurred = true; } },
    preventDefault: () => {},
  };
  expect(handleGlobalKeydown(escEvent, mockOptions)).toBe(true);
  expect(blurred).toBe(true);
});

test("Index.html includes shortcuts cheat sheet dialog and hotkeys initialization", async () => {
  const res = await fetch(`http://localhost:${server.port}/index.html`);
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('id="shortcuts-dialog"');
  expect(html).toContain('id="hud-shortcuts-btn"');
  expect(html).toContain("initGlobalHotkeys");
});

