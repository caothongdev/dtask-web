// public/js/views/profile.js
// Profile / "whoami" summary view: identity card, stat grid, and stored preferences.
// Blueprint Silicon light theme.

import { api } from "../api.js";
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

export function renderProfileView(container) {
  if (!container) return;

  const user = store.state.user || {};
  const levelInfo = store.state.levelInfo || { level: 1, rank: "Apprentice", total_xp: 0 };
  const stats = store.state.stats || {};
  const username = user.username || "anonymous";
  const isPublic = !!user.is_public;

  container.innerHTML = `
    <div class="space-y-6" data-profile-view>
      <div class="max-w-2xl mx-auto bg-surface rounded-3xl border border-outline-variant shadow-card p-8">
        <div class="flex items-center gap-4 border-b border-outline-variant pb-6">
          <div class="w-16 h-16 rounded-2xl bg-stone-accent text-white flex items-center justify-center font-mono text-2xl font-bold shadow-card-md">
            ${escapeHtml(username[0] ? username[0].toUpperCase() : "?")}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-xl font-extrabold text-stone-accent font-mono">dtask::whoami</h2>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-md border font-bold ${
                isPublic
                  ? "bg-success-soft text-success border-emerald-200"
                  : "bg-surface-subtle text-outline border-outline-variant"
              }">${isPublic ? "PUBLIC PROFILE" : "PRIVATE PROFILE"}</span>
            </div>
            <p class="text-xs text-outline mt-0.5 truncate">@${escapeHtml(username)} · high-fidelity gamified productivity profile</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 my-6">
          <div class="p-4 bg-surface-subtle rounded-2xl border border-outline-variant">
            <span class="text-[10px] font-mono uppercase text-outline font-bold">Rank Title</span>
            <div class="text-base font-bold text-stone-accent mt-0.5" id="whoami-rank">${escapeHtml(levelInfo.rank || "Apprentice")}</div>
          </div>
          <div class="p-4 bg-surface-subtle rounded-2xl border border-outline-variant">
            <span class="text-[10px] font-mono uppercase text-outline font-bold">Current Level</span>
            <div class="text-base font-mono font-bold text-primary mt-0.5" id="whoami-level">Level ${levelInfo.level || 1}</div>
          </div>
          <div class="p-4 bg-surface-subtle rounded-2xl border border-outline-variant">
            <span class="text-[10px] font-mono uppercase text-outline font-bold">Accumulated XP</span>
            <div class="text-base font-mono font-bold text-indigo-600 mt-0.5" id="whoami-xp">${(levelInfo.total_xp || 0).toLocaleString()} XP</div>
          </div>
          <div class="p-4 bg-coin-soft rounded-2xl border border-amber-200">
            <span class="text-[10px] font-mono uppercase text-coin-amber font-bold">Coin Balance</span>
            <div class="text-base font-mono font-bold text-coin-amber mt-0.5" id="whoami-coins">${user.coins ?? 0} 🪙</div>
          </div>
        </div>

        <!-- Quick stats row -->
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="p-4 bg-surface-subtle rounded-2xl border border-outline-variant text-center">
            <span class="block text-[10px] font-mono uppercase text-outline font-bold">Streak</span>
            <span class="text-lg font-bold text-orange-600 mt-1 block">🔥 ${stats.streak_days ?? 0}d</span>
          </div>
          <div class="p-4 bg-surface-subtle rounded-2xl border border-outline-variant text-center">
            <span class="block text-[10px] font-mono uppercase text-outline font-bold">Focus Time</span>
            <span class="text-lg font-bold text-primary mt-1 block">⏱️ ${stats.focus_minutes ?? 0}m</span>
          </div>
          <div class="p-4 bg-surface-subtle rounded-2xl border border-outline-variant text-center">
            <span class="block text-[10px] font-mono uppercase text-outline font-bold">Completed</span>
            <span class="text-lg font-bold text-success mt-1 block">✓ ${stats.totals?.done ?? 0}</span>
          </div>
        </div>

        <!-- Preferences & Config -->
        <div class="border-t border-outline-variant pt-5 space-y-4">
          <h3 class="text-xs font-mono uppercase font-bold text-outline">Stored Preferences</h3>
          <div class="flex items-center justify-between text-xs gap-3">
            <div>
              <div class="font-semibold text-stone-accent">UI Theme</div>
              <div class="text-outline">Blueprint Light (stored per-user)</div>
            </div>
            <select id="theme-pref" class="border border-outline-variant rounded-xl px-2.5 py-1 text-xs bg-white text-stone-soft font-mono focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="light" selected>Blueprint Light (Default)</option>
              <option value="slate">Slate Minimal</option>
            </select>
          </div>
          <div class="flex items-center justify-between text-xs gap-3">
            <div>
              <div class="font-semibold text-stone-accent">Public Profile Board</div>
              <div class="text-outline">Expose read-only stats at /u/:handle</div>
            </div>
            <button id="profile-toggle-public-btn" class="px-3 py-1.5 rounded-xl border font-mono font-bold transition ${
              isPublic
                ? "bg-success-soft border-emerald-200 text-success"
                : "bg-white border-outline-variant text-secondary hover:border-primary hover:text-primary"
            }">
              ${isPublic ? "PUBLIC ✓" : "MAKE PUBLIC"}
            </button>
          </div>
          <div class="flex items-center justify-between text-xs gap-3">
            <div>
              <div class="font-semibold text-stone-accent">API Key</div>
              <div class="text-outline font-mono text-[10px]">Use with the dtask CLI / direct JSON API</div>
            </div>
            <button id="profile-copy-key-btn" class="px-3 py-1.5 rounded-xl border border-outline-variant bg-white hover:border-primary text-secondary hover:text-primary font-mono font-bold transition">
              COPY KEY
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Toggle public profile
  container.querySelector("#profile-toggle-public-btn")?.addEventListener("click", async () => {
    try {
      await api.updateMe({ is_public: !isPublic });
      store.showToast(isPublic ? "Profile set to private" : "Profile is now public at /u/" + username, "success");
      await store.refreshUserAndStats();
      renderProfileView(container);
    } catch (err) {
      store.showToast(err.message || "Failed to update profile", "error");
    }
  });

  // Copy API key
  container.querySelector("#profile-copy-key-btn")?.addEventListener("click", async () => {
    const key = api.getToken() || "";
    if (!key) {
      store.showToast("No API key found — log in first", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(key);
      store.showToast("API key copied to clipboard", "success");
    } catch {
      store.showToast("Clipboard unavailable — open Settings via avatar instead", "info");
    }
  });
}
