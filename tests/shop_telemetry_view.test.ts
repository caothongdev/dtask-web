import { test, expect, afterAll } from "bun:test";
import { server } from "../server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { store } from "../public/js/store.js";
import { api } from "../public/js/api.js";
import {
  renderShopView,
  cleanupShopView,
  buyReward,
  formatCoins,
  renderAsciiBar as renderShopAsciiBar,
  formatLedgerTime,
} from "../public/js/views/shop.js";
import {
  renderTelemetryView,
  cleanupTelemetryView,
  getTierIndexForLevel,
  calculateCategoryBreakdown,
  calculateVelocityStats,
  renderHistogram,
  renderAsciiBar as renderTelemetryAsciiBar,
  RPG_TIERS,
} from "../public/js/views/telemetry.js";

afterAll(() => {
  server?.stop(true);
});

test("Shop and Telemetry view modules exist and export required renderers", () => {
  const shopPath = join(import.meta.dir, "..", "public/js/views/shop.js");
  const telemetryPath = join(import.meta.dir, "..", "public/js/views/telemetry.js");

  expect(existsSync(shopPath)).toBe(true);
  expect(existsSync(telemetryPath)).toBe(true);

  const shopContent = readFileSync(shopPath, "utf8");
  expect(shopContent).toContain("renderShopView");
  expect(shopContent).toContain("buyReward");

  const telemetryContent = readFileSync(telemetryPath, "utf8");
  expect(telemetryContent).toContain("renderTelemetryView");
  expect(telemetryContent).toContain("histogram");
});

test("Shop and Telemetry view files serve with 200 via HTTP", async () => {
  const res1 = await fetch(`http://localhost:${server.port}/js/views/shop.js`);
  expect(res1.status).toBe(200);
  expect(res1.headers.get("content-type")).toContain("javascript");

  const res2 = await fetch(`http://localhost:${server.port}/js/views/telemetry.js`);
  expect(res2.status).toBe(200);
  expect(res2.headers.get("content-type")).toContain("javascript");
});

test("index.html routes to shop and stats views", async () => {
  const res = await fetch(`http://localhost:${server.port}/index.html`);
  const html = await res.text();
  expect(html).toContain("shop.js");
  expect(html).toContain("telemetry.js");
  expect(html).toContain("data-view=\"shop\"");
  expect(html).toContain("data-view=\"stats\"");
});

test("Shop helper functions format coins, dates, and ASCII bars correctly", () => {
  expect(formatCoins(100)).toBe("100 COINS");
  expect(formatCoins(0)).toBe("0 COINS");
  expect(formatCoins(2500)).toBe("2,500 COINS");

  expect(formatLedgerTime(null)).toBe("--:--");
  expect(formatLedgerTime("")).toBe("--:--");
  const formatted = formatLedgerTime("2026-09-06T12:30:00Z");
  expect(formatted).toContain("2026-09-06");

  // Shop ASCII bar
  expect(renderShopAsciiBar(0, 16)).toBe("░".repeat(16));
  expect(renderShopAsciiBar(100, 16)).toBe("█".repeat(16));
  expect(renderShopAsciiBar(50, 16)).toBe("█".repeat(8) + "░".repeat(8));
});

