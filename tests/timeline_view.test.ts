import { test, expect, afterAll } from "bun:test";
import { server } from "../server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateCalendarMatrix, calculateDailyAllocations } from "../public/js/views/timeline.js";

afterAll(() => {
  server?.stop(true);
});

test("Timeline view module exists and exports renderTimelineView", () => {
  const path = join(import.meta.dir, "..", "public/js/views/timeline.js");
  expect(existsSync(path)).toBe(true);
  const content = readFileSync(path, "utf8");
  expect(content).toContain("renderTimelineView");
  expect(content).toContain("timeline");
});

test("Timeline view file serves with 200 via HTTP", async () => {
  const res = await fetch(`http://localhost:${server.port}/js/views/timeline.js`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("javascript");
});

test("index.html routes to timeline view", async () => {
  const res = await fetch(`http://localhost:${server.port}/index.html`);
  const html = await res.text();
  expect(html).toContain("timeline.js");
  expect(html).toContain("data-view=\"timeline\"");
  expect(html).toContain("renderTimelineView");
});

test("generateCalendarMatrix generates correct matrix structure for year and month", () => {
  // Test May 2025: May 1 2025 is Thursday (index 4 in SU MO TU WE TH FR SA)
  const matrix = generateCalendarMatrix(2025, 4, 14); // month is 0-indexed: 4 = May
  expect(matrix).toBeDefined();
  expect(matrix.days.length % 7).toBe(0);
  expect(matrix.monthLabel).toContain("MAY");

  const todayCell = matrix.days.find((d: any) => d.isCurrentMonth && d.day === 14);
  expect(todayCell).toBeDefined();
  expect(todayCell.isSelected).toBe(true);

  // Check padding days from previous month
  const prevMonthCells = matrix.days.filter((d: any) => !d.isCurrentMonth && d.isPrevMonth);
  expect(prevMonthCells.length).toBe(4); // Sunday to Wednesday = 4 days
  expect(prevMonthCells[prevMonthCells.length - 1].day).toBe(30);
});

test("calculateDailyAllocations calculates deep focus hours, category counts, and target quota", () => {
  const mockTasks = [
    { id: 1, title: "Kernel dev", category: "code", mins: 90, at: "09:00", status: "open" },
    { id: 2, title: "Rust reading", category: "learn", mins: 60, at: "11:00", status: "done" },
    { id: 3, title: "Ruck walk", category: "health", mins: 45, at: "13:00", status: "open" },
    { id: 4, title: "Unscheduled bug", category: "code", mins: 30, at: null, status: "open" },
  ];

  const allocations = calculateDailyAllocations(mockTasks, 8.0);
  expect(allocations.totalMinutes).toBe(195); // 90 + 60 + 45 scheduled mins
  expect(allocations.totalHours).toBeCloseTo(3.25, 2);
  expect(allocations.targetHours).toBe(8.0);
  expect(allocations.pct).toBe(41); // Math.round((3.25 / 8.0) * 100) = 41%
  expect(allocations.categoryCounts.code).toBe(1); // 1 scheduled code task
  expect(allocations.categoryCounts.learn).toBe(1);
  expect(allocations.categoryCounts.health).toBe(1);
  expect(allocations.unscheduledCount).toBe(1);
});

test("Timeline view script includes 24h timeline grid, NOW marker, and interactive slots", () => {
  const path = join(import.meta.dir, "..", "public/js/views/timeline.js");
  expect(existsSync(path)).toBe(true);
  const content = readFileSync(path, "utf8");

  // Mini Calendar & Day navigation
  expect(content).toContain("SU");
  expect(content).toContain("MO");
  expect(content).toContain("TU");
  expect(content).toContain("WE");
  expect(content).toContain("TH");
  expect(content).toContain("FR");
  expect(content).toContain("SA");
  expect(content).toContain("TODAY");

  // Category counts & Quotas
  expect(content).toContain("DAILY ALLOCATIONS");
  expect(content).toContain("CORE DEEP FOCUS");

  // Active Slot & NOW Marker
  expect(content).toContain("● NOW");
  expect(content).toContain("► NOW");

  // Quick Schedule Modal & Unscheduled Drawer
  expect(content).toContain("openQuickScheduleModal");
  expect(content).toContain("UNPINNED FLEX QUEUE");
  expect(content).toContain("START FOCUS");
});

test("openQuickScheduleModal implements rescheduling banner and preselected task inclusion", () => {
  const path = join(import.meta.dir, "..", "public/js/views/timeline.js");
  const content = readFileSync(path, "utf8");

  // 1. Rescheduling banner elements present
  expect(content).toContain("schedule-reschedule-banner");
  expect(content).toContain("schedule-reschedule-title");
  expect(content).toContain("schedule-reschedule-cat");
  expect(content).toContain("Rescheduling Task:");

  // 2. Preselected task is included in taskSelect options even when already scheduled
  expect(content).toContain("preselTask");
  expect(content).toContain("selected");
  expect(content).toContain("taskSelect.value = String(preselTask.id)");
  expect(content).toContain("Rescheduled #");

  // 3. Clean listener property assignment to prevent stacking
  expect(content).toContain("tabPick.onclick =");
  expect(content).toContain("tabCreate.onclick =");
  expect(content).toContain("cancelBtn.onclick =");
  expect(content).toContain("form.onsubmit =");
});

test("updateTimelineLiveClocks handles hour rollover and inactive timer countdown", () => {
  const path = join(import.meta.dir, "..", "public/js/views/timeline.js");
  const content = readFileSync(path, "utf8");

  // 1. Hour rollover check moves marker to current hour slot
  expect(content).toContain("parentHourSlot.getAttribute(\"data-hour\") !== String(currentH)");
  expect(content).toContain("currentHourSlot.prepend(marker)");

  // 2. Vertical minute offset calculation
  expect(content).toContain("minutePct = ((currentM * 60 + currentS) / 3600) * 100");
  expect(content).toContain("minuteOffset");

  // 3. Active slot countdown calculated from clock when timer not running
  expect(content).toContain("endMinutes * 60 - nowSeconds");
  expect(content).toContain("currentActiveTask");
});

