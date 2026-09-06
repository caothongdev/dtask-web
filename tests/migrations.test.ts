import { test, expect, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations, DEFAULT_REWARDS, server } from "../server";

afterAll(() => {
  server?.stop(true);
});

test("runMigrations upgrades legacy schema with all dtask columns and tables", () => {
  const memDb = new Database(":memory:");
  memDb.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, api_key TEXT UNIQUE, is_public INTEGER DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, category TEXT, title TEXT, progress INTEGER DEFAULT 0, status TEXT DEFAULT 'open');
    INSERT INTO tasks (user_id, category, title) VALUES (1, 'work', 'work task');
    INSERT INTO tasks (user_id, category, title) VALUES (1, 'personal', 'personal task');
    INSERT INTO tasks (user_id, category, title) VALUES (1, 'maintenance', 'maintenance task');
  `);

  runMigrations(memDb);

  // Check tasks columns
  const taskCols = memDb.query("PRAGMA table_info(tasks)").all().map((c: any) => c.name);
  expect(taskCols).toContain("at");
  expect(taskCols).toContain("mins");
  expect(taskCols).toContain("time_spent");
  expect(taskCols).toContain("book_title");
  expect(taskCols).toContain("book_text");
  expect(taskCols).toContain("page");
  expect(taskCols).toContain("pages");
  expect(taskCols).toContain("xp");
  expect(taskCols).toContain("coins");
  expect(taskCols).toContain("running_since");
  expect(taskCols).toContain("prev_time_spent");
  expect(taskCols).toContain("prev_page");
  expect(taskCols).toContain("prev_progress");

  // Check users columns
  const userCols = memDb.query("PRAGMA table_info(users)").all().map((c: any) => c.name);
  expect(userCols).toContain("coins");
  expect(userCols).toContain("lifetime_earned");
  expect(userCols).toContain("lifetime_spent");

  // Check rewards table exists
  const rewards = memDb.query("SELECT COUNT(*) as count FROM rewards").get() as any;
  expect(rewards.count).toBeGreaterThanOrEqual(DEFAULT_REWARDS.length);

  // Check transactions table exists
  const txTable = memDb.query("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'").get();
  expect(txTable).toBeTruthy();

  // Check category migrations
  const categories = memDb.query("SELECT category FROM tasks ORDER BY id").all().map((r: any) => r.category);
  expect(categories).toEqual(["build", "health", "code"]);

  // Test idempotency: running again should not throw and should not duplicate default rewards
  expect(() => runMigrations(memDb)).not.toThrow();
  const rewardsAfter = memDb.query("SELECT COUNT(*) as count FROM rewards WHERE user_id IS NULL").get() as any;
  expect(rewardsAfter.count).toBe(DEFAULT_REWARDS.length);

  memDb.close();
});
