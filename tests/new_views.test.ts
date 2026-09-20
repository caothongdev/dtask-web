import { test, expect, afterAll } from "bun:test";
import { server } from "../server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { store } from "../public/js/store.js";
import { renderBooksView } from "../public/js/views/books.js";
import { renderWalletView } from "../public/js/views/wallet.js";
import { renderLevelView } from "../public/js/views/level.js";
import { renderProfileView } from "../public/js/views/profile.js";

afterAll(() => {
  server?.stop(true);
});

test("New view modules exist and export required renderers", () => {
  const views: [string, string][] = [
    ["public/js/views/books.js", "renderBooksView"],
    ["public/js/views/wallet.js", "renderWalletView"],
    ["public/js/views/level.js", "renderLevelView"],
    ["public/js/views/profile.js", "renderProfileView"],
  ];
  for (const [file, exportName] of views) {
    const fullPath = join(import.meta.dir, "..", file);
    expect(existsSync(fullPath)).toBe(true);
    const content = readFileSync(fullPath, "utf8");
    expect(content).toContain(`export function ${exportName}`);
  }
});

test("New view files serve with 200 via HTTP", async () => {
  for (const file of [
    "/js/views/books.js",
    "/js/views/wallet.js",
    "/js/views/level.js",
    "/js/views/profile.js",
  ]) {
    const res = await fetch(`http://localhost:${server.port}${file}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  }
});

test("index.html routes to books, wallet, level, and profile views", async () => {
  const res = await fetch(`http://localhost:${server.port}/index.html`);
  expect(res.status).toBe(200);
  const html = await res.text();

  expect(html).toContain("books.js");
  expect(html).toContain("wallet.js");
  expect(html).toContain("level.js");
  expect(html).toContain("profile.js");

  expect(html).toContain('data-view="books"');
  expect(html).toContain('data-view="wallet"');
  expect(html).toContain('data-view="level"');
  expect(html).toContain('data-view="profile"');

  expect(html).toContain("renderBooksView(root)");
  expect(html).toContain("renderWalletView(root)");
  expect(html).toContain("renderLevelView(root)");
  expect(html).toContain("renderProfileView(root)");
});

test("renderBooksView displays linked books, reader pane, and empty state", () => {
  store.state.tasks = [
    {
      id: 1,
      title: "Read DDIA chapter 4",
      category: "read",
      status: "open",
      book_title: "Designing Data-Intensive Applications",
      book_text: "Section 4.2: Asynchronous FIFO pointers and Gray code counters.",
      page: 12,
      pages: 400,
    },
    {
      id: 2,
      title: "Kernel patch",
      category: "code",
      status: "open",
    },
  ];

  const container = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  renderBooksView(container as any);

  expect(container.innerHTML).toContain("data-books-view");
  expect(container.innerHTML).toContain("Designing Data-Intensive Applications");
  expect(container.innerHTML).toContain("1 Attachments");
  expect(container.innerHTML).toContain("p12/400");
  expect(container.innerHTML).toContain("Gray code counters");
  expect(container.innerHTML).toContain("Open Full Reader");
});

test("renderWalletView displays balance cards and transaction ledger", () => {
  store.state.user = {
    id: 7,
    username: "ledger_tester",
    coins: 85,
    lifetime_earned: 240,
    lifetime_spent: 155,
  };
  store.state.transactions = [
    { id: 1, type: "earn", amount: 50, reason: "Completed task: Build Compiler", created_at: "2026-09-10T09:30:00Z" },
    { id: 2, type: "spend", amount: 20, reason: "Purchased reward: Coffee Break", created_at: "2026-09-11T18:00:00Z" },
    { id: 3, type: "revert", amount: -20, reason: "Reversed task un-check", created_at: "2026-09-12T10:15:00Z" },
  ];

  const container = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  renderWalletView(container as any);

  expect(container.innerHTML).toContain("data-wallet-view");
  expect(container.innerHTML).toContain("85");
  expect(container.innerHTML).toContain("+240");
  expect(container.innerHTML).toContain("-155");
  expect(container.innerHTML).toContain("Full Transaction Ledger");
  expect(container.innerHTML).toContain("Completed task: Build Compiler");
  expect(container.innerHTML).toContain("Purchased reward: Coffee Break");
  expect(container.innerHTML).toContain("+50");
});

test("renderWalletView shows empty ledger message when no transactions", () => {
  store.state.user = { id: 7, username: "broke", coins: 0, lifetime_earned: 0, lifetime_spent: 0 };
  store.state.transactions = [];

  const container = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  renderWalletView(container as any);

  expect(container.innerHTML).toContain("No transactions recorded yet");
});

test("renderLevelView displays level badge, rank, XP buffer, and tier table", () => {
  store.state.user = { id: 7, username: "tier_tester", coins: 10 };
  store.state.levelInfo = {
    level: 3,
    rank: "Apprentice",
    prog_xp: 35,
    needed_xp: 70,
    pct: 50,
    total_xp: 185,
  };

  const container = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  renderLevelView(container as any);

  expect(container.innerHTML).toContain("data-level-view");
  expect(container.innerHTML).toContain("LEVEL");
  expect(container.innerHTML).toContain("Apprentice");
  expect(container.innerHTML).toContain("35 XP to Level 4");
  expect(container.innerHTML).toContain("35 / 70 XP");
  expect(container.innerHTML).toContain("Official Operator Rank Tiers");
  expect(container.innerHTML).toContain("Grandmaster");
  // Active tier row highlighted with star
  expect(container.innerHTML).toContain("ACTIVE");
});

test("renderProfileView displays whoami card, stat grid, and preferences", () => {
  store.state.user = {
    id: 7,
    username: "profile_ops",
    coins: 42,
    is_public: 1,
  };
  store.state.levelInfo = { level: 4, rank: "Practitioner", total_xp: 320 };
  store.state.stats = {
    streak_days: 6,
    focus_minutes: 310,
    totals: { total: 22, done: 15, archived: 0 },
  };

  const container = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  renderProfileView(container as any);

  expect(container.innerHTML).toContain("data-profile-view");
  expect(container.innerHTML).toContain("User Profile");
  expect(container.innerHTML).toContain("@profile_ops");
  expect(container.innerHTML).toContain("PUBLIC PROFILE");
  expect(container.innerHTML).toContain("Practitioner");
  expect(container.innerHTML).toContain("Level 4");
  expect(container.innerHTML).toContain("320 XP");
  expect(container.innerHTML).toContain("42");
  expect(container.innerHTML).toContain("6d");
  expect(container.innerHTML).toContain("310m");
});
