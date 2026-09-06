// public/js/views/shop.js
// Rewards Shop & Loot view with live coin purchases, locked/unlocked states,
// custom reward creation drawer, and transaction audit ledger.

import { api } from "../api.js";
import { sound } from "../audio.js";
import { store } from "../store.js";

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatCoins(amount) {
  const num = parseInt(amount, 10) || 0;
  return `⟐ ${num.toLocaleString()} COINS`;
}

export function renderAsciiBar(pct = 0, blocks = 16) {
  const safePct = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round((safePct / 100) * blocks);
  const empty = Math.max(0, blocks - filled);
  return "█".repeat(filled) + "░".repeat(empty);
}

export function formatLedgerTime(isoStr) {
  if (!isoStr) return "--:--";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch {
    return String(isoStr);
  }
}

// ── Live Purchasing Action ──────────────────────────────────────────────
export async function buyReward(rewardId) {
  const rewards = store.state.rewards || [];
  const reward = rewards.find((r) => r.id === rewardId);

  try {
    const res = await api.buyReward(rewardId);
    sound.playCoinTick();

    if (store.state.user && res.coins_left !== undefined) {
      store.state.user.coins = res.coins_left;
      store.state.user.lifetime_spent = (store.state.user.lifetime_spent || 0) + (reward?.cost || 0);
    }

    const rewardName = res.reward?.name || reward?.name || "Reward";
    store.showToast(`Purchased "${rewardName}" (-${reward?.cost || res.reward?.cost || 0} 🪙)`, "success");

    // Refresh user, stats, rewards, and transaction audit records
    await Promise.allSettled([
      store.refreshUserAndStats(),
      store.refreshRewards(),
      store.refreshTransactions(),
    ]);

    // Timed reward triggers Relax Daemon handover & navigation to #focus
    const mins = res.relax_mins !== undefined ? res.relax_mins : reward?.mins;
    const isTimed = (res.reward?.type || reward?.type) === "timed" || (mins && mins > 0);

    if (isTimed && mins > 0) {
      store.startRelaxTimer(mins, rewardName);
      if (typeof window !== "undefined") {
        window.location.hash = "focus";
      }
    }

    return res;
  } catch (err) {
    const msg = err.message || "Failed to purchase reward";
    store.showToast(msg, "error");
    throw err;
  }
}

// ── Custom Reward Creation Modal ─────────────────────────────────────────
export function openCreateRewardDialog() {
  if (typeof document === "undefined") return;
  const dialog = document.getElementById("custom-reward-dialog");
  if (dialog && typeof dialog.showModal === "function") {
    dialog.showModal();
  }
}

export function closeCreateRewardDialog() {
  if (typeof document === "undefined") return;
  const dialog = document.getElementById("custom-reward-dialog");
  if (dialog && typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  }
}

// ── View Cleanup ────────────────────────────────────────────────────────
export function cleanupShopView() {
  closeCreateRewardDialog();
}

