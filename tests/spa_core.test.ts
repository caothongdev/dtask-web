// @ts-nocheck — this suite tests the untyped zero-build JS in public/js through
// runtime shims (localStorage/fetch); strict TS checking of the JS imports is noise.
import { test, expect, afterAll, afterEach, beforeEach } from "bun:test";
import { ApiClient, api } from "../public/js/api.js";
import { Store, store as storeSingleton } from "../public/js/store.js";

// ── Environment shims ─────────────────────────────────────────────────
// api.js persists sessions in localStorage; store.js runs a 1s background
// ticker. Shim the former and clean up the latter so tests stay isolated.

const originalLocalStorage = globalThis.localStorage;
const originalFetch = globalThis.fetch;
const ls = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => ls.set(k, String(v)),
  removeItem: (k: string) => ls.delete(k),
  clear: () => ls.clear(),
};

const stores: Store[] = [];
function makeStore(): Store {
  const s = new Store();
  stores.push(s);
  return s;
}

const apiOriginals: Record<string, any> = {};
function patchApi(method: string, impl: (...args: any[]) => any) {
  if (!(method in apiOriginals)) apiOriginals[method] = (api as any)[method];
  (api as any)[method] = impl;
}

afterAll(() => {
  for (const s of stores) if (s._timerInterval) clearInterval(s._timerInterval);
  if (storeSingleton._timerInterval) clearInterval(storeSingleton._timerInterval);
  for (const [k, v] of Object.entries(apiOriginals)) (api as any)[k] = v;
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalLocalStorage;
});

// Restore fetch between tests so a stub from one test can never answer an
// un-stubbed api call in another (store internals fire fire-and-forget
// requests that would otherwise auto-persist fake sessions).
afterEach(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  ls.clear();
});

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

// ── api.js ────────────────────────────────────────────────────────────

test("ApiClient injects bearer auth and JSON-serializes bodies", async () => {
  let captured: any = null;
  (globalThis as any).fetch = async (url: any, config: any) => {
    captured = { url, ...config };
    return jsonRes({ task: { id: 1 } });
  };

  const client = new ApiClient("http://127.0.0.1:59999");
  client.setToken("key123");
  const data = await client.createTask({ title: "Write tests", category: "code" });

  expect(captured.method).toBe("POST");
  expect(captured.url).toBe("http://127.0.0.1:59999/api/tasks");
  expect(captured.headers["Authorization"]).toBe("Bearer key123");
  expect(captured.headers["Content-Type"]).toBe("application/json");
  expect(captured.cache).toBe("no-store");
  expect(JSON.parse(captured.body)).toEqual({ title: "Write tests", category: "code" });
  expect(data.task.id).toBe(1);
});

test("ApiClient falls back to username headers and skips empty query params", async () => {
  let captured: any = null;
  (globalThis as any).fetch = async (url: any, config: any) => {
    captured = { url, ...config };
    return jsonRes({ tasks: [] });
  };

  const client = new ApiClient("http://127.0.0.1:59999");
  client.username = "bob";
  await client.getTasks({ category: "code", status: "", q: undefined });

  expect(captured.headers["X-Dtask-User"]).toBe("bob");
  expect(captured.headers["X-Btask-User"]).toBe("bob");
  expect(captured.headers["Authorization"]).toBeUndefined();
  expect(captured.url).toBe("http://127.0.0.1:59999/api/tasks?category=code");
});

