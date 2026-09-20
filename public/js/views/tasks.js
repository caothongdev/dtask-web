// public/js/views/tasks.js
// Dashboard / Tasks view with Quick Add command bar, mode cards, filters, and telemetry sidebar
// Blueprint Silicon light theme: white cards, blueprint cobalt accents, rounded-2xl shells.

import { api } from "../api.js";
import { sound } from "../audio.js";
import { store } from "../store.js";
import { openReaderModal } from "./reader.js";
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

function renderProgressPill(pct) {
  const safe = Math.max(0, Math.min(100, pct || 0));
  return `
    <div class="flex items-center gap-1.5">
      <div class="w-14 bg-surface-container-high rounded-full h-1.5 overflow-hidden">
        <div class="bg-primary h-1.5 rounded-full transition-all duration-300" style="width: ${safe}%"></div>
      </div>
      <span class="text-[10px] font-mono text-outline">${safe}%</span>
    </div>
  `;
}

export function parseFlags(input) {
  let title = input || "";
  let at = null;
  let mins = 0;
  let book_title = null;
  let pages = 0;

  const atMatch = title.match(/--at\s+([0-2]\d:[0-5]\d)/);
  if (atMatch) {
    at = atMatch[1];
    title = title.replace(atMatch[0], "");
  }

  const minsMatch = title.match(/--mins\s+(\d+)/);
  if (minsMatch) {
    mins = parseInt(minsMatch[1], 10);
    title = title.replace(minsMatch[0], "");
  }

  const bookMatch = title.match(/--book\s+(?:\"([^\"]+)\"|'([^']+)'|(\S+))(?:\s+(\d+))?/);
  if (bookMatch) {
    book_title = bookMatch[1] || bookMatch[2] || bookMatch[3];
    if (bookMatch[4]) {
      pages = parseInt(bookMatch[4], 10);
    }
    title = title.replace(bookMatch[0], "");
  }

  const pagesMatch = title.match(/--pages\s+(\d+)/);
  if (pagesMatch) {
    pages = parseInt(pagesMatch[1], 10);
    title = title.replace(pagesMatch[0], "");
  }

  return {
    title: title.trim().replace(/\s+/g, " "),
    at,
    mins,
    book_title,
    pages,
  };
}

// Module-level filter & view state
let filterStatus = "all";       // "all" | "open" | "done"
let filterCategory = "all";     // "all" | "code" | "learn" | "health" | "read" | "build"
let searchQuery = "";
let selectedCategory = "code";
let showBookInputs = false;

export function renderTasksView(container) {
  if (!container) return;

  // If container already has the tasks view scaffolding, update only the list and telemetry in-place
  if (container.querySelector("#tasks-list-container")) {
    updateTasksListOnly(container);
    return;
  }

  const tasks = store.state.tasks || [];
  const user = store.state.user || {};
  const stats = store.state.stats || {};
  const levelInfo = store.state.levelInfo || { level: 1, rank: "Apprentice", total_xp: 0, pct: 0 };
  const categories = ["code", "learn", "health", "read", "build"];

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const efficiency = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const streakDays = stats.streak_days ?? (user.streak || 0);
  const totalXp = levelInfo.total_xp || 0;

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start">
      <!-- ── Main Column: Command Bar, Filters, Task Cards (8 cols) ── -->
      <section class="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">

        <!-- 1. Quick Add Command Bar -->
        <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-4 md:p-6">
          <div class="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant/70 font-mono text-xs">
            <div class="flex items-center gap-2 text-stone-accent font-bold">
              <span class="w-2.5 h-2.5 rounded-full bg-primary pulse-dot"></span>
              <span>QUICK TASK CAPTURE</span>
            </div>
            <span class="text-outline text-[11px] hidden sm:inline-block">FLAGS: --at HH:MM · --mins N · --book "Title" P</span>
          </div>

          <form id="quick-add-form" class="flex flex-col gap-3">
            <!-- Row 1: Title input -->
            <div class="relative">
              <input
                id="quick-add-title"
                type="text"
                placeholder="Enter task... (flags: --at 14:00 --mins 25 --book 'Title' 100)"
                autocomplete="off"
                required
                class="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2.5 text-sm font-mono text-stone-accent placeholder-outline rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            <!-- Row 2: Category Pills -->
            <div class="flex flex-wrap items-center gap-1.5 font-mono text-xs">
              <span class="text-outline text-[11px] mr-1 uppercase">Category:</span>
              ${categories
                .map(
                  (cat) => `
                <button
                  type="button"
                  data-category="${cat}"
                  class="cat-pill px-2.5 py-1 uppercase tracking-wide rounded-lg border ${
                    selectedCategory === cat
                      ? "bg-primary text-white border-primary font-bold"
                      : "bg-white border-outline-variant text-secondary hover:border-outline hover:text-stone-accent"
                  } transition-colors"
                >
                  ${cat}
                </button>
              `
                )
                .join("")}
            </div>

            <!-- Row 3: Mode Toggles & Inputs -->
            <div class="flex flex-wrap items-center gap-3 pt-2 border-t border-outline-variant/60 font-mono text-xs text-secondary">
              <!-- At Time -->
              <div class="flex items-center gap-1.5 bg-surface-subtle px-2 py-1 rounded-lg border border-outline-variant">
                <span class="text-outline text-[11px]">AT:</span>
                <input
                  id="quick-add-at"
                  type="text"
                  placeholder="HH:MM"
                  pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]"
                  maxlength="5"
                  class="w-16 bg-transparent text-stone-accent focus:outline-none font-bold placeholder-outline/60"
                />
              </div>

              <!-- Target Duration (Mins) -->
              <div class="flex items-center gap-1.5 bg-surface-subtle px-2 py-1 rounded-lg border border-outline-variant">
                <span class="text-outline text-[11px]">MINS:</span>
                <input
                  id="quick-add-mins"
                  type="number"
                  min="0"
                  max="600"
                  placeholder="25"
                  class="w-14 bg-transparent text-stone-accent focus:outline-none font-bold placeholder-outline/60"
                />
              </div>

              <!-- Book Mode Toggle Button -->
              <button
                type="button"
                id="quick-add-toggle-book"
                class="px-2.5 py-1 rounded-lg border ${
                  showBookInputs ? "bg-primary-soft border-primary text-primary font-bold" : "bg-white border-outline-variant text-secondary"
                } hover:border-outline transition-colors"
              >
                --book mode
              </button>

              <!-- Submit Button -->
              <div class="ml-auto">
                <button
                  type="submit"
                  id="quick-add-btn"
                  class="quick-add px-4 py-1.5 bg-primary text-white font-mono text-xs font-bold hover:bg-primary-strong transition-colors rounded-xl flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                >
                  <span>+ Add Task</span>
                </button>
              </div>
            </div>

            <!-- Row 4: Book Mode Extended Inputs (shown if book mode active) -->
            <div id="quick-add-book-fields" class="${showBookInputs ? "flex" : "hidden"} flex-wrap items-center gap-3 p-2 bg-surface-subtle rounded-xl border border-outline-variant/70 font-mono text-xs">
              <div class="flex items-center gap-1.5 flex-1 min-w-[160px]">
                <span class="text-outline text-[11px]">BOOK TITLE:</span>
                <input
                  id="quick-add-book-title"
                  type="text"
                  placeholder="Book title..."
                  class="flex-1 bg-transparent text-stone-accent focus:outline-none font-bold"
                />
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-outline text-[11px]">TOTAL PAGES:</span>
                <input
                  id="quick-add-pages"
                  type="number"
                  min="1"
                  placeholder="250"
                  class="w-16 bg-transparent text-stone-accent focus:outline-none font-bold"
                />
              </div>
            </div>
          </form>
        </div>

        <!-- 2. Filter Row -->
        <div class="filter-row flex flex-wrap items-center justify-between gap-3 bg-surface rounded-2xl border border-outline-variant shadow-card p-3 font-mono text-xs">
          <!-- Status Chips -->
          <div class="flex items-center gap-1">
            <span class="text-outline text-[11px] uppercase mr-1">// Status:</span>
            ${["all", "open", "done"]
              .map(
                (st) => `
              <button
                data-filter-status="${st}"
                class="filter-status-chip px-2.5 py-0.5 uppercase tracking-wide rounded-lg border ${
                  filterStatus === st
                    ? "bg-primary text-white border-primary font-bold"
                    : "bg-white border-outline-variant text-secondary hover:text-stone-accent"
                } transition-colors"
              >
                ${st}
              </button>
            `
              )
              .join("")}
          </div>

          <!-- Category Chips -->
          <div class="flex flex-wrap items-center gap-1">
            <span class="text-outline text-[11px] uppercase mr-1">// Cat:</span>
            <button
              data-filter-category="all"
              class="filter-cat-chip px-2 py-0.5 uppercase rounded-lg border ${
                filterCategory === "all"
                  ? "bg-stone-accent text-white border-stone-accent font-bold"
                  : "bg-white border-outline-variant text-secondary hover:text-stone-accent"
              } transition-colors"
            >
              all
            </button>
            ${categories
              .map(
                (cat) => `
              <button
                data-filter-category="${cat}"
                class="filter-cat-chip px-2 py-0.5 uppercase rounded-lg border ${
                  filterCategory === cat
                    ? "bg-stone-accent text-white border-stone-accent font-bold"
                    : "bg-white border-outline-variant text-secondary hover:text-stone-accent"
                } transition-colors"
              >
                ${cat}
              </button>
            `
              )
              .join("")}
          </div>

          <!-- Search Filter -->
          <div class="flex items-center gap-1 bg-surface-subtle px-2 py-1 rounded-lg border border-outline-variant w-full sm:w-48">
            <span class="material-symbols-outlined text-sm text-outline">search</span>
            <input
              id="tasks-search"
              type="text"
              placeholder="filter..."
              value="${escapeHtml(searchQuery)}"
              class="w-full bg-transparent text-stone-accent text-xs focus:outline-none placeholder-outline"
            />
            <button id="tasks-search-clear" class="${searchQuery ? "" : "hidden"} text-outline hover:text-stone-accent p-1 rounded hover:bg-surface transition flex items-center justify-center" title="Clear search">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- 3. Task Cards List Container -->
        <div id="tasks-list-container" class="flex flex-col gap-4">
        </div>
      </section>

      <!-- ── Secondary Sidebar: Telemetry & Quick Focus Logger (4 cols) ── -->
      <aside class="lg:col-span-4 xl:col-span-3 flex flex-col gap-6">

        <!-- Telemetry & Daily Quota Card -->
        <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-4 md:p-5 flex flex-col gap-4 font-mono text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-outline-variant/70">
            <span class="text-stone-accent font-bold tracking-wider">TELEMETRY &amp; STATS</span>
            <span class="text-outline text-[11px]">HUD v3</span>
          </div>

          <!-- Stats Grid -->
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-surface-subtle p-3 rounded-xl border border-outline-variant flex flex-col">
              <span class="text-outline text-[11px] uppercase tracking-wider">Completed</span>
              <span id="stat-completed" class="text-base font-bold text-stone-accent mt-1 font-sans">${doneTasks} / ${totalTasks}</span>
              <span id="stat-eff" class="text-[10px] text-outline mt-0.5">${efficiency}% efficiency</span>
            </div>

            <div class="bg-surface-subtle p-3 rounded-xl border border-outline-variant flex flex-col">
              <span class="text-outline text-[11px] uppercase tracking-wider">Streak</span>
              <span id="stat-streak" class="text-base font-bold text-orange-600 mt-1 font-sans">${streakDays} DAYS</span>
              <span class="text-[10px] text-outline mt-0.5">active cadence</span>
            </div>

            <div class="bg-surface-subtle p-3 rounded-xl border border-outline-variant flex flex-col">
              <span class="text-outline text-[11px] uppercase tracking-wider">Total XP</span>
              <span id="stat-xp" class="text-base font-bold text-primary mt-1 font-sans">${totalXp}</span>
              <span id="stat-rank" class="text-[10px] text-secondary mt-0.5">${levelInfo.rank || "Apprentice"}</span>
            </div>

            <div class="bg-coin-soft p-3 rounded-xl border border-amber-200/80 flex flex-col">
              <span class="text-coin-amber text-[11px] uppercase tracking-wider">Coins</span>
              <span id="stat-coins" class="text-base font-bold text-coin-amber mt-1 font-sans flex items-center gap-1.5">${icons.coin("w-4 h-4 text-amber-500")} ${user.coins ?? 0}</span>
              <span class="text-[10px] text-outline mt-0.5">wallet balance</span>
            </div>
          </div>

          <!-- XP Level Progress -->
          <div class="bg-surface-subtle p-3 rounded-xl border border-outline-variant flex flex-col gap-1.5">
            <div class="flex justify-between items-center text-[11px]">
              <span id="stat-lvl-rank" class="text-secondary font-bold">[LVL ${levelInfo.level}] ${levelInfo.rank}</span>
              <span id="stat-lvl-prog" class="text-outline">${levelInfo.prog_xp || 0} / ${levelInfo.needed_xp || 100} XP (${levelInfo.pct || 0}%)</span>
            </div>
            <div class="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
              <div id="stat-lvl-bar" class="bg-primary h-full rounded-full transition-all duration-300" style="width: ${levelInfo.pct || 0}%"></div>
            </div>
          </div>
        </div>

        <!-- Quick Focus Logger -->
        <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-4 md:p-5 flex flex-col gap-3 font-mono text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-outline-variant/70">
            <span class="text-stone-accent font-bold tracking-wider">QUICK FOCUS LOG</span>
            <span class="text-outline text-[11px]">+0.5 coins/min</span>
          </div>
          <p class="text-secondary text-[11px] leading-relaxed">
            Record completed offline work block without running live timer:
          </p>
          <div class="grid grid-cols-2 gap-2 mt-1">
            <button data-quick-focus="15" class="quick-focus-btn px-3 py-2 bg-white hover:bg-primary-soft border border-outline-variant hover:border-primary text-stone-accent font-bold text-center rounded-xl transition-colors">
              +15 MINS
            </button>
            <button data-quick-focus="25" class="quick-focus-btn px-3 py-2 bg-white hover:bg-primary-soft border border-outline-variant hover:border-primary text-stone-accent font-bold text-center rounded-xl transition-colors">
              +25 MINS
            </button>
            <button data-quick-focus="45" class="quick-focus-btn px-3 py-2 bg-white hover:bg-primary-soft border border-outline-variant hover:border-primary text-stone-accent font-bold text-center rounded-xl transition-colors">
              +45 MINS
            </button>
            <button data-quick-focus="60" class="quick-focus-btn px-3 py-2 bg-white hover:bg-primary-soft border border-outline-variant hover:border-primary text-stone-accent font-bold text-center rounded-xl transition-colors">
              +60 MINS
            </button>
          </div>
        </div>

        <!-- Hotkey Reference Card -->
        <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-4 font-mono text-[11px] text-outline flex flex-col gap-2">
          <span class="text-secondary font-bold uppercase tracking-wider">HOTKEYS &amp; HINTS</span>
          <div class="flex justify-between"><span>[1]-[9]</span><span class="text-stone-accent font-semibold">Switch views</span></div>
          <div class="flex justify-between"><span>[A]</span><span class="text-stone-accent font-semibold">Quick add task</span></div>
          <div class="flex justify-between"><span>[Space]</span><span class="text-stone-accent font-semibold">Pause / resume focus</span></div>
          <div class="flex justify-between"><span>[Esc]</span><span class="text-stone-accent font-semibold">Close modals</span></div>
        </div>

      </aside>
    </div>
  `;

  bindViewEvents(container);
  updateTasksListOnly(container);
}

function updateTasksListOnly(container) {
  const listContainer = container.querySelector("#tasks-list-container");
  if (!listContainer) return;

  const tasks = store.state.tasks || [];
  const user = store.state.user || {};
  const stats = store.state.stats || {};
  const levelInfo = store.state.levelInfo || { level: 1, rank: "Apprentice", total_xp: 0, pct: 0 };

  // Filter tasks
  const q = searchQuery.trim().toLowerCase();
  const filteredTasks = tasks.filter((t) => {
    if (filterStatus === "open" && t.status === "done") return false;
    if (filterStatus === "done" && t.status !== "done") return false;
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (q && !t.title.toLowerCase().includes(q) && !(t.book_title && t.book_title.toLowerCase().includes(q))) {
      return false;
    }
    return true;
  });

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const efficiency = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const streakDays = stats.streak_days ?? (user.streak || 0);
  const totalXp = levelInfo.total_xp || 0;

  if (filteredTasks.length === 0) {
    listContainer.innerHTML = `
      <div class="p-10 bg-surface border-2 border-dashed border-outline-variant rounded-3xl text-center max-w-lg mx-auto font-sans">
        <div class="w-14 h-14 mx-auto mb-3 bg-primary-soft text-primary rounded-2xl flex items-center justify-center">${icons.sparkles("w-7 h-7")}</div>
        <p class="text-base font-bold text-stone-accent mb-1">No tasks found</p>
        <p class="text-xs text-outline">Nothing matches the current filters. Press <kbd class="px-1.5 py-0.5 bg-surface-subtle border border-outline-variant rounded font-mono text-stone-accent font-bold">A</kbd> or add one above.</p>
      </div>
    `;
  } else {
    listContainer.innerHTML = renderTaskGroups(filteredTasks);
  }

  // Update Telemetry metrics in sidebar
  const completedEl = container.querySelector("#stat-completed");
  const effEl = container.querySelector("#stat-eff");
  const streakEl = container.querySelector("#stat-streak");
  const xpEl = container.querySelector("#stat-xp");
  const rankEl = container.querySelector("#stat-rank");
  const coinsEl = container.querySelector("#stat-coins");
  const lvlRankEl = container.querySelector("#stat-lvl-rank");
  const lvlProgEl = container.querySelector("#stat-lvl-prog");
  const lvlBarEl = container.querySelector("#stat-lvl-bar");

  if (completedEl) completedEl.textContent = `${doneTasks} / ${totalTasks}`;
  if (effEl) effEl.textContent = `${efficiency}% efficiency`;
  if (streakEl) streakEl.textContent = `${streakDays} DAYS`;
  if (xpEl) xpEl.textContent = String(totalXp);
  if (rankEl) rankEl.textContent = levelInfo.rank || "Apprentice";
  if (coinsEl) coinsEl.innerHTML = `<span class="flex items-center gap-1.5">${icons.coin("w-4 h-4 text-amber-500")} ${user.coins ?? 0}</span>`;
  if (lvlRankEl) lvlRankEl.textContent = `[LVL ${levelInfo.level}] ${levelInfo.rank}`;
  if (lvlProgEl) lvlProgEl.textContent = `${levelInfo.prog_xp || 0} / ${levelInfo.needed_xp || 100} XP (${levelInfo.pct || 0}%)`;
  if (lvlBarEl) lvlBarEl.style.width = `${levelInfo.pct || 0}%`;

  const clearBtn = container.querySelector("#tasks-search-clear");
  if (clearBtn) {
    if (searchQuery) clearBtn.classList.remove("hidden");
    else clearBtn.classList.add("hidden");
  }
}

function renderTaskGroups(tasks) {
  // Group by category
  const groups = {};
  for (const t of tasks) {
    const cat = t.category || "code";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  }

  return Object.entries(groups)
    .map(([category, items]) => {
      const doneCount = items.filter((i) => i.status === "done").length;
      const totalCount = items.length;

      return `
      <div class="task-category-group bg-surface rounded-2xl border border-outline-variant shadow-card overflow-hidden">
        <!-- Category Section Header -->
        <div class="px-5 py-3.5 bg-surface-subtle/70 border-b border-outline-variant flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-primary"></span>
            <h3 class="font-bold text-stone-accent text-sm tracking-tight font-sans">${escapeHtml(category.toUpperCase())}</h3>
            <span class="text-[11px] font-mono text-outline">(${doneCount}/${totalCount} done)</span>
          </div>
          <span class="text-[11px] font-mono text-outline hidden sm:inline">category group</span>
        </div>

        <!-- Cards List -->
        <div class="divide-y divide-outline-variant/60">
          ${items.map((task) => renderTaskCard(task)).join("")}
        </div>
      </div>
    `;
    })
    .join("");
}

function renderTaskCard(task) {
  const isDone = task.status === "done";
  const isTime = Number(task.mins) > 0;
  const isBook = Number(task.pages) > 0 || !!task.book_title;

  // Mode badge
  let modeBadge = `<span class="px-2 py-0.5 text-[10px] font-mono rounded-md border border-outline-variant bg-surface-subtle text-outline inline-flex items-center gap-1">${icons.check("w-3 h-3")} CHECK</span>`;
  if (isTime) {
    modeBadge = `<span class="px-2 py-0.5 text-[10px] font-mono rounded-md border border-blue-200 bg-primary-soft text-primary font-bold inline-flex items-center gap-1">${icons.timer("w-3 h-3")} ${task.mins}m</span>`;
  } else if (isBook) {
    modeBadge = `<span class="px-2 py-0.5 text-[10px] font-mono rounded-md border border-violet-200 bg-badge-violet text-badge-violet-text font-bold inline-flex items-center gap-1">${icons.book("w-3 h-3")} BOOK</span>`;
  }

  // Scheduled slot badge
  const atBadge = task.at
    ? `<span class="px-1.5 py-0.5 text-[10px] font-mono rounded-md border border-outline-variant bg-surface-subtle text-stone-soft">@ ${escapeHtml(task.at)}</span>`
    : "";

  // XP & Coin award badges
  const awardBadges = `
    <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary-soft text-primary border border-blue-100">+${task.xp || 10} XP</span>
    <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-coin-soft text-coin-amber border border-amber-100 inline-flex items-center gap-1">${icons.coin("w-3 h-3 text-amber-500")} +${task.coins || 10}</span>
  `;

  // Progress metrics & visual bar
  let progressSection = "";
  if (isTime) {
    const spentMins = Math.floor((task.time_spent || 0) / 60);
    const targetMins = task.mins || 25;
    const pct = isDone ? 100 : Math.min(100, Math.round((spentMins / targetMins) * 100));

    progressSection = `
      <div class="flex items-center gap-2">
        <div class="w-16 sm:w-24 bg-surface-container-high rounded-full h-1.5 overflow-hidden">
          <div class="bg-primary h-1.5 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
        </div>
        <span class="text-[10px] font-mono text-outline whitespace-nowrap">${spentMins}/${targetMins}m</span>
      </div>
    `;
  } else if (isBook) {
    const page = task.page || 0;
    const pages = task.pages || 0;
    const pct = pages > 0 ? (isDone ? 100 : Math.min(100, Math.round((page / pages) * 100))) : 0;

    progressSection = `
      <div class="flex items-center gap-2">
        <div class="w-16 sm:w-24 bg-surface-container-high rounded-full h-1.5 overflow-hidden">
          <div class="bg-badge-violet-text h-1.5 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
        </div>
        <span class="text-[10px] font-mono text-outline whitespace-nowrap">p.${page}${pages ? "/" + pages : ""}</span>
      </div>
    `;
  }

  // Mode action button (Start Focus or Step/Read)
  let modeActionBtn = "";
  if (isTime) {
    modeActionBtn = `
      <button
        data-action="focus"
        data-task-id="${task.id}"
        class="task-focus-btn px-2.5 py-1 bg-primary hover:bg-primary-strong text-white font-mono text-xs font-bold transition-colors rounded-xl whitespace-nowrap shadow-sm shadow-blue-500/20 inline-flex items-center gap-1.5"
      >
        ${icons.play("w-3 h-3 fill-current")} START FOCUS
      </button>
    `;
  } else if (isBook) {
    modeActionBtn = `
      <div class="flex items-center gap-1">
        <button
          data-action="page-prev"
          data-task-id="${task.id}"
          class="task-page-prev-btn px-1.5 py-1 bg-white hover:bg-surface-subtle border border-outline-variant text-secondary hover:text-stone-accent font-mono text-xs rounded-lg transition-colors"
          title="Step -1 Page"
        >
          -1
        </button>
        <button
          data-action="page-next"
          data-task-id="${task.id}"
          class="task-page-next-btn px-1.5 py-1 bg-white hover:bg-surface-subtle border border-outline-variant text-secondary hover:text-stone-accent font-mono text-xs rounded-lg transition-colors"
          title="Step +1 Page"
        >
          +1
        </button>
        <button
          data-action="read"
          data-task-id="${task.id}"
          class="task-read-btn px-2.5 py-1 bg-primary-soft hover:bg-blue-100 text-primary border border-blue-200 font-mono text-xs font-bold rounded-xl transition-colors whitespace-nowrap inline-flex items-center gap-1"
        >
          ${icons.book("w-3.5 h-3.5")} READ
        </button>
      </div>
    `;
  }

  return `
    <div
      class="task-card p-4 hover:bg-surface-subtle/50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        isDone ? "bg-surface-subtle/40 opacity-75" : "bg-surface"
      }"
      data-task-id="${task.id}"
    >
      <!-- Left: Checkbox, Badges, Title -->
      <div class="flex items-start sm:items-center gap-3 min-w-0 flex-1">
        <!-- Reversible Done Toggle Checkbox -->
        <button
          data-action="toggle-done"
          data-task-id="${task.id}"
          class="task-checkbox-btn shrink-0 w-6 h-6 rounded-lg border flex items-center justify-center transition ${
            isDone
              ? "bg-emerald-500 border-emerald-600 text-white shadow-sm"
              : "border-slate-300 hover:border-primary bg-white text-transparent"
          }"
          title="${isDone ? "Mark Open" : "Mark Done"}"
        >
          ${isDone ? `<svg class="w-4 h-4 fill-current" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>` : ""}
        </button>

        <div class="flex flex-col gap-1 min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            ${modeBadge}
            ${atBadge}
            <span class="text-[10px] font-mono uppercase text-outline">[${escapeHtml(task.category)}]</span>
            ${
              task.book_title && task.book_title !== task.title
                ? `<span class="text-[11px] font-mono text-outline truncate italic">// ${escapeHtml(task.book_title)}</span>`
                : ""
            }
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="task-title font-geist text-sm ${
              isDone ? "line-through text-outline" : "text-stone-accent font-semibold"
            }">
              ${escapeHtml(task.title)}
            </span>
            ${awardBadges}
          </div>
        </div>
      </div>

      <!-- Right: Progress Meter & Action Buttons -->
      <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
        ${progressSection}
        ${modeActionBtn}

        <!-- Edit Button -->
        <button
          data-action="edit"
          data-task-id="${task.id}"
          class="task-edit-btn px-2 py-1 border border-outline-variant hover:border-primary text-outline hover:text-primary font-mono text-xs rounded-lg transition-colors"
          title="Edit Task"
        >EDIT</button>

        <!-- Delete Button -->
        <button
          data-action="delete"
          data-task-id="${task.id}"
          class="task-del-btn px-2 py-1 border border-outline-variant hover:border-danger hover:bg-danger-soft text-outline hover:text-danger font-mono text-xs rounded-lg transition-colors"
          title="Delete Task"
        >DEL</button>
      </div>
    </div>
  `;
}

export function openEditTaskModal(task, onUpdate) {
  if (!task) return;

  const overlay = document.createElement("div");
  overlay.id = "edit-task-modal-overlay";
  overlay.className = "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm";

  const modal = document.createElement("div");
  modal.className = "w-full max-w-lg bg-surface rounded-3xl border border-outline-variant p-6 shadow-2xl font-mono text-xs text-stone-accent flex flex-col gap-4";

  modal.innerHTML = `
    <div class="flex items-center justify-between pb-3 border-b border-outline-variant">
      <span class="text-stone-accent font-bold text-sm font-sans">Edit Task #${task.id}</span>
      <button id="edit-modal-close" class="text-outline hover:text-stone-accent p-1.5 rounded-lg hover:bg-surface-subtle transition flex items-center justify-center" title="Close">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <form id="edit-task-form" class="flex flex-col gap-3">
      <div>
        <label class="block text-secondary font-semibold mb-1">Task Title</label>
        <input id="edit-task-title" type="text" value="${escapeHtml(task.title)}" required class="w-full bg-surface-subtle border border-outline-variant px-3 py-2 text-stone-accent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-secondary font-semibold mb-1">Category</label>
          <select id="edit-task-category" class="w-full bg-surface-subtle border border-outline-variant px-2 py-2 text-stone-accent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30">
            ${["code", "learn", "health", "read", "build"].map(c => `<option value="${c}" ${task.category === c ? "selected" : ""}>${c.toUpperCase()}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="block text-secondary font-semibold mb-1">At (HH:MM)</label>
          <input id="edit-task-at" type="text" placeholder="09:00" pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]" maxlength="5" value="${escapeHtml(task.at || "")}" class="w-full bg-surface-subtle border border-outline-variant px-3 py-2 text-stone-accent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-secondary font-semibold mb-1">Target Mins</label>
          <input id="edit-task-mins" type="number" min="0" max="600" value="${task.mins || 0}" class="w-full bg-surface-subtle border border-outline-variant px-3 py-2 text-stone-accent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
        <div>
          <label class="block text-secondary font-semibold mb-1">Total Pages</label>
          <input id="edit-task-pages" type="number" min="0" value="${task.pages || 0}" class="w-full bg-surface-subtle border border-outline-variant px-3 py-2 text-stone-accent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
      </div>
      <div>
        <label class="block text-secondary font-semibold mb-1">Book Title</label>
        <input id="edit-task-book-title" type="text" value="${escapeHtml(task.book_title || "")}" placeholder="Optional book title..." class="w-full bg-surface-subtle border border-outline-variant px-3 py-2 text-stone-accent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
      </div>
      <div class="flex justify-end gap-2 pt-2 border-t border-outline-variant">
        <button type="button" id="edit-modal-cancel" class="px-4 py-2 border border-outline-variant hover:border-outline text-secondary hover:text-stone-accent rounded-xl">Cancel</button>
        <button type="submit" class="px-4 py-2 bg-primary text-white font-bold hover:bg-primary-strong rounded-xl shadow-md shadow-blue-500/20">Save Changes</button>
      </div>
    </form>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  modal.querySelector("#edit-modal-close")?.addEventListener("click", close);
  modal.querySelector("#edit-modal-cancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  modal.querySelector("#edit-task-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = modal.querySelector("#edit-task-title")?.value.trim();
    const category = modal.querySelector("#edit-task-category")?.value;
    const atVal = modal.querySelector("#edit-task-at")?.value.trim() || null;
    const minsVal = parseInt(modal.querySelector("#edit-task-mins")?.value, 10) || 0;
    const pagesVal = parseInt(modal.querySelector("#edit-task-pages")?.value, 10) || 0;
    const bookTitleVal = modal.querySelector("#edit-task-book-title")?.value.trim() || null;

    if (!title) return;

    try {
      await api.updateTask(task.id, {
        title,
        category,
        at: atVal,
        mins: minsVal,
        pages: pagesVal,
        book_title: bookTitleVal,
      });
      store.showToast(`Task #${task.id} updated`, "success");
      close();
      await store.refreshTasks();
      await store.refreshUserAndStats();
      if (onUpdate) onUpdate();
    } catch (err) {
      store.showToast(err.message || "Failed to update task", "error");
    }
  });
}

