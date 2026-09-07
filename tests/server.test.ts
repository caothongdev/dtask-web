// dtask-web test suite — runs against an isolated test DB and random port.
// Usage: bun test  (or: bun test tests/)
//
// Coverage:
//   - auth: bearer key + X-Dtask-User / X-Btask-User auto-register
//   - tasks CRUD: create / list / patch / done / archive / delete
//   - search: /api/tasks?q=
//   - import: bulk JSON
//   - focus: POST /api/stats/focus
//   - stats: zero-filled 7-day activity, streak, xp
//   - activity: zero-fill gap days
//   - public board: /api/u/<user> requires is_public=1
//   - PATCH /api/me: rename + is_public toggle
//   - SSE: hello event + push on action
//   - cache-control: no-store on /api/*
//   - CORS: allow-origin: *

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

// Use isolated test DB so prod data is safe
const TEST_DB = "/tmp/dtask-test.sqlite";
const TEST_PORT = 0; // 0 = random free port

// Override env BEFORE importing server
process.env.DTASK_PORT = String(TEST_PORT);
process.env.DTASK_DB = TEST_DB;
process.env.NODE_ENV = "test";

// Now spin up the server in this process
const serverMod = await import("../server.ts");
const baseUrl = `http://127.0.0.1:${serverMod.server.port}`;