test("ApiClient throws enriched errors from API error payloads", async () => {
  (globalThis as any).fetch = async () =>
    jsonRes({ error: "username taken" }, 409);

  const client = new ApiClient("http://127.0.0.1:59999");
  let thrown: any;
  try {
    await client.login("bob");
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(Error);
  expect(thrown.message).toBe("username taken");
  expect(thrown.status).toBe(409);
});

test("ApiClient persists a fresh api_key from login responses", async () => {
  (globalThis as any).fetch = async () => jsonRes({ user: { username: "carol" }, api_key: "rawkey48" }, 201);

  const client = new ApiClient("http://127.0.0.1:59999");
  await client.login("carol");
  expect(client.getToken()).toBe("rawkey48");
  expect(ls.get("dtask:session")).toBe("rawkey48");
  expect(ls.get("dtask:session:user")).toBe("carol");
});

test("ApiClient clearToken wipes current and legacy session keys", () => {
  const client = new ApiClient("http://127.0.0.1:59999");
  client.setToken("tok", "dan");
  expect(ls.get("dtask:session")).toBe("tok");
  expect(client.username).toBe("dan");

  client.clearToken();
  expect(client.getToken()).toBe("");
  expect(ls.has("dtask:session")).toBe(false);
  expect(ls.has("dtask:session:user")).toBe(false);
});

// ── store.js ──────────────────────────────────────────────────────────

test("Store event bus notifies state and named-event listeners, with unsubscribe", () => {
  const s = makeStore();
  const seen: string[] = [];
  const unsub = s.subscribe((_state, event) => seen.push(event));
  const named: any[] = [];
  s.subscribe("custom_event", (payload) => named.push(payload));

  s.emit("custom_event", { n: 1 });
  expect(seen).toContain("custom_event");
  expect(named).toEqual([{ n: 1 }]);

  unsub();
  s.emit("custom_event", { n: 2 });
  expect(named.length).toBe(2);
  expect(seen.filter(e => e === "custom_event").length).toBe(1);
});

test("handleTaskEvent upserts, archives and deletes tasks from SSE payloads", async () => {
  const s = makeStore();
  patchApi("getTimeline", async () => ({}));
  patchApi("getMe", async () => ({ user: null }));
  patchApi("getStats", async () => ({}));
  s.state.tasks = [{ id: 1, title: "a" }, { id: 2, title: "b" }];

  s.handleTaskEvent({ id: 3, title: "c" });
  expect(s.state.tasks.map(t => t.id)).toEqual([3, 1, 2]);

  s.handleTaskEvent({ id: 1, title: "a2" });
  expect(s.state.tasks.find(t => t.id === 1)?.title).toBe("a2");

  s.handleTaskEvent({ id: 2, archived: true });
  expect(s.state.tasks.some(t => t.id === 2)).toBe(false);

  s.handleTaskEvent({ id: 3, deleted: true });
  expect(s.state.tasks.some(t => t.id === 3)).toBe(false);
});

test("focus timer controls drive server sync and emit lifecycle events", async () => {
  const s = makeStore();
  const syncs: any[] = [];
  patchApi("syncTimer", async (...args: any[]) => {
    syncs.push(args);
    return {};
  });
  const events: string[] = [];
  s.subscribe((_state, event) => events.push(event));

  s.startFocusTimer({ id: 9, title: "Deep work", mins: 25, time_spent: 120 });
  expect(s.state.activeTimer).toMatchObject({ running: true, elapsedSeconds: 120, targetSeconds: 1500 });
  await Bun.sleep(2);
  expect(syncs[0]).toEqual([9, "start", 120]);

  s.pauseFocusTimer();
  expect(s.state.activeTimer.running).toBe(false);
  await Bun.sleep(2);
  expect(syncs[1]).toEqual([9, "pause", 120]);

  s.resumeFocusTimer();
  expect(s.state.activeTimer.running).toBe(true);

  // resume fires its own start-sync
  await Bun.sleep(2);
  expect(syncs[2]).toEqual([9, "start", 120]);

  // 120s elapsed -> 2 minutes banked
  s.stopFocusTimer(true);
  expect(s.state.activeTimer).toBeNull();
  await Bun.sleep(2);
  expect(syncs[3]).toEqual([9, "bank", 120, 2]);
  expect(events).toContain("timer_started");
  expect(events).toContain("timer_paused");
  expect(events).toContain("timer_stopped");
});

test("relax timer controls manage their own lifecycle", () => {
  const s = makeStore();
  s.startRelaxTimer(5, "Stretch");
  expect(s.state.relaxTimer).toMatchObject({ name: "Stretch", running: true, totalSeconds: 300, elapsedSeconds: 0 });
  s.pauseRelaxTimer();
  expect(s.state.relaxTimer.running).toBe(false);
  s.resumeRelaxTimer();
  expect(s.state.relaxTimer.running).toBe(true);
  s.stopRelaxTimer();
  expect(s.state.relaxTimer).toBeNull();
});

test("loadAll hydrates state from the API without EventSource", async () => {
  const s = makeStore();
  patchApi("getToken", () => "tok");
  patchApi("getMe", async () => ({ user: { username: "eve" }, level_info: { level: 3 } }));
  patchApi("getTasks", async () => ({ tasks: [{ id: 1 }] }));
  patchApi("getRewards", async () => ({ rewards: [{ id: 2 }] }));
  patchApi("getTransactions", async () => ({ transactions: [{ id: 3 }] }));
  patchApi("getTimeline", async () => ({ active_task: null }));
  patchApi("getStats", async () => ({ streak_days: 4 }));

  await s.loadAll();
  expect(s.state.user).toEqual({ username: "eve" });
  expect(s.state.levelInfo).toEqual({ level: 3 });
  expect(s.state.tasks).toEqual([{ id: 1 }]);
  expect(s.state.stats).toEqual({ streak_days: 4 });
  expect(s.es).toBeNull(); // no EventSource under Bun — connectSSE no-ops safely
});

test("loadAll is a no-op without a session", async () => {
  const s = makeStore();
  let called = 0;
  patchApi("getToken", () => "");
  patchApi("getMe", async () => {
    called++;
    return {};
  });
  await s.loadAll();
  expect(called).toBe(0);
});
