import { test, expect, afterAll } from "bun:test";
import { server } from "../server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFlags } from "../public/js/views/tasks.js";

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
  expect(content).toContain("task-del-btn");
  expect(content).toContain("Delete");

  // Task Edit action & in-place list update
  expect(content).toContain("task-edit-btn");
  expect(content).toContain("Edit");
  expect(content).toContain("openEditTaskModal");
  expect(content).toContain("updateTasksListOnly");

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

test("parseFlags correctly parses all flag variations and handles edge cases", () => {
  // 1. Regular task title without flags
  const plain = parseFlags("Write unit tests");
  expect(plain.title).toBe("Write unit tests");
  expect(plain.at).toBeNull();
  expect(plain.mins).toBe(0);
  expect(plain.book_title).toBeNull();
  expect(plain.pages).toBe(0);

  // 2. Scheduled time flag (--at)
  const scheduled = parseFlags("Team Standup --at 09:30");
  expect(scheduled.title).toBe("Team Standup");
  expect(scheduled.at).toBe("09:30");

  // 3. Focus duration flag (--mins)
  const timed = parseFlags("Refactor core engine --mins 45");
  expect(timed.title).toBe("Refactor core engine");
  expect(timed.mins).toBe(45);

  // 4. Book flag with quotes and page count
  const bookWithPages = parseFlags('Reading Session --book "Designing Data-Intensive Applications" 400');
  expect(bookWithPages.title).toBe("Reading Session");
  expect(bookWithPages.book_title).toBe("Designing Data-Intensive Applications");
  expect(bookWithPages.pages).toBe(400);

  // 5. Book flag single word without pages
  const bookSimple = parseFlags("Read --book SICP");
  expect(bookSimple.title).toBe("Read");
  expect(bookSimple.book_title).toBe("SICP");

  // 6. Explicit --pages flag
  const pagesFlag = parseFlags("Rust Book --pages 280");
  expect(pagesFlag.title).toBe("Rust Book");
  expect(pagesFlag.pages).toBe(280);

  // 7. Combined flags in mixed order
  const combined = parseFlags("Deep Work --mins 90 --at 14:00");
  expect(combined.title).toBe("Deep Work");
  expect(combined.mins).toBe(90);
  expect(combined.at).toBe("14:00");

  // 8. Flag-only input fallback (title will be empty or book title)
  const flagOnlyBook = parseFlags('--book "The Mythical Man-Month" 200');
  expect(flagOnlyBook.title).toBe("");
  expect(flagOnlyBook.book_title).toBe("The Mythical Man-Month");
  expect(flagOnlyBook.pages).toBe(200);
  // Test fallback logic used in tasks.js:
  const fallbackTitle = flagOnlyBook.title || flagOnlyBook.book_title || '--book "The Mythical Man-Month" 200';
  expect(fallbackTitle).toBe("The Mythical Man-Month");
});

test("Tasks view includes Edit task action and updates tasks via api.updateTask", () => {
  const tasksPath = join(import.meta.dir, "..", "public/js/views/tasks.js");
  const content = readFileSync(tasksPath, "utf8");

  expect(content).toContain("data-action=\"edit\"");
  expect(content).toContain("task-edit-btn");
  expect(content).toContain("openEditTaskModal");
  expect(content).toContain("api.updateTask");
  expect(content).toContain("edit-task-title");
  expect(content).toContain("edit-task-category");
  expect(content).toContain("edit-task-at");
  expect(content).toContain("edit-task-mins");
});