test("Telemetry helper functions calculate progression and velocity accurately", () => {
  // 1. Tier indexes
  expect(getTierIndexForLevel(1)).toBe(0); // Apprentice
  expect(getTierIndexForLevel(9)).toBe(0); // Apprentice
  expect(getTierIndexForLevel(10)).toBe(1); // Practitioner
  expect(getTierIndexForLevel(19)).toBe(1); // Practitioner
  expect(getTierIndexForLevel(20)).toBe(2); // Adept
  expect(getTierIndexForLevel(39)).toBe(2); // Adept
  expect(getTierIndexForLevel(40)).toBe(3); // Champion
  expect(getTierIndexForLevel(49)).toBe(3); // Champion
  expect(getTierIndexForLevel(50)).toBe(4); // Grandmaster
  expect(getTierIndexForLevel(99)).toBe(4); // Grandmaster

  // 2. Category breakdown
  const sampleTasks = [
    { id: 1, category: "code", status: "done", mins: 30 },
    { id: 2, category: "code", status: "open", mins: 25 },
    { id: 3, category: "learn", status: "done", mins: 45 },
    { id: 4, category: "health", status: "open", mins: 15 },
  ];
  const breakdown = calculateCategoryBreakdown(sampleTasks, ["code", "learn", "health", "read", "build"]);
  const codeCat = breakdown.find((b) => b.category === "code");
  expect(codeCat?.total).toBe(2);
  expect(codeCat?.done).toBe(1);
  expect(codeCat?.pct).toBe(50);
  expect(codeCat?.completedMins).toBe(30);

  const readCat = breakdown.find((b) => b.category === "read");
  expect(readCat?.total).toBe(0);
  expect(readCat?.done).toBe(0);
  expect(readCat?.pct).toBe(0);

  // 3. 7-Day Velocity calculation
  const sample7d = [
    { day: "2026-08-31", count: 2 },
    { day: "2026-09-01", count: 4 },
    { day: "2026-09-02", count: 0 },
    { day: "2026-09-03", count: 6 },
    { day: "2026-09-04", count: 1 },
    { day: "2026-09-05", count: 3 },
    { day: "2026-09-06", count: 5 },
  ];
  const velocity = calculateVelocityStats(sample7d);
  expect(velocity.maxDaily).toBe(6);
  expect(velocity.totalCount).toBe(21);
  expect(velocity.totalXp).toBe(210);
  expect(velocity.avgCount).toBe(3);
  expect(velocity.avgXp).toBe(30);
  expect(velocity.days.length).toBe(7);

  // 4. Histogram rendering
  const histHtml = renderHistogram(sample7d, 6);
  expect(histHtml).toContain("data-histogram");
  expect(histHtml).toContain("XP CYCLE VELOCITY");
  expect(histHtml).toContain("+210 XP");
});

test("renderShopView displays wallet balance, item cards, locked/unlocked state, and ledger", () => {
  store.state.user = {
    id: 10,
    username: "cyber_ninja",
    coins: 25,
    lifetime_earned: 150,
    lifetime_spent: 125,
  };

  store.state.rewards = [
    { id: 1, name: "Espresso Break", cost: 15, mins: 15, type: "timed", icon: "☕" },
    { id: 2, name: "Cheat Meal", cost: 50, mins: 0, type: "instant", icon: "🍕" },
  ];

  store.state.transactions = [
    { id: 1, type: "earn", amount: 20, reason: "Completed Rust task", created_at: "2026-09-06T10:00:00Z" },
    { id: 2, type: "spend", amount: 15, reason: "Bought Coffee Break", created_at: "2026-09-06T11:00:00Z" },
  ];

  const container = {
    innerHTML: "",
    querySelector: function(sel: string) {
      if (sel === "#shop-add-reward-btn") return { onclick: null };
      if (sel === "#shop-refresh-ledger-btn") return { onclick: null };
      if (sel === "#custom-reward-dialog") return { showModal: () => {}, close: () => {} };
      return null;
    },
    querySelectorAll: function(sel: string) {
      return [];
    },
  };

  renderShopView(container as any);

  // Economy HUD verification
  expect(container.innerHTML).toContain("data-shop-view");
  expect(container.innerHTML).toContain("25");
  expect(container.innerHTML).toContain("EARNED: +150");
  expect(container.innerHTML).toContain("SPENT: -125");

  // Rewards catalog verification
  expect(container.innerHTML).toContain("Espresso Break");
  expect(container.innerHTML).toContain("Cheat Meal");

  // Item 1 (cost 15 <= 25) should have BUY REWARD button
  expect(container.innerHTML).toContain("Redeem Reward");
  // Item 2 (cost 50 > 25) should have LOCKED state with Need 25 more
  expect(container.innerHTML).toContain("Need 25 more coins");

  // Ledger verification
  expect(container.innerHTML).toContain("Completed Rust task");
  expect(container.innerHTML).toContain("Bought Coffee Break");
  expect(container.innerHTML).toContain("+20");
  expect(container.innerHTML).toContain("-15");

  cleanupShopView();
});

