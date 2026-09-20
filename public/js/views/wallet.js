// public/js/views/wallet.js
// Wallet & Transaction Ledger view: coin balance cards + full authoritative ledger table.
// Blueprint Silicon light theme.

import { store } from "../store.js";
import { icons } from "../icons.js";

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTs(isoStr) {
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

export function renderWalletView(container) {
  if (!container) return;

  const user = store.state.user || {};
  const balance = user.coins ?? 0;
  const lifetimeEarned = user.lifetime_earned ?? balance;
  const lifetimeSpent = user.lifetime_spent ?? 0;
  const transactions = store.state.transactions || [];

  container.innerHTML = `
    <div class="space-y-6" data-wallet-view>
      <!-- Balance Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-5 text-white shadow-md shadow-amber-500/20">
          <div class="flex items-center justify-between opacity-85 text-xs font-mono font-bold">
            <span>CURRENT COIN BALANCE</span>
            <span>${icons.coin("w-5 h-5 text-amber-100")}</span>
          </div>
          <div class="text-3xl font-extrabold font-mono mt-2 flex items-center gap-2" id="wallet-balance-big">
            <span>${balance.toLocaleString()}</span>
            <span class="text-xs font-mono font-normal opacity-90">COINS</span>
          </div>
          <p class="text-xs text-amber-100 mt-1">100% reversible via task toggling</p>
        </div>

        <div class="bg-surface rounded-2xl p-5 border border-outline-variant shadow-card">
          <div class="text-outline text-xs font-mono font-bold uppercase">Total Earned All-Time</div>
          <div class="text-2xl font-extrabold font-mono text-success mt-2 flex items-center gap-1.5" id="wallet-total-earned">
            <span>+${lifetimeEarned.toLocaleString()}</span>
            ${icons.coin("w-5 h-5 text-success")}
          </div>
          <p class="text-xs text-success mt-1 font-semibold">From completed work items</p>
        </div>

        <div class="bg-surface rounded-2xl p-5 border border-outline-variant shadow-card">
          <div class="text-outline text-xs font-mono font-bold uppercase">Total Spent on Rewards</div>
          <div class="text-2xl font-extrabold font-mono text-primary mt-2 flex items-center gap-1.5" id="wallet-total-spent">
            <span>-${lifetimeSpent.toLocaleString()}</span>
            ${icons.coin("w-5 h-5 text-primary")}
          </div>
          <p class="text-xs text-primary mt-1 font-semibold">Redeemed in shop</p>
        </div>
      </div>

      <!-- Ledger Table -->
      <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-stone-accent text-sm font-sans">Full Transaction Ledger (Authoritative)</h3>
          <span class="text-xs font-mono text-outline">Most recent first</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-surface-subtle text-outline font-mono border-y border-outline-variant">
              <tr>
                <th class="py-2.5 px-4 uppercase text-[10px]">Type</th>
                <th class="py-2.5 px-4 uppercase text-[10px]">Amount</th>
                <th class="py-2.5 px-4 uppercase text-[10px]">Reason / Source</th>
                <th class="py-2.5 px-4 uppercase text-[10px] text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody id="wallet-transactions-body" class="divide-y divide-outline-variant/60">
              ${
                transactions.length === 0
                  ? `<tr><td colspan="4" class="text-center py-8 text-outline font-mono">No transactions recorded yet. Complete tasks or buy rewards to write ledger entries.</td></tr>`
                  : transactions
                      .map((tx) => {
                        const isEarn = tx.type === "earn";
                        const isSpend = tx.type === "spend";
                        const badgeClass = isEarn
                          ? "bg-success-soft text-success border-emerald-200"
                          : isSpend
                          ? "bg-primary-soft text-primary border-blue-200"
                          : "bg-warning-soft text-warning border-amber-200";
                        const sign = tx.amount > 0 ? `+${tx.amount}` : `${tx.amount}`;

                        return `
                  <tr class="hover:bg-surface-subtle/60 transition-colors">
                    <td class="py-2.5 px-4">
                      <span class="px-2 py-0.5 rounded-md border font-mono font-bold text-[10px] uppercase ${badgeClass}">${escapeHtml(tx.type || "unknown")}</span>
                    </td>
                    <td class="py-2.5 px-4 font-mono font-bold ${tx.amount > 0 ? "text-success" : "text-stone-accent"}">
                      <span class="inline-flex items-center gap-1">
                        <span>${sign}</span>
                        ${icons.coin("w-3.5 h-3.5 text-amber-500")}
                      </span>
                    </td>
                    <td class="py-2.5 px-4 text-stone-soft font-medium">${escapeHtml(tx.reason || "System transaction")}</td>
                    <td class="py-2.5 px-4 text-right text-outline font-mono">${formatTs(tx.created_at)}</td>
                  </tr>
                `;
                      })
                      .join("")
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
