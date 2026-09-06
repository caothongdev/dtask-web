import { test, expect, afterAll } from "bun:test";
import { server } from "../server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderBtopAsciiBar,
  formatTime,
  calculateAccruals,
  renderFocusView,
  cleanupFocusView,
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
  expect(content).toContain("FOCUS_DAEMON // RUNNING");
  expect(content).toContain("ACTIVE_FLOW_PULSE");
  expect(content).toContain("[BTOP_RESOURCE_FILL]");
  expect(content).toContain("XP_REWARD_PIPELINE");
  expect(content).toContain("COIN_LEDGER_ACTIVE");
  expect(content).toContain("EXECUTION_BUS_CONTROLS");
  expect(content).toContain("[Space]");
  expect(content).toContain("[Enter]");
  expect(content).toContain("[Ctrl+C / Esc]");
  expect(content).toContain("Guilt-Free Break Ready");

  // Relax mode components
  expect(content).toContain("RELAX_DAEMON");
  expect(content).toContain("WARM STONE AMBIENT");
  expect(content).toContain("Return to Work");

  // Quick Dispatcher / Standby mode (when no timer is active)
  expect(content).toContain("FOCUS_DAEMON // STANDBY");
  expect(content).toContain("QUICK_DISPATCHER");
  expect(content).toContain("25m");
  expect(content).toContain("45m");
  expect(content).toContain("60m");

  // Keyboard hotkeys
  expect(content).toContain("keydown");
  expect(content).toContain("cleanupFocusView");
});
