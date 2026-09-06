import { test, expect, afterAll } from "bun:test";
import { xpForLevel, getLevelInfo, addXpAndCoins, server, db } from "../server";

afterAll(() => {
  server?.stop(true);
});

test("xpForLevel matches dtask curve: 100, 120, 140, 160...", () => {
  expect(xpForLevel(1)).toBe(100);
  expect(xpForLevel(2)).toBe(120);
  expect(xpForLevel(3)).toBe(140);
  expect(xpForLevel(4)).toBe(160);
});

test("getLevelInfo computes accurate rank and progress", () => {
  // 0 XP -> Level 1 Apprentice
  const l1 = getLevelInfo(0);
  expect(l1.level).toBe(1);
  expect(l1.rank).toBe("Apprentice");
  expect(l1.prog_xp).toBe(0);
  expect(l1.needed_xp).toBe(100);
  expect(l1.pct).toBe(0);

  // 150 XP -> Level 2 (100 used for L1, 50/120 into L2)
  const l2 = getLevelInfo(150);
  expect(l2.level).toBe(2);
  expect(l2.rank).toBe("Apprentice");
  expect(l2.prog_xp).toBe(50);
  expect(l2.needed_xp).toBe(120);
  expect(l2.pct).toBe(41.7);

  // Ranks across tiers
  // Level 10 -> Journeyman (need: 100+120+140+160+180+200+220+240+260 = 1620 XP)
  expect(getLevelInfo(1620).level).toBe(10);
  expect(getLevelInfo(1620).rank).toBe("Journeyman");

  // High XP ranks
  expect(getLevelInfo(2000).level).toBeGreaterThanOrEqual(10);
});

test("addXpAndCoins updates user coins, handles level up bonus, and logs transactions", () => {
  const username = "tester_xp_" + Date.now();
  const info = db.query("INSERT INTO users (username, api_key) VALUES (?, ?)").run(username, "key_" + Date.now());
  const userId = Number(info.lastInsertRowid);

  // Initial state: 0 coins, 0 XP
  // First task: 50 XP, 20 coins
  const res1 = addXpAndCoins(db, userId, 50, 20, "Completed reading chapter");
  expect(res1.newLvl).toBe(1);
  expect(res1.bonusCoins).toBe(0);
  expect(res1.totalXp).toBe(50);

  const u1 = db.query("SELECT coins, lifetime_earned FROM users WHERE id = ?").get(userId) as any;
  expect(u1.coins).toBe(20);
  expect(u1.lifetime_earned).toBe(20);

  // Insert the 50 XP task into tasks table so DB total_xp reflects prior progress
  db.query("INSERT INTO tasks (user_id, category, title, status, xp) VALUES (?, 'read', 'Chapter 1', 'done', 50)").run(userId);

  // Now add 60 XP for task 2 (50 existing + 60 = 110 XP -> Level 2!). L1 needed 100 XP.
  // Level 1 -> Level 2 grants (2 - 1) * 50 = 50 bonus coins!
  const res2 = addXpAndCoins(db, userId, 60, 10, "Finished coding task");
  expect(res2.newLvl).toBe(2);
  expect(res2.bonusCoins).toBe(50);
  expect(res2.totalXp).toBe(110);

  const u2 = db.query("SELECT coins, lifetime_earned FROM users WHERE id = ?").get(userId) as any;
  // 20 prior + 10 earned + 50 bonus = 80 coins
  expect(u2.coins).toBe(80);
  expect(u2.lifetime_earned).toBe(80);

  // Check transaction log
  const txs = db.query("SELECT * FROM transactions WHERE user_id = ? ORDER BY id ASC").all(userId) as any[];
  expect(txs.length).toBe(2);
  expect(txs[0].type).toBe("earn");
  expect(txs[0].amount).toBe(20);
  expect(txs[1].type).toBe("earn");
  expect(txs[1].amount).toBe(60); // 10 + 50
  expect(txs[1].reason).toContain("Level Up bonus");
});