function bindViewEvents(container) {
  // 1. Quick Add Category selection pills — in-place toggle
  container.querySelectorAll(".cat-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCategory = btn.getAttribute("data-category") || "code";
      container.querySelectorAll(".cat-pill").forEach((b) => {
        if (b.getAttribute("data-category") === selectedCategory) {
          b.className = "cat-pill px-2.5 py-1 uppercase tracking-wide rounded-lg border bg-primary text-white border-primary font-bold transition-colors";
        } else {
          b.className = "cat-pill px-2.5 py-1 uppercase tracking-wide rounded-lg border bg-white border-outline-variant text-secondary hover:border-outline hover:text-stone-accent transition-colors";
        }
      });
    });
  });

  // 2. Toggle Book Mode fields — in-place toggle
  const bookToggleBtn = container.querySelector("#quick-add-toggle-book");
  const bookFields = container.querySelector("#quick-add-book-fields");
  bookToggleBtn?.addEventListener("click", () => {
    showBookInputs = !showBookInputs;
    if (showBookInputs) {
      bookFields?.classList.remove("hidden");
      bookFields?.classList.add("flex");
      bookToggleBtn.className = "px-2.5 py-1 rounded-lg border bg-primary-soft border-primary text-primary font-bold hover:border-outline transition-colors";
    } else {
      bookFields?.classList.add("hidden");
      bookFields?.classList.remove("flex");
      bookToggleBtn.className = "px-2.5 py-1 rounded-lg border bg-white border-outline-variant text-secondary hover:border-outline transition-colors";
    }
  });

  // 3. Quick Add Form Submit
  container.querySelector("#quick-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titleInput = container.querySelector("#quick-add-title");
    const atInput = container.querySelector("#quick-add-at");
    const minsInput = container.querySelector("#quick-add-mins");
    const bookTitleInput = container.querySelector("#quick-add-book-title");
    const pagesInput = container.querySelector("#quick-add-pages");

    const rawTitle = (titleInput?.value || "").trim();
    if (!rawTitle) return;

    // Parse inline flags like --at, --mins, --book
    const parsed = parseFlags(rawTitle);

    // Finding 5: Flag-only Quick Add title fallback
    const finalTitle = parsed.title || parsed.book_title || rawTitle;

    const taskPayload = {
      title: finalTitle,
      category: selectedCategory,
    };

    // Scheduled slot (--at)
    if (parsed.at) {
      taskPayload.at = parsed.at;
    } else if (atInput?.value?.trim()) {
      taskPayload.at = atInput.value.trim();
    }

    // Duration mins (--mins)
    if (parsed.mins > 0) {
      taskPayload.mins = parsed.mins;
    } else if (minsInput?.value) {
      const m = parseInt(minsInput.value, 10);
      if (m > 0) taskPayload.mins = m;
    }

    // Book title & pages (--book)
    if (parsed.book_title) {
      taskPayload.book_title = parsed.book_title;
    } else if (bookTitleInput?.value?.trim()) {
      taskPayload.book_title = bookTitleInput.value.trim();
    }

    if (parsed.pages > 0) {
      taskPayload.pages = parsed.pages;
    } else if (pagesInput?.value) {
      const p = parseInt(pagesInput.value, 10);
      if (p > 0) taskPayload.pages = p;
    }

    try {
      await api.createTask(taskPayload);
      sound.playCoinTick();
      store.showToast(`Task created: "${taskPayload.title}"`, "success");
      titleInput.value = "";
      if (atInput) atInput.value = "";
      if (minsInput) minsInput.value = "";
      if (bookTitleInput) bookTitleInput.value = "";
      if (pagesInput) pagesInput.value = "";
      // Finding 1: Blur input on submit so it does not block re-renders
      titleInput.blur();
      await store.refreshTasks();
      await store.refreshUserAndStats();
      updateTasksListOnly(container);
    } catch (err) {
      store.showToast(err.message || "Failed to create task", "error");
    }
  });

  // 4. Status Filter chips — in-place style & list update
  container.querySelectorAll(".filter-status-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterStatus = btn.getAttribute("data-filter-status") || "all";
      container.querySelectorAll(".filter-status-chip").forEach((b) => {
        const st = b.getAttribute("data-filter-status");
        if (st === filterStatus) {
          b.className = "filter-status-chip px-2.5 py-0.5 uppercase tracking-wide rounded-lg border bg-primary text-white border-primary font-bold transition-colors";
        } else {
          b.className = "filter-status-chip px-2.5 py-0.5 uppercase tracking-wide rounded-lg border bg-white border-outline-variant text-secondary hover:text-stone-accent transition-colors";
        }
      });
      updateTasksListOnly(container);
    });
  });

  // 5. Category Filter chips — in-place style & list update
  container.querySelectorAll(".filter-cat-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterCategory = btn.getAttribute("data-filter-category") || "all";
      container.querySelectorAll(".filter-cat-chip").forEach((b) => {
        const cat = b.getAttribute("data-filter-category");
        if (cat === filterCategory) {
          b.className = "filter-cat-chip px-2 py-0.5 uppercase rounded-lg border bg-stone-accent text-white border-stone-accent font-bold transition-colors";
        } else {
          b.className = "filter-cat-chip px-2 py-0.5 uppercase rounded-lg border bg-white border-outline-variant text-secondary hover:text-stone-accent transition-colors";
        }
      });
      updateTasksListOnly(container);
    });
  });

  // 6. Search Input — updates list in-place without losing focus
  const searchInput = container.querySelector("#tasks-search");
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchQuery = e.target.value;
        updateTasksListOnly(container);
      }, 50);
    });
  }

  // Clear search
  container.querySelector("#tasks-search-clear")?.addEventListener("click", () => {
    searchQuery = "";
    if (searchInput) searchInput.value = "";
    updateTasksListOnly(container);
  });

  // 7. Task card actions (Event delegation)
  const listContainer = container.querySelector("#tasks-list-container");
  if (listContainer) {
    listContainer.addEventListener("click", async (e) => {
      const target = e.target.closest("button");
      if (!target) return;

      const action = target.getAttribute("data-action");
      const taskId = parseInt(target.getAttribute("data-task-id"), 10);
      if (!taskId) return;

      const task = store.state.tasks.find((t) => t.id === taskId);
      if (!task) return;

      if (action === "toggle-done") {
        await store.toggleTaskDone(taskId);
        updateTasksListOnly(container);
      } else if (action === "delete") {
        if (confirm(`Delete task #${task.id} ("${task.title}")?`)) {
          try {
            await api.deleteTask(taskId);
            store.showToast("Task deleted", "info");
            await store.refreshTasks();
            await store.refreshUserAndStats();
            updateTasksListOnly(container);
          } catch (err) {
            store.showToast(err.message || "Failed to delete task", "error");
          }
        }
      } else if (action === "edit") {
        openEditTaskModal(task, () => {
          updateTasksListOnly(container);
        });
      } else if (action === "focus") {
        store.startFocusTimer(task);
        location.hash = "#focus";
      } else if (action === "read") {
        openReaderModal(task, () => {
          store.refreshTasks();
          updateTasksListOnly(container);
        });
      } else if (action === "page-prev") {
        const newPage = Math.max(0, (task.page || 0) - 1);
        try {
          await api.updateBook(task.id, newPage);
          sound.playCoinTick();
          await store.refreshTasks();
          updateTasksListOnly(container);
        } catch (err) {
          store.showToast(err.message || "Failed to update page", "error");
        }
      } else if (action === "page-next") {
        const newPage = (task.page || 0) + 1;
        try {
          await api.updateBook(task.id, newPage);
          sound.playCoinTick();
          if (task.pages > 0 && newPage >= task.pages && task.status !== "done") {
            await api.markDone(task.id);
            sound.playComplete();
            store.showToast(`Completed book: "${task.book_title || task.title}"! (+${task.xp || 10} XP, +${task.coins || 10} coins)`, "success");
            await store.refreshUserAndStats();
          }
          await store.refreshTasks();
          updateTasksListOnly(container);
        } catch (err) {
          store.showToast(err.message || "Failed to advance page", "error");
        }
      }
    });
  }

  // 8. Quick Focus Logger Buttons
  container.querySelectorAll(".quick-focus-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mins = parseInt(btn.getAttribute("data-quick-focus"), 10);
      if (!mins) return;
      try {
        await api.logFocus(mins);
        sound.playComplete();
        const coinsEarned = Math.floor(mins / 2);
        store.showToast(`Logged ${mins}m focus session (+${mins} XP, +${coinsEarned} coins)`, "success");
        await store.refreshUserAndStats();
        updateTasksListOnly(container);
      } catch (err) {
        store.showToast(err.message || "Failed to log focus", "error");
      }
    });
  });
}