test("renderTelemetryView displays RPG tier progression, experience buffer, histogram, and quotas", () => {
  store.state.user = {
    id: 10,
    username: "cyber_ninja",
    coins: 45,
    lifetime_earned: 200,
    lifetime_spent: 155,
  };

  store.state.levelInfo = {
    level: 3,
    rank: "Apprentice",
    prog_xp: 35,
    needed_xp: 70,
    pct: 50,
    total_xp: 185,
  };

  store.state.stats = {
    totals: { total: 10, done: 6, archived: 1 },
    focus_minutes: 125,
    streak_days: 4,
    xp: 185,
    activity_7d: [
      { day: "2026-08-31", count: 1 },
      { day: "2026-09-01", count: 2 },
      { day: "2026-09-02", count: 0 },
      { day: "2026-09-03", count: 3 },
      { day: "2026-09-04", count: 2 },
      { day: "2026-09-05", count: 4 },
      { day: "2026-09-06", count: 1 },
    ],
  };

  store.state.tasks = [
    { id: 1, title: "Kernel patch", category: "code", status: "done", mins: 45 },
    { id: 2, title: "Algorithms review", category: "learn", status: "done", mins: 30 },
  ];

  const container = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  renderTelemetryView(container as any);

  expect(container.innerHTML).toContain("data-telemetry-view");
  expect(container.innerHTML).toContain("LEVEL 03");
  expect(container.innerHTML).toContain("APPRENTICE");
  expect(container.innerHTML).toContain("4d STREAK");
  expect(container.innerHTML).toContain("EXPERIENCE BUFFER");
  expect(container.innerHTML).toContain("35 / 70 XP");
  expect(container.innerHTML).toContain("50% TOWARD LEVEL 4");
  expect(container.innerHTML).toContain("7-DAY XP VELOCITY HISTOGRAM");
  expect(container.innerHTML).toContain("CATEGORY COMPLETION METERS");
  expect(container.innerHTML).toContain("WALLET & DISCIPLINE AUDIT");
  expect(container.innerHTML).toContain("45");

  cleanupTelemetryView();
});

test("buyReward handles timed reward by starting relax timer and navigating to focus view", async () => {
  const testUser = "shop_test_" + Date.now();
  const regRes = await fetch(`http://localhost:${server.port}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: testUser }),
  });
  const regData = await regRes.json();
  const token = regData.user?.api_key;
  api.baseUrl = `http://localhost:${server.port}`;
  api.setToken(token, testUser);

  // Give user coins by completing a task
  const createRes = await fetch(`http://localhost:${server.port}/api/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ title: "Task for coins", category: "code", mins: 60 }),
  });
  const { task } = await createRes.json();

  // Complete task to earn coins
  await fetch(`http://localhost:${server.port}/api/tasks/${task.id}/done`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
  });

  // Fetch me to get updated coins
  const meData = await api.getMe();
  store.state.user = { ...meData.user };
  const initialCoins = meData.user.coins;
  expect(initialCoins).toBeGreaterThanOrEqual(10);

  // Create a cheap custom timed reward for testing
  const rRes = await api.createReward({
    name: "5m Test Break",
    cost: 5,
    mins: 5,
    type: "timed",
    icon: "☕",
  });
  const newReward = rRes.reward;
  store.state.rewards = [newReward];

  // Set up mock window.location
  (globalThis as any).window = {
    location: { hash: "shop" },
  };

  store.state.relaxTimer = null;

  // Execute buyReward
  const buyRes = await buyReward(newReward.id);
  expect(buyRes.ok).toBe(true);
  expect(buyRes.coins_left).toBe(initialCoins - 5);

  // Relax timer must have started
  expect(store.state.relaxTimer).not.toBeNull();
  expect(store.state.relaxTimer?.name).toBe("5m Test Break");
  expect(store.state.relaxTimer?.totalSeconds).toBe(5 * 60);
  expect(store.state.relaxTimer?.running).toBe(true);

  // Window hash should have redirected to focus
  expect((globalThis as any).window.location.hash).toBe("focus");

  store.state.relaxTimer = null;
});