test("Rewards and Transactions API workflow", async () => {
  const base = `http://localhost:${server.port}/api`;
  const username = "gamer_" + Date.now();

  // Register user
  const regRes = await fetch(`${base}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const { user } = await regRes.json();
  const auth = { Authorization: `Bearer ${user.api_key}` };

  // Check initial me endpoint
  const meRes = await fetch(`${base}/me`, { headers: auth });
  const me = await meRes.json();
  expect(me.user.coins).toBe(0);
  expect(me.level_info.level).toBe(1);
  expect(me.wallet.coins).toBe(0);
  expect(me.wallet.lifetime_earned).toBe(0);
  expect(me.wallet.lifetime_spent).toBe(0);

  // Rewards list
  const rewRes = await fetch(`${base}/rewards`, { headers: auth });
  const rewData = await rewRes.json();
  expect(rewData.rewards.length).toBeGreaterThan(0);
  expect(rewData.rewards[0].is_locked).toBe(true); // 0 coins -> locked
  expect(rewData.rewards[0].needed_coins).toBe(rewData.rewards[0].cost);

  // Try to buy without enough coins -> 400
  const buyRes = await fetch(`${base}/rewards/${rewData.rewards[0].id}/buy`, {
    method: "POST",
    headers: auth,
  });
  expect(buyRes.status).toBe(400);
  const buyErr = await buyRes.json();
  expect(buyErr.error).toBe("Insufficient coins");
  expect(buyErr.required).toBe(rewData.rewards[0].cost);

  // Create a custom reward
  const addRes = await fetch(`${base}/rewards`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Custom Break", cost: 5, mins: 10, type: "timed", icon: "🍵" }),
  });
  expect(addRes.status).toBe(201);
  const { reward: customReward } = await addRes.json();
  expect(customReward.name).toBe("Custom Break");
  expect(customReward.cost).toBe(5);
  expect(customReward.mins).toBe(10);
  expect(customReward.type).toBe("timed");
  expect(customReward.icon).toBe("🍵");

  // Validate custom reward rejection for invalid input
  const invalidAddRes = await fetch(`${base}/rewards`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", cost: -1 }),
  });
  expect(invalidAddRes.status).toBe(400);

  // Give user 100 coins using addXpAndCoins
  addXpAndCoins(db, user.id, 0, 100, "Admin bonus for testing");

  // Verify wallet updated on /me
  const meUpdatedRes = await fetch(`${base}/me`, { headers: auth });
  const meUpdated = await meUpdatedRes.json();
  expect(meUpdated.user.coins).toBe(100);
  expect(meUpdated.wallet.coins).toBe(100);

  // Rewards list should show unlocked custom reward
  const rewRes2 = await fetch(`${base}/rewards`, { headers: auth });
  const rewData2 = await rewRes2.json();
  const foundCustom = rewData2.rewards.find((r: any) => r.id === customReward.id);
  expect(foundCustom).toBeDefined();
  expect(foundCustom.is_locked).toBe(false);
  expect(foundCustom.needed_coins).toBe(0);

  // Buy the custom reward
  const buySuccessRes = await fetch(`${base}/rewards/${customReward.id}/buy`, {
    method: "POST",
    headers: auth,
  });
  expect(buySuccessRes.status).toBe(200);
  const buySuccess = await buySuccessRes.json();
  expect(buySuccess.ok).toBe(true);
  expect(buySuccess.coins_left).toBe(95);
  expect(buySuccess.relax_mins).toBe(10);

  // Check transactions feed exists and has our transactions
  const txRes = await fetch(`${base}/transactions`, { headers: auth });
  const txData = await txRes.json();
  expect(Array.isArray(txData.transactions)).toBe(true);
  expect(txData.transactions.length).toBeGreaterThanOrEqual(2); // earn + spend
  const spendTx = txData.transactions.find((t: any) => t.type === "spend");
  expect(spendTx).toBeDefined();
  expect(spendTx.amount).toBe(5);
  expect(spendTx.reward_id).toBe(customReward.id);
});
