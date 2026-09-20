// public/js/views/level.js
// Level & Rank Tiers view: XP progression banner + official tier reference table.
// Blueprint Silicon light theme.

import { store } from "../store.js";
import { icons } from "../icons.js";
import { RPG_TIERS, getTierIndexForLevel, renderAsciiBar } from "./telemetry.js";

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderLevelView(container) {
  if (!container) return;

  const user = store.state.user || {};
  const levelInfo = store.state.levelInfo || {
    level: 1,
    rank: "Apprentice",
    prog_xp: 0,
    needed_xp: 100,
    pct: 0,
    total_xp: 0,
  };

  const currentLevel = levelInfo.level || 1;
  const currentRank = levelInfo.rank || "Apprentice";
  const progXp = levelInfo.prog_xp || 0;
  const neededXp = levelInfo.needed_xp || 100;
  const pct = Math.min(100, Math.max(0, Math.round(levelInfo.pct ?? (progXp / neededXp) * 100)));
  const totalXp = levelInfo.total_xp || 0;
  const currentTierIndex = getTierIndexForLevel(currentLevel);

  container.innerHTML = `
    <div class="space-y-6 max-w-5xl mx-auto" data-level-view>
      <!-- Level Banner -->
      <div class="bg-surface rounded-3xl border border-outline-variant shadow-card p-6 flex flex-col md:flex-row items-center gap-6">
        <div class="w-24 h-24 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex flex-col items-center justify-center font-mono shadow-md shadow-blue-500/25 shrink-0">
          <span class="text-xs opacity-75 font-bold">LEVEL</span>
          <span class="text-3xl font-extrabold" id="level-view-badge">${currentLevel}</span>
        </div>
        <div class="flex-1 space-y-2 text-center md:text-left w-full">
          <div class="flex flex-col sm:flex-row sm:items-center gap-2 justify-center md:justify-start">
            <h2 class="text-xl font-extrabold text-stone-accent" id="level-view-rank">${escapeHtml(currentRank)}</h2>
            <span class="px-2 py-0.5 bg-primary-soft text-primary text-xs font-mono font-bold rounded-md border border-blue-200" id="level-view-xp-needed">
              ${neededXp - progXp} XP to Level ${currentLevel + 1}
            </span>
          </div>
          <p class="text-xs text-outline">
            XP Math Engine: Every completed task awards its XP value directly to your progress bar. Higher level thresholds unlock higher operator titles.
          </p>

          <div class="pt-2">
            <div class="flex justify-between text-xs font-mono font-semibold text-secondary mb-1">
              <span>Progress to Next Level</span>
              <span id="level-view-percent">${pct}%</span>
            </div>
            <div class="w-full bg-surface-container-high rounded-full h-3 overflow-hidden border border-outline-variant">
              <div id="level-view-bar" class="bg-primary h-3 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
            </div>
            <div class="flex justify-between text-[11px] font-mono text-outline mt-1">
              <span>${progXp} / ${neededXp} XP in current cycle</span>
              <span>${totalXp.toLocaleString()} total XP</span>
            </div>
          </div>

          <!-- Optional hidden meter for compatibility -->
          <div class="hidden">
            ${renderAsciiBar(pct, 32)}
          </div>
        </div>
      </div>

      <!-- Rank Tier Reference Table -->
      <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-6">
        <h3 class="font-bold text-stone-accent text-sm mb-3 font-sans">Official Operator Rank Tiers</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs" id="rank-tiers-table">
            <thead class="bg-surface-subtle text-outline font-mono border-y border-outline-variant">
              <tr>
                <th class="py-2.5 px-4 uppercase text-[10px]">Tier</th>
                <th class="py-2.5 px-4 uppercase text-[10px]">Title</th>
                <th class="py-2.5 px-4 uppercase text-[10px]">Level Range</th>
                <th class="py-2.5 px-4 uppercase text-[10px]">Description</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/60 font-sans">
              ${RPG_TIERS.map((tier, idx) => {
                const isCurrent = idx === currentTierIndex;
                return `
                  <tr class="${isCurrent ? "bg-primary-soft font-semibold" : "hover:bg-surface-subtle/60"} transition-colors">
                    <td class="py-2.5 px-4 font-mono font-bold text-primary">
                      <span class="inline-flex items-center gap-1.5">
                        <span>Level ${tier.minLvl}+</span>
                        ${isCurrent ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary text-white text-[9px] font-bold">${icons.star("w-3 h-3 text-amber-300")} ACTIVE</span>` : ""}
                      </span>
                    </td>
                    <td class="py-2.5 px-4 text-stone-accent">${escapeHtml(tier.name)}</td>
                    <td class="py-2.5 px-4 font-mono text-secondary">${tier.minLvl} – ${tier.maxLvl >= 999 ? "∞" : tier.maxLvl}</td>
                    <td class="py-2.5 px-4 text-outline">${escapeHtml(tier.description)}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
