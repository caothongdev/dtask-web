// public/js/views/telemetry.js
// RPG Gamification Telemetry, Tier Progression Pathway, XP Buffer Meter,
// 7-Day Velocity Histogram, and Category Allocation Metrics.

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

// ── Pure Calculation & Visualization Helpers ───────────────────────────

export function renderAsciiBar(pct = 0, blocks = 20) {
  const safePct = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round((safePct / 100) * blocks);
  const empty = Math.max(0, blocks - filled);
  return "█".repeat(filled) + "░".repeat(empty);
}

export const RPG_TIERS = [
  { name: "Apprentice", minLvl: 1, maxLvl: 9, description: "Foundational operator learning task loops" },
  { name: "Practitioner", minLvl: 10, maxLvl: 19, description: "Consistent daily execution and discipline" },
  { name: "Adept", minLvl: 20, maxLvl: 39, description: "Deep focus mastery and high velocity flow" },
  { name: "Champion", minLvl: 40, maxLvl: 49, description: "Peak endurance with multi-hour deep work" },
  { name: "Grandmaster", minLvl: 50, maxLvl: 999, description: "Transcendent productivity and autonomous execution" },
];

export function getTierIndexForLevel(lvl = 1) {
  const level = Math.max(1, lvl || 1);
  if (level >= 50) return 4;
  if (level >= 40) return 3;
  if (level >= 20) return 2;
  if (level >= 10) return 1;
  return 0;
}

export function calculateCategoryBreakdown(tasks = [], categories = ["code", "learn", "health", "read", "build"]) {
  const cats = categories.length > 0 ? categories : ["code", "learn", "health", "read", "build"];
  return cats.map((cat) => {
    const catTasks = tasks.filter((t) => (t.category || "code").toLowerCase() === cat.toLowerCase());
    const total = catTasks.length;
    const done = catTasks.filter((t) => t.status === "done").length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const totalMins = catTasks.reduce((acc, t) => acc + (t.mins || 0), 0);
    const completedMins = catTasks.filter((t) => t.status === "done").reduce((acc, t) => acc + (t.mins || 0), 0);

    return {
      category: cat,
      total,
      done,
      pct,
      totalMins,
      completedMins,
    };
  });
}

export function calculateVelocityStats(activity7d = []) {
  const safeActivity = Array.isArray(activity7d) ? activity7d : [];
  const counts = safeActivity.map((a) => a.count || 0);
  const maxDaily = Math.max(1, ...counts);
  const totalCount = counts.reduce((sum, c) => sum + c, 0);
  const totalXp = totalCount * 10;
  const avgCount = safeActivity.length > 0 ? Math.round((totalCount / safeActivity.length) * 10) / 10 : 0;
  const avgXp = Math.round(avgCount * 10);

  const daysFormatted = safeActivity.map((item) => {
    const d = new Date(item.day + "T00:00:00Z");
    const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const dayName = isNaN(d.getTime()) ? "DAY" : weekdays[d.getUTCDay()];
    const shortDate = item.day ? item.day.slice(5) : "--"; // "09-06"
    const pctHeight = Math.round(((item.count || 0) / maxDaily) * 100);

    return {
      dateStr: item.day,
      dayName,
      shortDate,
      count: item.count || 0,
      xp: (item.count || 0) * 10,
      pctHeight: Math.max(item.count > 0 ? 12 : 4, pctHeight),
    };
  });

  return {
    maxDaily,
    totalCount,
    totalXp,
    avgCount,
    avgXp,
    days: daysFormatted,
  };
}

