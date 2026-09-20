import { test, expect, afterAll } from "bun:test";
import { server } from "../server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { store } from "../public/js/store.js";
import {
  renderBtopAsciiBar,
  formatTime,
  calculateAccruals,
  renderFocusView,
  cleanupFocusView,
  handleFocusKeydown,
  setAutoBreakEnabled,
} from "../public/js/views/focus.js";

afterAll(() => {
  server?.stop(true);
});

test("Focus view module exists and exports required renderers", () => {
  const path = join(import.meta.dir, "..", "public/js/views/focus.js");
  expect(existsSync(path)).toBe(true);
  const content = readFileSync(path, "utf8");
  expect(content).toContain("renderFocusView");
  expect(content).toContain("cleanupFocusView");
  expect(content).toContain("FOCUS_DAEMON");
  expect(content).toContain("RELAX_DAEMON");
});

test("Focus view file serves with 200 via HTTP", async () => {
  const res = await fetch(`http://localhost:${server.port}/js/views/focus.js`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("javascript");
});

test("index.html routes to focus view", async () => {
  const res = await fetch(`http://localhost:${server.port}/index.html`);
  const html = await res.text();
  expect(html).toContain("focus.js");
  expect(html).toContain("data-view=\"focus\"");
  expect(html).toContain("renderFocusView");
  expect(html).toContain("cleanupFocusView");
});

test("renderBtopAsciiBar generates accurate btop segmented fill meters", () => {
  // 0% filled: all light shade
  const empty = renderBtopAsciiBar(0, 20);
  expect(empty).toBe("░".repeat(20));

  // 100% filled: all solid blocks
  const full = renderBtopAsciiBar(100, 20);
  expect(full).toBe("█".repeat(20));

  // 50% filled: 10 solid blocks, 10 light shade
  const half = renderBtopAsciiBar(50, 20);
  expect(half).toBe("█".repeat(10) + "░".repeat(10));

  // Clamping check (>100% or <0%)
  expect(renderBtopAsciiBar(150, 20)).toBe("█".repeat(20));
  expect(renderBtopAsciiBar(-20, 20)).toBe("░".repeat(20));
});

test("formatTime formats seconds to MM:SS and HH:MM:SS accurately", () => {
  expect(formatTime(0)).toBe("00:00");
  expect(formatTime(65)).toBe("01:05");
  expect(formatTime(1500)).toBe("25:00"); // 25 minutes
  expect(formatTime(3600)).toBe("60:00");
  expect(formatTime(3665)).toBe("61:05");
});

test("calculateAccruals computes live XP and coin accruals correctly", () => {
  const task = {
    id: 1,
    title: "Rust compiler optimization",
    category: "code",
    mins: 60,
    xp: 60,
    coins: 30,
  };

  // At 0 seconds
  const startAccrual = calculateAccruals(0, 3600, task);
  expect(startAccrual.accruedXp).toBe(0);
  expect(startAccrual.accruedCoins).toBe(0);
  expect(startAccrual.pct).toBe(0);
  expect(startAccrual.xpRatePerMin).toBeCloseTo(1.0, 2);
  expect(startAccrual.coinRatePerMin).toBeCloseTo(0.5, 2);

  // At 30 minutes (1800s out of 3600s)
  const midAccrual = calculateAccruals(1800, 3600, task);
  expect(midAccrual.accruedXp).toBe(30);
  expect(midAccrual.accruedCoins).toBe(15);
  expect(midAccrual.pct).toBe(50);

  // At target completion (3600s)
  const fullAccrual = calculateAccruals(3600, 3600, task);
  expect(fullAccrual.accruedXp).toBe(60);
  expect(fullAccrual.accruedCoins).toBe(30);
  expect(fullAccrual.pct).toBe(100);

  // Beyond target (overtime) - does not clamp XP/coins, keeps accruing
  const overAccrual = calculateAccruals(4500, 3600, task);
  expect(overAccrual.accruedXp).toBeGreaterThanOrEqual(60);
  expect(overAccrual.pct).toBe(125);
});

test("Focus view module contains full HUD elements, dual modes, hotkeys, and quick dispatcher", () => {
  const path = join(import.meta.dir, "..", "public/js/views/focus.js");
  const content = readFileSync(path, "utf8");

  // Focus mode components
  expect(content).toContain("Focus Mode");
  expect(content).toContain("Active Flow");
  expect(content).toContain("Focus Progress");
  expect(content).toContain("XP_REWARD_PIPELINE");
  expect(content).toContain("COIN_LEDGER_ACTIVE");
  expect(content).toContain("EXECUTION_BUS_CONTROLS");
  expect(content).toContain("Space");
  expect(content).toContain("Enter");
  expect(content).toContain("Ctrl+C / Esc");
  expect(content).toContain("Guilt-Free Break Ready");

  // Relax mode components
  expect(content).toContain("Relax Session");
  expect(content).toContain("WARM STONE AMBIENT");
  expect(content).toContain("Return to Work");

  // Quick Dispatcher / Standby mode (when no timer is active)
  expect(content).toContain("Focus Session · Standby");
  expect(content).toContain("Quick Dispatcher");
  expect(content).toContain("25m");
  expect(content).toContain("45m");
  expect(content).toContain("60m");

  // Keyboard hotkeys
  expect(content).toContain("keydown");
  expect(content).toContain("cleanupFocusView");
});

test("Standby mode re-renders task list on store update without short-circuiting", () => {
  const container = {
    innerHTML: "",
    querySelector: function(sel: string) {
      if (sel === "[data-focus-rendered]") {
        return this.innerHTML.includes("data-focus-rendered") ? {} : null;
      }
      return null;
    },
    querySelectorAll: () => [],
  };

  // Initial standby render with 0 tasks
  store.state.activeTimer = null;
  store.state.relaxTimer = null;
  store.state.tasks = [];
  renderFocusView(container as any);

  expect(container.innerHTML).toContain("No open tasks in queue");

  // Update store tasks and re-render in standby mode
  store.state.tasks = [
    { id: 101, title: "Kernel scheduler optimization", category: "code", mins: 45, status: "open" }
  ];
  renderFocusView(container as any);

  // Verifies standby mode was NOT short-circuited and re-rendered the updated task
  expect(container.innerHTML).toContain("Kernel scheduler optimization");
  expect(container.innerHTML).toContain("Launch Focus");

  cleanupFocusView();
});

test("Auto-break handover triggers relax timer when focus completes", () => {
  store.state.activeTimer = {
    task: { id: 99, title: "Deep build", category: "build", mins: 25 },
    running: true,
    elapsedSeconds: 1500,
    targetSeconds: 1500,
  };
  store.state.relaxTimer = null;

  const container = {
    innerHTML: "",
    querySelector: function(sel: string) {
      if (sel === "[data-focus-rendered]") {
        return this.innerHTML.includes("data-focus-rendered") ? {} : null;
      }
      return null;
    },
    querySelectorAll: () => [],
  };

  renderFocusView(container as any);
  setAutoBreakEnabled(true);

  // Emit focus_completed event
  store.emit("focus_completed", { task: store.state.activeTimer.task });

  // Relax timer should automatically be started by handover handler
  expect(store.state.relaxTimer).not.toBeNull();
  expect(store.state.relaxTimer?.name).toContain("Guilt-Free Break");
  expect(store.state.relaxTimer?.running).toBe(true);

  cleanupFocusView();
  store.state.relaxTimer = null;
});

test("handleFocusKeydown triggers Shift+Tab relax switch and Ctrl+C stop & bank", () => {
  // 1. Shift+Tab switches to relax mode from active timer
  store.state.activeTimer = {
    task: { id: 88, title: "Compiler pass", category: "code", mins: 30 },
    running: true,
    elapsedSeconds: 600,
    targetSeconds: 1800,
  };
  store.state.relaxTimer = null;

  let prevented = false;
  handleFocusKeydown({
    shiftKey: true,
    code: "Tab",
    preventDefault: () => { prevented = true; },
  } as any);

  expect(prevented).toBe(true);
  expect(store.state.activeTimer).toBeNull();
  expect(store.state.relaxTimer).not.toBeNull();
  expect(store.state.relaxTimer?.name).toContain("Guilt-Free Break");

  store.state.relaxTimer = null;

  // 2. Ctrl+C stops active timer and banks coins
  store.state.activeTimer = {
    task: { id: 89, title: "Documentation audit", category: "read", mins: 20 },
    running: true,
    elapsedSeconds: 300,
    targetSeconds: 1200,
  };

  let ctrlCPrevented = false;
  handleFocusKeydown({
    ctrlKey: true,
    key: "c",
    preventDefault: () => { ctrlCPrevented = true; },
  } as any);

  expect(ctrlCPrevented).toBe(true);
  expect(store.state.activeTimer).toBeNull();

  cleanupFocusView();
});