// ── Main Shop View Renderer ──────────────────────────────────────────────
export function renderShopView(container) {
  if (!container) return;

  const user = store.state.user || {};
  const currentCoins = user.coins ?? 0;
  const lifetimeEarned = user.lifetime_earned ?? currentCoins;
  const lifetimeSpent = user.lifetime_spent ?? 0;

  // Background fetch if rewards or transactions have not been fetched yet
  if (!store.state.rewards || store.state.rewards.length === 0) {
    store.refreshRewards();
  }
  if (!store.state.transactions || store.state.transactions.length === 0) {
    store.refreshTransactions();
  }

  const rewards = store.state.rewards || [];
  const transactions = store.state.transactions || [];

  container.innerHTML = `
    <div class="max-w-6xl mx-auto space-y-8" data-shop-view>
      <!-- Top Economy HUD / Banner -->
      <section class="p-6 bg-surface border border-outline-variant">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="font-space text-xs font-bold tracking-widest text-stone-accent">[SYS: ECONOMY_HUD v2.4]</span>
              <span class="text-outline-variant">/</span>
              <span class="font-mono text-xs text-outline">COIN_LEDGER_ONLINE</span>
            </div>
            <div class="flex items-baseline gap-4 flex-wrap">
              <h1 class="font-space text-3xl font-extrabold tracking-tight text-primary">
                ⟐ ${currentCoins.toLocaleString()} <span class="text-sm font-mono font-normal text-secondary">COINS</span>
              </h1>
              <div class="flex items-center gap-3 text-xs font-mono">
                <span class="px-2 py-0.5 bg-surface-container border border-outline-variant text-stone-accent">
                  EARNED: +${lifetimeEarned.toLocaleString()} 🪙
                </span>
                <span class="px-2 py-0.5 bg-surface-container border border-outline-variant text-secondary">
                  SPENT: -${lifetimeSpent.toLocaleString()} 🪙
                </span>
              </div>
            </div>
            <p class="font-geist text-xs text-secondary">
              Redeem banked coins for timed guilt-free recreation breaks or instant real-world bounties.
            </p>
          </div>

          <!-- Top Actions -->
          <div class="flex items-center gap-3">
            <button
              id="shop-add-reward-btn"
              class="px-4 py-2 bg-primary text-surface hover:bg-stone-accent font-mono text-xs font-bold tracking-wide transition-colors flex items-center gap-2"
            >
              <span class="material-symbols-outlined text-sm font-bold">add</span>
              <span>[+ NEW REWARD]</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Rewards Catalog Section -->
      <section class="space-y-4">
        <div class="flex items-center justify-between border-b border-outline-variant pb-2">
          <div class="flex items-center gap-2">
            <span class="font-space text-sm font-bold text-primary">+-.[ REWARDS CATALOG // EXPENDITURE PROTOCOLS ].-+</span>
            <span class="font-mono text-xs text-outline">(${rewards.length} ITEMS AVAILABLE)</span>
          </div>
          <span class="font-mono text-[11px] text-outline">AUTO_SYNC // ACTIVE</span>
        </div>

        ${rewards.length === 0 ? `
          <div class="p-12 text-center bg-surface border border-outline-variant font-mono text-secondary">
            <p class="font-space text-sm text-primary mb-2">+-.[ NO REWARDS CONFIGURED ].-+</p>
            <p class="text-xs">Click [+ NEW REWARD] to create custom rewards or refresh the catalogue.</p>
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${rewards.map((reward) => {
              const isLocked = currentCoins < reward.cost || reward.is_locked;
              const neededCoins = Math.max(0, reward.cost - currentCoins);
              const isTimed = reward.type === "timed" || (reward.mins && reward.mins > 0);

              return `
                <div class="bg-surface border ${isLocked ? 'border-outline-variant/60 opacity-85' : 'border-outline hover:border-primary'} p-5 flex flex-col justify-between transition-all group" data-reward-card="${reward.id}">
                  <div class="space-y-3">
                    <div class="flex items-center justify-between">
                      <div class="w-12 h-12 flex items-center justify-center text-2xl bg-surface-container border border-outline-variant select-none">
                        ${escapeHtml(reward.icon || "🎁")}
                      </div>
                      <div class="text-right font-mono space-y-1">
                        <span class="text-[10px] text-outline block">#${String(reward.id).padStart(2, "0")}</span>
                        <span class="text-[11px] px-2 py-0.5 font-medium border ${isTimed ? 'border-stone-accent/50 text-stone-accent bg-surface-container' : 'border-outline-variant text-secondary bg-surface-container-low'}">
                          ${isTimed ? `⏱ ${reward.mins || 15}m TIMER` : "⚡ INSTANT"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h3 class="font-space font-bold text-base text-primary tracking-tight leading-snug group-hover:text-stone-accent transition-colors">
                        ${escapeHtml(reward.name)}
                      </h3>
                      <div class="flex items-center gap-2 mt-2">
                        <span class="font-mono text-sm font-bold ${isLocked ? 'text-outline' : 'text-primary'}">
                          ⟐ ${reward.cost} COINS
                        </span>
                        ${isTimed ? `
                          <span class="text-[11px] font-mono text-secondary">· ${reward.mins}m break</span>
                        ` : `
                          <span class="text-[11px] font-mono text-secondary">· instant loot</span>
                        `}
                      </div>
                    </div>
                  </div>

                  <div class="pt-5 mt-4 border-t border-outline-variant/40">
                    ${isLocked ? `
                      <button
                        disabled
                        class="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant text-outline font-mono text-xs flex items-center justify-center gap-2 cursor-not-allowed select-none"
                      >
                        <span class="material-symbols-outlined text-xs text-outline">lock</span>
                        <span>[LOCKED] Need ${neededCoins} more 🪙</span>
                      </button>
                    ` : `
                      <button
                        type="button"
                        data-action="buy-reward"
                        data-reward-id="${reward.id}"
                        class="w-full px-4 py-2 bg-primary text-surface hover:bg-stone-accent font-mono text-xs font-bold tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span class="material-symbols-outlined text-sm font-bold">shopping_cart</span>
                        <span>[BUY REWARD]</span>
                      </button>
                    `}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      </section>

      <!-- Recent Transactions Audit Feed Section -->
      <section class="space-y-4 pt-4">
        <div class="flex items-center justify-between border-b border-outline-variant pb-2">
          <div class="flex items-center gap-2">
            <span class="font-space text-sm font-bold text-primary">+-.[ TRANSACTION AUDIT LEDGER // RECENT ACTIVITY ].-+</span>
            <span class="font-mono text-xs text-outline">(LAST 50 RECORDS)</span>
          </div>
          <button
            id="shop-refresh-ledger-btn"
            class="text-xs font-mono text-secondary hover:text-primary transition-colors flex items-center gap-1"
          >
            <span class="material-symbols-outlined text-xs">refresh</span>
            <span>Refresh</span>
          </button>
        </div>

        <div class="bg-surface border border-outline-variant overflow-x-auto">
          ${transactions.length === 0 ? `
            <div class="p-8 text-center text-secondary font-mono text-xs">
              No transactions logged yet. Complete tasks or buy rewards to write ledger entries.
            </div>
          ` : `
            <table class="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr class="bg-surface-container-lowest border-b border-outline-variant text-outline text-[11px]">
                  <th class="py-2.5 px-4 font-normal">TIMESTAMP</th>
                  <th class="py-2.5 px-4 font-normal">EVENT_TYPE</th>
                  <th class="py-2.5 px-4 font-normal text-right">DELTA</th>
                  <th class="py-2.5 px-4 font-normal">AUDIT_REASON</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-variant/40">
                ${transactions.map((tx) => {
                  const isEarn = tx.type === "earn";
                  const isSpend = tx.type === "spend";
                  const deltaSign = isEarn ? "+" : "-";
                  const deltaColor = isEarn ? "text-stone-accent font-bold" : isSpend ? "text-secondary-fixed" : "text-red-400";
                  const badgeClass = isEarn
                    ? "text-stone-accent bg-surface-container border-outline-variant"
                    : isSpend
                    ? "text-secondary-fixed bg-surface-container border-outline-variant"
                    : "text-red-400 bg-surface-container border-red-900";

                  return `
                    <tr class="hover:bg-surface-container/50 transition-colors">
                      <td class="py-2.5 px-4 text-outline whitespace-nowrap">
                        ${formatLedgerTime(tx.created_at)}
                      </td>
                      <td class="py-2.5 px-4 whitespace-nowrap">
                        <span class="px-1.5 py-0.5 border text-[10px] uppercase ${badgeClass}">
                          [${escapeHtml(tx.type || "unknown")}]
                        </span>
                      </td>
                      <td class="py-2.5 px-4 text-right whitespace-nowrap ${deltaColor}">
                        ${deltaSign}${tx.amount} 🪙
                      </td>
                      <td class="py-2.5 px-4 text-primary max-w-md truncate">
                        ${escapeHtml(tx.reason || "System transaction")}
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          `}
        </div>
      </section>

      <!-- Custom Reward Creation Dialog -->
      <dialog id="custom-reward-dialog" class="bg-surface border border-outline text-primary p-6 max-w-md w-full shadow-2xl backdrop:bg-black/80">
        <form method="dialog" id="custom-reward-form" class="space-y-4">
          <div class="border-b border-outline-variant pb-3 flex items-center justify-between">
            <h2 class="font-space text-base font-bold text-primary">+-.[ CONFIGURE NEW REWARD ].-+</h2>
            <button type="button" id="custom-reward-close-x" class="text-outline hover:text-primary font-mono text-sm">✕</button>
          </div>

          <div>
            <label class="block text-xs font-mono text-secondary mb-1">Reward Name *</label>
            <input
              id="custom-reward-name"
              type="text"
              required
              maxlength="100"
              placeholder="e.g. 20m Anime Episode / Espresso Break"
              class="w-full bg-surface-container-lowest border border-outline px-3 py-2 text-xs font-mono text-primary focus:outline-none focus:border-primary"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-mono text-secondary mb-1">Cost (🪙 Coins) *</label>
              <input
                id="custom-reward-cost"
                type="number"
                required
                min="1"
                value="20"
                class="w-full bg-surface-container-lowest border border-outline px-3 py-2 text-xs font-mono text-primary focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label class="block text-xs font-mono text-secondary mb-1">Icon Emoji</label>
              <input
                id="custom-reward-icon"
                type="text"
                maxlength="8"
                value="🎁"
                class="w-full bg-surface-container-lowest border border-outline px-3 py-2 text-xs font-mono text-primary text-center focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-mono text-secondary mb-1">Reward Type</label>
              <select
                id="custom-reward-type"
                class="w-full bg-surface-container-lowest border border-outline px-2.5 py-2 text-xs font-mono text-primary focus:outline-none focus:border-primary"
              >
                <option value="timed">Timed Break (Launch Relax Timer)</option>
                <option value="instant">Instant Loot (No Timer)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-mono text-secondary mb-1">Duration (Minutes)</label>
              <input
                id="custom-reward-mins"
                type="number"
                min="0"
                value="20"
                class="w-full bg-surface-container-lowest border border-outline px-3 py-2 text-xs font-mono text-primary focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <p class="text-[11px] font-geist text-outline pt-1">
            * Timed rewards trigger the Relax Daemon cooldown clock upon purchase.
          </p>

          <div class="flex justify-end gap-2 pt-3 border-t border-outline-variant/40 font-mono text-xs">
            <button
              type="button"
              id="custom-reward-cancel-btn"
              class="px-4 py-2 border border-outline-variant hover:border-outline text-secondary hover:text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-primary text-surface font-bold hover:bg-stone-accent transition-colors"
            >
              [+ CREATE REWARD]
            </button>
          </div>
        </form>
      </dialog>
    </div>
  `;

  // Attach interactive event listeners
  const addBtn = container.querySelector("#shop-add-reward-btn");
  if (addBtn) {
    addBtn.onclick = () => openCreateRewardDialog();
  }

  const refreshLedgerBtn = container.querySelector("#shop-refresh-ledger-btn");
  if (refreshLedgerBtn) {
    refreshLedgerBtn.onclick = async () => {
      await store.refreshTransactions();
      renderShopView(container);
    };
  }

  // Buy buttons
  const buyButtons = container.querySelectorAll("button[data-action='buy-reward']");
  buyButtons.forEach((btn) => {
    btn.onclick = async () => {
      const id = parseInt(btn.getAttribute("data-reward-id"), 10);
      if (id) {
        btn.disabled = true;
        btn.textContent = "Purchasing...";
        try {
          await buyReward(id);
        } catch {
          btn.disabled = false;
          btn.innerHTML = `<span class="material-symbols-outlined text-sm font-bold">shopping_cart</span><span>[BUY REWARD]</span>`;
        }
      }
    };
  });

  // Dialog listeners
  const dialog = container.querySelector("#custom-reward-dialog");
  const form = container.querySelector("#custom-reward-form");
  const cancelBtn = container.querySelector("#custom-reward-cancel-btn");
  const closeX = container.querySelector("#custom-reward-close-x");
  const typeSelect = container.querySelector("#custom-reward-type");
  const minsInput = container.querySelector("#custom-reward-mins");

  if (typeSelect && minsInput) {
    typeSelect.onchange = () => {
      if (typeSelect.value === "instant") {
        minsInput.value = "0";
        minsInput.disabled = true;
      } else {
        if (minsInput.value === "0") minsInput.value = "20";
        minsInput.disabled = false;
      }
    };
  }

  if (cancelBtn) cancelBtn.onclick = () => closeCreateRewardDialog();
  if (closeX) closeX.onclick = () => closeCreateRewardDialog();

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const nameInput = container.querySelector("#custom-reward-name");
      const costInput = container.querySelector("#custom-reward-cost");
      const iconInput = container.querySelector("#custom-reward-icon");

      const name = (nameInput?.value || "").trim();
      const cost = parseInt(costInput?.value, 10);
      const mins = typeSelect?.value === "instant" ? 0 : parseInt(minsInput?.value || "0", 10);
      const type = typeSelect?.value || (mins > 0 ? "timed" : "instant");
      const icon = (iconInput?.value || "").trim() || "🎁";

      if (!name) {
        alert("Please enter a reward name.");
        return;
      }
      if (isNaN(cost) || cost < 1) {
        alert("Cost must be at least 1 coin.");
        return;
      }

      try {
        await api.createReward({ name, cost, mins, type, icon });
        sound.playCoinTick();
        store.showToast(`Created reward: "${name}"`, "success");
        closeCreateRewardDialog();
        await store.refreshRewards();
        renderShopView(container);
      } catch (err) {
        alert(err.message || "Failed to create reward");
      }
    };
  }
}