// ── 7-Day XP Velocity Histogram Component ────────────────────────────────
export function renderHistogram(activity7d = [], maxDaily = 1) {
  const velocity = calculateVelocityStats(activity7d);
  const todayIso = new Date().toISOString().slice(0, 10);

  return `
    <div class="histogram-container space-y-4" data-histogram>
      <!-- Histogram Chart Area -->
      <div class="grid grid-cols-7 gap-2 sm:gap-3 items-end h-56 pt-8 pb-3 px-3 bg-surface-container-lowest border border-outline-variant relative">
        <!-- Scale Grid Lines -->
        <div class="absolute inset-x-0 top-6 border-b border-outline-variant/30 pointer-events-none"></div>
        <div class="absolute inset-x-0 top-1/2 border-b border-outline-variant/30 pointer-events-none"></div>

        ${velocity.days.map((d) => {
          const isToday = d.dateStr === todayIso;
          const hasActivity = d.count > 0;

          return `
            <div class="flex flex-col items-center h-full justify-end group relative">
              <!-- Hover Tooltip -->
              <div class="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-surface-container-high border border-outline px-2 py-0.5 text-[10px] font-mono text-primary whitespace-nowrap z-20 pointer-events-none shadow-lg">
                ${d.dateStr}: ${d.count} tasks (+${d.xp} XP)
              </div>

              <!-- Bar Stat Label -->
              <span class="text-[10px] font-mono text-outline group-hover:text-primary transition-colors mb-1">
                ${d.count > 0 ? `+${d.xp}` : "0"}
              </span>

              <!-- Histogram Column Bar -->
              <div class="w-full max-w-[32px] sm:max-w-[48px] bg-surface-container border ${isToday ? 'border-primary' : 'border-outline-variant'} flex flex-col justify-end overflow-hidden transition-all duration-300 group-hover:border-stone-accent" style="height: ${d.pctHeight}%;">
                <div class="w-full h-full ${hasActivity ? (isToday ? 'bg-primary' : 'bg-stone-accent') : 'bg-surface-container-high'} opacity-80 group-hover:opacity-100 transition-opacity"></div>
              </div>

              <!-- X-Axis Day Labels -->
              <div class="text-center mt-2 space-y-0.5 select-none">
                <span class="block text-[11px] font-mono font-bold ${isToday ? 'text-primary' : 'text-secondary'}">
                  ${d.dayName}
                </span>
                <span class="block text-[9px] font-mono text-outline">
                  ${d.shortDate}
                </span>
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <!-- Histogram Key Readouts -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
        <div class="p-3 bg-surface-container border border-outline-variant flex items-center justify-between">
          <span class="text-secondary">7-DAY ACTIVITY:</span>
          <span class="font-bold text-primary">${velocity.totalCount} TASKS</span>
        </div>
        <div class="p-3 bg-surface-container border border-outline-variant flex items-center justify-between">
          <span class="text-secondary">XP CYCLE VELOCITY:</span>
          <span class="font-bold text-stone-accent">+${velocity.totalXp} XP</span>
        </div>
        <div class="p-3 bg-surface-container border border-outline-variant flex items-center justify-between">
          <span class="text-secondary">DAILY AVERAGE:</span>
          <span class="font-bold text-secondary-fixed">~${velocity.avgXp} XP / DAY</span>
        </div>
      </div>
    </div>
  `;
}

// ── View Cleanup ────────────────────────────────────────────────────────
export function cleanupTelemetryView() {
  // No persistent event intervals to teardown
}

// ── Main Telemetry View Renderer ─────────────────────────────────────────
export function renderTelemetryView(container) {
  if (!container) return;

  const user = store.state.user || {};
  const levelInfo = store.state.levelInfo || {
    level: 1,
    rank: "Apprentice",
    prog_xp: 0,
    needed_xp: 50,
    pct: 0,
    total_xp: 0,
  };
  const stats = store.state.stats || {
    totals: { total: 0, done: 0, archived: 0 },
    focus_minutes: 0,
    streak_days: 0,
    xp: 0,
    activity_7d: [],
  };
  const tasks = store.state.tasks || [];

  const currentLevel = levelInfo.level || 1;
  const currentRank = levelInfo.rank || "Apprentice";
  const progXp = levelInfo.prog_xp || 0;
  const neededXp = levelInfo.needed_xp || 50;
  const bufferPct = Math.min(100, Math.max(0, Math.round(levelInfo.pct || (progXp / neededXp) * 100)));
  const totalXp = levelInfo.total_xp || stats.xp || 0;

  const currentCoins = user.coins ?? 0;
  const lifetimeEarned = user.lifetime_earned ?? currentCoins;
  const lifetimeSpent = user.lifetime_spent ?? 0;

  const currentTierIndex = getTierIndexForLevel(currentLevel);
  const categoriesBreakdown = calculateCategoryBreakdown(tasks, store.state.categories);

  const focusMinutes = stats.focus_minutes || 0;
  const focusHours = Math.floor(focusMinutes / 60);
  const focusRemainingMins = focusMinutes % 60;
  const focusDisplay = focusHours > 0 ? `${focusHours}h ${focusRemainingMins}m` : `${focusMinutes}m`;

  const totalTasks = stats.totals?.total || tasks.length;
  const doneTasks = stats.totals?.done || tasks.filter((t) => t.status === "done").length;
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const streakDays = stats.streak_days || 0;

  container.innerHTML = `
    <div class="max-w-6xl mx-auto space-y-8" data-telemetry-view>
      <!-- RPG Class & Tier Progression Banner -->
      <section class="p-6 bg-surface border border-outline-variant space-y-6">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-outline-variant pb-6">
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="font-space text-xs font-bold tracking-widest text-stone-accent">[SYS: TELEMETRY_CORE v2.4]</span>
              <span class="text-outline-variant">/</span>
              <span class="font-mono text-xs text-outline">CLASS_PROGRESSION</span>
            </div>
            <div class="flex items-baseline gap-4 flex-wrap">
              <span class="font-mono text-xs px-2.5 py-1 bg-surface-container-high border border-primary text-primary font-bold">
                LEVEL ${String(currentLevel).padStart(2, "0")}
              </span>
              <h1 class="font-space text-3xl font-extrabold tracking-tight text-primary uppercase">
                ${escapeHtml(currentRank)}
              </h1>
              <span class="font-mono text-xs text-secondary">
                (${totalXp.toLocaleString()} TOTAL XP ACCRUED)
              </span>
            </div>
            <p class="font-geist text-xs text-secondary">
              Progression ladder tracks your operational discipline, focus endurance, and mission completion.
            </p>
          </div>

          <!-- Quick Stats Pill Badge -->
          <div class="flex items-center gap-3 font-mono text-xs">
            <div class="px-3 py-2 bg-surface-container border border-outline-variant text-center">
              <span class="block text-[10px] text-outline">STREAK</span>
              <span class="font-bold text-primary">${streakDays}d STREAK</span>
            </div>
            <div class="px-3 py-2 bg-surface-container border border-outline-variant text-center">
              <span class="block text-[10px] text-outline">FOCUS ENGINE</span>
              <span class="font-bold text-stone-accent">${focusDisplay}</span>
            </div>
            <div class="px-3 py-2 bg-surface-container border border-outline-variant text-center">
              <span class="block text-[10px] text-outline">COMPLETION</span>
              <span class="font-bold text-secondary-fixed">${completionRate}%</span>
            </div>
          </div>
        </div>

        <!-- Tier Progression Pathway Sequence -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs font-mono">
            <span class="text-outline">TIER PROGRESSION PATHWAY</span>
            <span class="text-stone-accent">ACTIVE TIER: [${RPG_TIERS[currentTierIndex].name.toUpperCase()}]</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-5 gap-2">
            ${RPG_TIERS.map((tier, idx) => {
              const isActive = idx === currentTierIndex;
              const isPast = idx < currentTierIndex;
              const isFuture = idx > currentTierIndex;

              const borderClass = isActive
                ? "border-primary bg-surface-container-high text-primary shadow-sm"
                : isPast
                ? "border-outline-variant bg-surface-container text-stone-accent"
                : "border-outline-variant/50 bg-surface-container-lowest text-outline opacity-60";

              return `
                <div class="p-3 border ${borderClass} font-mono text-xs flex flex-col justify-between space-y-2 transition-colors">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] text-outline font-bold">0${idx + 1}</span>
                    ${isActive ? `
                      <span class="text-[9px] px-1.5 py-0.2 bg-primary text-surface font-bold">ACTIVE</span>
                    ` : isPast ? `
                      <span class="material-symbols-outlined text-xs text-stone-accent font-bold">check</span>
                    ` : `
                      <span class="text-[9px] text-outline">LVL ${tier.minLvl}+</span>
                    `}
                  </div>
                  <div>
                    <h4 class="font-space font-bold text-xs uppercase tracking-wider ${isActive ? 'text-primary' : isPast ? 'text-stone-accent' : 'text-outline'}">
                      ${tier.name}
                    </h4>
                    <p class="text-[10px] font-geist text-secondary line-clamp-2 mt-1">
                      ${tier.description}
                    </p>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <!-- Experience Buffer Bar (Next Level Progress) -->
        <div class="space-y-2 pt-2 border-t border-outline-variant/40">
          <div class="flex items-center justify-between font-mono text-xs">
            <span class="text-secondary flex items-center gap-2">
              <span>EXPERIENCE BUFFER:</span>
              <span class="text-primary font-bold">${progXp} / ${neededXp} XP</span>
            </span>
            <span class="font-bold text-stone-accent">${bufferPct}% TOWARD LEVEL ${currentLevel + 1}</span>
          </div>

          <!-- ASCII Fill Bar Readout -->
          <div class="font-mono text-xs text-stone-accent tracking-widest bg-surface-container-lowest p-2 border border-outline-variant flex items-center justify-between select-none">
            <span class="truncate">${renderAsciiBar(bufferPct, 32)}</span>
            <span class="ml-2 font-bold text-primary">${bufferPct}%</span>
          </div>

          <!-- Visual Progress Bar -->
          <div class="w-full h-1.5 bg-surface-container-high overflow-hidden border border-outline-variant">
            <div class="h-full bg-primary transition-all duration-500" style="width: ${bufferPct}%;"></div>
          </div>
        </div>
      </section>

      <!-- 7-Day XP Velocity Histogram Section -->
      <section class="space-y-4">
        <div class="flex items-center justify-between border-b border-outline-variant pb-2">
          <div class="flex items-center gap-2">
            <span class="font-space text-sm font-bold text-primary">+-.[ 7-DAY XP VELOCITY HISTOGRAM ].-+</span>
            <span class="font-mono text-xs text-outline">(DAILY COMPLETION PROFILE)</span>
          </div>
          <span class="font-mono text-xs text-stone-accent">${streakDays}d STREAK ACTIVE</span>
        </div>

        <div class="bg-surface p-6 border border-outline-variant">
          ${renderHistogram(stats.activity_7d || [])}
        </div>
      </section>

      <!-- Two-Column Category Breakdown & Economy Overview -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Category Task Completion Allocation -->
        <section class="space-y-4">
          <div class="flex items-center justify-between border-b border-outline-variant pb-2">
            <span class="font-space text-sm font-bold text-primary">+-.[ CATEGORY COMPLETION METERS ].-+</span>
            <span class="font-mono text-xs text-outline">QUOTA DISTRIBUTION</span>
          </div>

          <div class="p-6 bg-surface border border-outline-variant space-y-4 font-mono text-xs">
            ${categoriesBreakdown.map((cat) => {
              return `
                <div class="space-y-1.5">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary uppercase">[${escapeHtml(cat.category)}]</span>
                    <div class="flex items-center gap-3">
                      <span class="text-secondary">${cat.done} / ${cat.total} tasks</span>
                      <span class="font-bold text-stone-accent">${cat.pct}%</span>
                    </div>
                  </div>
                  <div class="text-[11px] text-outline tracking-wider flex items-center justify-between select-none">
                    <span class="truncate">${renderAsciiBar(cat.pct, 20)}</span>
                    <span class="text-secondary text-[10px] ml-2">${cat.completedMins}m banked</span>
                  </div>
                  <div class="w-full h-1 bg-surface-container-high overflow-hidden border border-outline-variant">
                    <div class="h-full bg-stone-accent transition-all duration-300" style="width: ${cat.pct}%;"></div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </section>

        <!-- Economy & Productivity Overview Cards -->
        <section class="space-y-4">
          <div class="flex items-center justify-between border-b border-outline-variant pb-2">
            <span class="font-space text-sm font-bold text-primary">+-.[ WALLET & DISCIPLINE AUDIT ].-+</span>
            <span class="font-mono text-xs text-outline">METRICS SNAPSHOT</span>
          </div>

          <div class="p-6 bg-surface border border-outline-variant space-y-6 font-mono text-xs">
            <!-- Coin Wallet Telemetry -->
            <div class="space-y-3">
              <span class="text-outline block text-[11px]">COIN ECONOMY STATUS</span>
              <div class="grid grid-cols-3 gap-3 text-center">
                <div class="p-3 bg-surface-container border border-outline-variant">
                  <span class="block text-[10px] text-outline">BALANCE</span>
                  <span class="font-bold text-primary text-sm mt-1 block">⟐ ${currentCoins}</span>
                </div>
                <div class="p-3 bg-surface-container border border-outline-variant">
                  <span class="block text-[10px] text-outline">LIFETIME EARNED</span>
                  <span class="font-bold text-stone-accent text-sm mt-1 block">+${lifetimeEarned}</span>
                </div>
                <div class="p-3 bg-surface-container border border-outline-variant">
                  <span class="block text-[10px] text-outline">LIFETIME SPENT</span>
                  <span class="font-bold text-secondary-fixed text-sm mt-1 block">-${lifetimeSpent}</span>
                </div>
              </div>
            </div>

            <!-- Productivity Health Readout -->
            <div class="space-y-3 pt-4 border-t border-outline-variant/40">
              <span class="text-outline block text-[11px]">FOCUS ENGINE ACCRUAL</span>
              <div class="grid grid-cols-2 gap-3">
                <div class="p-3 bg-surface-container border border-outline-variant">
                  <span class="block text-[10px] text-outline">TOTAL FOCUS ACCRUED</span>
                  <span class="font-bold text-primary text-sm mt-1 block">${focusDisplay}</span>
                  <span class="text-[10px] text-secondary mt-0.5 block">${focusMinutes} recorded minutes</span>
                </div>
                <div class="p-3 bg-surface-container border border-outline-variant">
                  <span class="block text-[10px] text-outline">TASK COMPLETION RATIO</span>
                  <span class="font-bold text-primary text-sm mt-1 block">${doneTasks} / ${totalTasks}</span>
                  <span class="text-[10px] text-secondary mt-0.5 block">${completionRate}% efficiency rate</span>
                </div>
              </div>
            </div>

            <!-- Operator Status Footer -->
            <div class="p-3 bg-surface-container-lowest border border-outline-variant text-[11px] text-secondary flex items-center justify-between">
              <span>OPERATOR STATUS: [NORMAL]</span>
              <span class="text-stone-accent">DAEMON: V2.4.1</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}
