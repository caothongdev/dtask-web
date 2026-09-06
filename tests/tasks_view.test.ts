import { test, expect, afterAll } from "bun:test";
import { server } from "../server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

afterAll(() => {
  server?.stop(true);
});

test("Tasks and Reader view modules exist and export required renderers", () => {
  const tasksPath = join(import.meta.dir, "..", "public/js/views/tasks.js");
  const readerPath = join(import.meta.dir, "..", "public/js/views/reader.js");

  expect(existsSync(tasksPath)).toBe(true);
  expect(existsSync(readerPath)).toBe(true);

  const tasksContent = readFileSync(tasksPath, "utf8");
  expect(tasksContent).toContain("renderTasksView");
  expect(tasksContent).toContain("quick-add");

  const readerContent = readFileSync(readerPath, "utf8");
  expect(readerContent).toContain("openReaderModal");
});

test("Tasks and Reader view files serve with 200 via HTTP", async () => {
  const res1 = await fetch(`http://localhost:${server.port}/js/views/tasks.js`);
  expect(res1.status).toBe(200);
  expect(res1.headers.get("content-type")).toContain("javascript");

  const res2 = await fetch(`http://localhost:${server.port}/js/views/reader.js`);
  expect(res2.status).toBe(200);
  expect(res2.headers.get("content-type")).toContain("javascript");
});

test("Tasks view implements required command bar, filters, mode cards, and telemetry", () => {
  const tasksPath = join(import.meta.dir, "..", "public/js/views/tasks.js");
  expect(existsSync(tasksPath)).toBe(true);
  const content = readFileSync(tasksPath, "utf8");

  // Command bar with categories and modes
  expect(content).toContain("QUICK TASK CAPTURE");
  expect(content).toContain("cat-pill");
  expect(content).toContain("--at");
  expect(content).toContain("--mins");
  expect(content).toContain("--book");

  // Filter row
  expect(content).toContain("filter-status-chip");
  expect(content).toContain("filter-cat-chip");
  expect(content).toContain("tasks-search");

  // Mode-specific cards & actions
  expect(content).toContain("START FOCUS");
  expect(content).toContain("startFocusTimer");
  expect(content).toContain("openReaderModal");
  expect(content).toContain("task-checkbox-btn");
  expect(content).toContain("toggleTaskDone");
  expect(content).toContain("[DEL]");

  // Telemetry sidebar & quick focus logger
  expect(content).toContain("TELEMETRY &amp; STATS");
  expect(content).toContain("efficiency");
  expect(content).toContain("QUICK FOCUS LOG");
  expect(content).toContain("+15 MINS");
  expect(content).toContain("+25 MINS");
});

test("Reader view implements reading modal overlay, stepper, and timer", () => {
  const readerPath = join(import.meta.dir, "..", "public/js/views/reader.js");
  expect(existsSync(readerPath)).toBe(true);
  const content = readFileSync(readerPath, "utf8");

  expect(content).toContain("openReaderModal");
  expect(content).toContain("reader-modal-overlay");
  expect(content).toContain("updateBook");
  expect(content).toContain("markDone");
  expect(content).toContain("playComplete");
  expect(content).toContain("reader-step-prev");
  expect(content).toContain("reader-step-next");
  expect(content).toContain("SESSION:");
  expect(content).toContain("[Save & Close]");
  expect(content).toContain("[Mark Chapter Read]");
});

test("public/index.html mounts renderTasksView and handles routing to #tasks", async () => {
  const res = await fetch(`http://localhost:${server.port}/index.html`);
  expect(res.status).toBe(200);
  const html = await res.text();

  expect(html).toContain('import { renderTasksView } from "/js/views/tasks.js";');
  expect(html).toContain("renderTasksView(root)");
  expect(html).toContain("renderCurrentView()");

  const storePath = join(import.meta.dir, "..", "public/js/store.js");
  const storeContent = readFileSync(storePath, "utf8");
  expect(storeContent).toContain("toggleTaskDone");
});