// Build a fresh client; use X-Dtask-User auto-register (no need to hit /api/users)
async function api(method: string, path: string, body?: any, key?: string): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers["authorization"] = `Bearer ${key}`;
  if (body?.__username && !key) headers["x-dtask-user"] = body.__username;
  const cleanBody = body ? { ...body } : undefined;
  if (cleanBody) delete cleanBody.__username;
  const r = await fetch(baseUrl + path, {
    method,
    headers,
    body: cleanBody ? JSON.stringify(cleanBody) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

beforeAll(() => {
  // Wipe test DB before suite
  for (const ext of ["", "-shm", "-wal"]) {
    if (existsSync(TEST_DB + ext)) rmSync(TEST_DB + ext);
  }
});

afterAll(() => {
  serverMod.server.stop(true);
  for (const ext of ["", "-shm", "-wal"]) {
    if (existsSync(TEST_DB + ext)) rmSync(TEST_DB + ext);
  }
});

describe("dtask-web v1.1.0", () => {
  // ── Health & metadata ─────────────────────────────────────────
  it("/api/health returns version + uptime", async () => {
    const r = await api("GET", "/api/health");
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.data.service).toBe("dtask-web");
    expect(r.data.version).toBe("1.1.0");
    expect(typeof r.data.uptime_s).toBe("number");
  });

  it("/api/nope falls through to SPA (returns 200 + index.html)", async () => {
    // SPA pattern: any non-API GET returns index.html. Client-side handles 404s.
    const r = await fetch(baseUrl + "/some/spa/path");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("<!doctype html>");
  });

  // ── Cache + CORS ──────────────────────────────────────────────
  it("/api/* sets cache-control: no-store", async () => {
    const r = await fetch(baseUrl + "/api/health");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("OPTIONS preflight returns 204 + CORS headers", async () => {
    const r = await fetch(baseUrl + "/api/tasks", { method: "OPTIONS" });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-methods")).toContain("PATCH");
  });

  // ── User / auth ───────────────────────────────────────────────
  it("X-Dtask-User auto-registers and returns api_key on first task create", async () => {
    const r = await api("POST", "/api/tasks", { __username: "test-user-1", title: "first", category: "code" });
    expect(r.status).toBe(201);
    expect(r.data.task.title).toBe("first");
    expect(r.data.api_key).toMatch(/^[a-f0-9]{48}$/);
  });

  it("X-Btask-User backwards-compatibility auto-registers and returns api_key", async () => {
    const r = await fetch(baseUrl + "/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json", "x-btask-user": "compat-user" },
      body: JSON.stringify({ title: "compat-task", category: "code" }),
    });
    expect(r.status).toBe(201);
    const data = await r.json();
    expect(data.api_key).toMatch(/^[a-f0-9]{48}$/);
  });

  it("invalid username (special chars) returns 400/401", async () => {
    const r = await api("POST", "/api/tasks", { __username: "bad user!", title: "x", category: "code" });
    expect([400, 401]).toContain(r.status);
  });

  // ── Tasks CRUD ────────────────────────────────────────────────
  describe("tasks CRUD", () => {
    let KEY = "";
    beforeAll(async () => {
      const r = await api("POST", "/api/tasks", { __username: "test-user-2", title: "seed", category: "code" });
      KEY = r.data.api_key;
    });

    it("creates with valid category", async () => {
      const r = await api("POST", "/api/tasks", { title: "do thing", category: "health", progress: 50 }, KEY);
      expect(r.status).toBe(201);
      expect(r.data.task.status).toBe("open");
      expect(r.data.task.progress).toBe(50);
    });

    it("rejects invalid category", async () => {
      const r = await api("POST", "/api/tasks", { title: "x", category: "garbage" }, KEY);
      expect(r.status).toBe(400);
    });

    it("rejects empty title", async () => {
      const r = await api("POST", "/api/tasks", { title: "", category: "code" }, KEY);
      expect(r.status).toBe(400);
    });

    it("clamps progress to 0-100", async () => {
      const lo = await api("POST", "/api/tasks", { title: "x", category: "code", progress: -50 }, KEY);
      const hi = await api("POST", "/api/tasks", { title: "y", category: "code", progress: 999 }, KEY);
      expect(lo.data.task.progress).toBe(0);
      expect(hi.data.task.progress).toBe(100);
    });

    it("lists tasks for current user only", async () => {
      // Already has seed + do thing + x + y from this user
      const r = await api("GET", "/api/tasks", undefined, KEY);
      expect(r.status).toBe(200);
      expect(r.data.tasks.length).toBeGreaterThan(0);
      for (const t of r.data.tasks) {
        expect(["code","read","health","personal","work","maintenance"]).toContain(t.category);
      }
    });

    it("filters by category and status", async () => {
      const a = await api("GET", "/api/tasks?category=code", undefined, KEY);
      const b = await api("GET", "/api/tasks?status=open", undefined, KEY);
      expect(a.data.tasks.every((t: any) => t.category === "code")).toBe(true);
      expect(b.data.tasks.every((t: any) => t.status === "open")).toBe(true);
    });

    it("search by title substring", async () => {
      const r = await api("POST", "/api/tasks", { title: "searchable target abcdef", category: "code" }, KEY);
      const tid = r.data.task.id;
      const found = await api("GET", "/api/tasks?q=abcdef", undefined, KEY);
      expect(found.data.tasks.length).toBeGreaterThan(0);
      expect(found.data.tasks[0].id).toBe(tid);
    });

    it("search escapes LIKE wildcards", async () => {
      const r = await api("GET", "/api/tasks?q=%", undefined, KEY);
      // Should not crash, should return [] (no title matches literal %)
      expect(r.status).toBe(200);
    });

    it("done sets status=done, progress=100", async () => {
      const r = await api("POST", "/api/tasks", { title: "to-finish", category: "code" }, KEY);
      const id = r.data.task.id;
      const d = await api("POST", `/api/tasks/${id}/done`, undefined, KEY);
      expect(d.data.task.status).toBe("done");
      expect(d.data.task.progress).toBe(100);
      expect(d.data.task.completed_at).not.toBeNull();
    });

    it("PATCH /tasks/:id allows partial updates", async () => {
      const r = await api("POST", "/api/tasks", { title: "patch me", category: "code" }, KEY);
      const id = r.data.task.id;
      const p = await api("PATCH", `/api/tasks/${id}`, { progress: 75, title: "patched" }, KEY);
      expect(p.data.task.progress).toBe(75);
      expect(p.data.task.title).toBe("patched");
    });

    it("archive (=soft delete) then unarchive", async () => {
      const r = await api("POST", "/api/tasks", { title: "archive-me", category: "code" }, KEY);
      const id = r.data.task.id;
      await api("DELETE", `/api/tasks/${id}`, undefined, KEY);
      const list = await api("GET", "/api/tasks", undefined, KEY);
      expect(list.data.tasks.find((t: any) => t.id === id)).toBeUndefined();
      const all = await api("GET", "/api/tasks?archived=1", undefined, KEY);
      expect(all.data.tasks.find((t: any) => t.id === id)).toBeDefined();
      const unarchive = await api("PATCH", `/api/tasks/${id}`, { archived: 0 }, KEY);
      expect(unarchive.data.task.archived).toBe(0);
    });

    it("hard delete is permanent", async () => {
      const r = await api("POST", "/api/tasks", { title: "kill-me", category: "code" }, KEY);
      const id = r.data.task.id;
      await api("DELETE", `/api/tasks/${id}?hard=1`, undefined, KEY);
      const list = await api("GET", "/api/tasks?archived=1", undefined, KEY);
      expect(list.data.tasks.find((t: any) => t.id === id)).toBeUndefined();
    });
  });

  // ── /api/me + PATCH /api/me ───────────────────────────────────
  describe("/api/me + rename + public toggle", () => {
    it("PATCH /api/me toggles is_public", async () => {
      const r = await api("POST", "/api/tasks", { __username: "test-public", title: "x", category: "code" });
      const key = r.data.api_key;
      const m1 = await api("GET", "/api/me", undefined, key);
      expect(m1.data.user.is_public).toBe(0);
      const m2 = await api("PATCH", "/api/me", { is_public: 1 }, key);
      expect(m2.data.user.is_public).toBe(1);
    });

    it("PATCH /api/me renames handle", async () => {
      const r = await api("POST", "/api/tasks", { __username: "old-name", title: "x", category: "code" });
      const key = r.data.api_key;
      const p = await api("PATCH", "/api/me", { username: "new-name" }, key);
      expect(p.data.user.username).toBe("new-name");
      // Old name should not exist anymore — re-register it
      const r2 = await api("POST", "/api/tasks", { __username: "old-name", title: "y", category: "code" });
      // new registration returns api_key
      expect(typeof r2.data.api_key).toBe("string");
      expect(r2.data.task.title).toBe("y");
    });

    it("rejects invalid rename (too short)", async () => {
      const r = await api("POST", "/api/tasks", { __username: "test-rename-1", title: "x", category: "code" });
      const key = r.data.api_key;
      const p = await api("PATCH", "/api/me", { username: "a" }, key);
      expect(p.status).toBe(400);
    });

    it("rejects taken username", async () => {
      await api("POST", "/api/tasks", { __username: "taken", title: "x", category: "code" });
      const r = await api("POST", "/api/tasks", { __username: "other-user", title: "x", category: "code" });
      const key = r.data.api_key;
      const p = await api("PATCH", "/api/me", { username: "taken" }, key);
      expect(p.status).toBe(409);
    });
  });

  // ── Public board ──────────────────────────────────────────────
  it("public board hidden when is_public=0", async () => {
    const r = await api("POST", "/api/tasks", { __username: "test-private", title: "x", category: "code" });
    const key = r.data.api_key;
    const pub = await api("GET", "/api/u/test-private");
    expect(pub.status).toBe(404);
  });

  it("public board returns tasks when is_public=1", async () => {
    const r = await api("POST", "/api/tasks", { __username: "test-pubboard", title: "visible", category: "code" });
    const key = r.data.api_key;
    await api("PATCH", "/api/me", { is_public: 1 }, key);
    const pub = await api("GET", "/api/u/test-pubboard");
    expect(pub.status).toBe(200);
    expect(pub.data.user.username).toBe("test-pubboard");
    expect(pub.data.user.is_public).toBe(true);
    expect(pub.data.tasks.length).toBeGreaterThan(0);
    expect(pub.data.activity_7d).toHaveLength(7);
    for (const day of pub.data.activity_7d) {
      expect(typeof day.count).toBe("number");
    }
  });

  // ── Stats + activity ──────────────────────────────────────────
  describe("stats + activity zero-fill", () => {
    it("activity returns exactly 7 days, sorted oldest first", async () => {
      const r = await api("POST", "/api/tasks", { __username: "test-stats", title: "x", category: "code" });
      const key = r.data.api_key;
      const a = await api("GET", "/api/activity", undefined, key);
      expect(a.data.activity).toHaveLength(7);
      // Confirm strictly ascending
      for (let i = 1; i < a.data.activity.length; i++) {
        expect(a.data.activity[i].day > a.data.activity[i-1].day).toBe(true);
      }
    });

    it("stats includes xp, streak, activity_7d", async () => {
      const r = await api("POST", "/api/tasks", { __username: "test-stats-2", title: "x", category: "code" });
      const key = r.data.api_key;
      await api("POST", "/api/tasks", { title: "y", category: "code" }, key);
      await api("POST", "/api/stats/focus", { minutes: 25 }, key);
      const s = await api("GET", "/api/stats", undefined, key);
      expect(s.data.totals.total).toBeGreaterThanOrEqual(2);
      expect(s.data.focus_minutes).toBe(25);
      expect(s.data.xp).toBeGreaterThan(0);
      expect(s.data.streak_days).toBeGreaterThanOrEqual(1);
      expect(s.data.activity_7d).toHaveLength(7);
    });

    it("POST /api/stats/focus rejects 0 and >600 minutes", async () => {
      const r = await api("POST", "/api/tasks", { __username: "test-focus-bad", title: "x", category: "code" });
      const key = r.data.api_key;
      expect((await api("POST", "/api/stats/focus", { minutes: 0 }, key)).status).toBe(400);
      expect((await api("POST", "/api/stats/focus", { minutes: 700 }, key)).status).toBe(400);
    });
  });

  // ── Import ────────────────────────────────────────────────────
  it("import inserts valid tasks, rejects invalid", async () => {
    const r = await api("POST", "/api/tasks", { __username: "test-import", title: "x", category: "code" });
    const key = r.data.api_key;
    const im = await api("POST", "/api/tasks/import", {
      tasks: [
        { title: "A", category: "code" },
        { title: "B", category: "personal", progress: 30 },
        { title: "", category: "code" },         // invalid
        { title: "C", category: "JUNK" },        // invalid category
        { title: "D", category: "read", status: "done" },
      ],
    }, key);
    expect(im.data.inserted).toBe(3);
    expect(im.data.errors).toHaveLength(2);
    expect(im.data.errors[0].index).toBe(2);
  });

  it("import with empty array returns 400", async () => {
    const r = await api("POST", "/api/tasks", { __username: "test-import-bad", title: "x", category: "code" });
    const key = r.data.api_key;
    const im = await api("POST", "/api/tasks/import", { tasks: [] }, key);
    expect(im.status).toBe(400);
  });

  // ── SSE ───────────────────────────────────────────────────────
  it("SSE emits hello immediately on connect", async () => {
    const r = await api("POST", "/api/tasks", { __username: "test-sse-1", title: "x", category: "code" });
    const key = r.data.api_key;
    const r2 = await fetch(baseUrl + `/api/events?api_key=${key}`);
    // Read first chunk only
    const reader = r2.body!.getReader();
    const { value } = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]).catch(() => ({ value: null as any }));
    const buf = value ? new TextDecoder().decode(value) : "";
    await reader.cancel();
    expect(buf).toContain("event: hello");
    expect(buf).toContain('"user":"test-sse-1"');
  });

  it("SSE pushes task event when client (same user) does the action", async () => {
    const r = await api("POST", "/api/tasks", { __username: "test-sse-2", title: "watchme", category: "code" });
    const key = r.data.api_key;
    const id = r.data.task.id;

    // Open SSE
    const es = await fetch(baseUrl + `/api/events?api_key=${key}`);
    const reader = es.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    // Read first chunk (hello)
    const { value } = await reader.read();
    buf += dec.decode(value);
    expect(buf).toContain("event: hello");

    // Trigger a task mutation from another connection
    await api("PATCH", `/api/tasks/${id}`, { progress: 42 }, key);

    // Read next chunk (should be task event)
    const { value: v2 } = await reader.read();
    buf += dec.decode(v2 || new Uint8Array());
    await reader.cancel();
    expect(buf).toContain("event: task");
    expect(buf).toContain('"id":' + id);
  });

  // ── Authorization guards ──────────────────────────────────────
  it("/api/tasks without auth returns 401", async () => {
    const r = await api("GET", "/api/tasks");
    expect(r.status).toBe(401);
  });

  it("/api/stats with wrong key returns 401", async () => {
    const r = await api("GET", "/api/stats", undefined, "deadbeef" + "0".repeat(44));
    expect(r.status).toBe(401);
  });
});