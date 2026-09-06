// public/js/views/tasks.js
// Dashboard / Tasks view with Quick Add command bar, mode cards, filters, and telemetry sidebar

import { api } from "../api.js";
import { sound } from "../audio.js";
import { store } from "../store.js";
import { openReaderModal } from "./reader.js";

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAsciiBar(pct, blocks = 10) {
  const filled = Math.max(0, Math.min(blocks, Math.round((pct / 100) * blocks)));
  const empty = Math.max(0, blocks - filled);
  return "█".repeat(filled) + "░".repeat(empty);
}

function parseFlags(input) {
  let title = input;
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

  const bookMatch = title.match(/--book\s+(?:"([^"]+)"|'([^']+)'|(\S+))(?:\s+(\d+))?/);
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

  const tasks = store.state.tasks || [];
  const user = store.state.user || {};
  const stats = store.state.stats || {};
  const levelInfo = store.state.levelInfo || { level: 1, rank: "Apprentice", total_xp: 0, pct: 0 };
  const categories = ["code", "learn", "health", "read", "build"];

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

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start">
      <!-- ── Main Column: Command Bar, Filters, Task Cards (8 cols) ── -->
      <section class="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">

        <!-- 1. Quick Add Command Bar -->
        <div class="bg-surface-container-low border border-outline-variant p-4 md:p-6 shadow-md">
          <div class="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant/60 font-mono text-xs">
            <div class="flex items-center gap-2 text-stone-accent font-bold">
              <span>┌─[ + COMMAND // QUICK TASK CAPTURE ]</span>
            </div>
            <span class="text-outline text-[11px] hidden sm:inline-block">FLAGS: --at HH:MM · --mins N · --book "Title" P</span>
          </div>

          <form id="quick-add-form" class="flex flex-col gap-3">
            <!-- Row 1: Title input -->
            <div class="relative">
              <input
                id="quick-add-title"
                type="text"
                placeholder="[+ NEW TASK] Enter title... (flags: --at 14:00 --mins 25 --book 'Title' 100)"
                autocomplete="off"
                required
                class="w-full bg-surface-container-lowest border border-outline px-3 py-2.5 text-sm font-mono text-primary placeholder-outline focus:outline-none focus:border-stone-accent"
              />
            </div>

            <!-- Row 2: Category Pills -->
            <div class="flex flex-wrap items-center gap-1.5 font-mono text-xs">
              <span class="text-outline text-[11px] mr-1 uppercase">// CATEGORY:</span>
              ${categories
                .map(
                  (cat) => `
                <button
                  type="button"
                  data-category="${cat}"
                  class="cat-pill px-2.5 py-1 uppercase tracking-wide border ${
                    selectedCategory === cat
                      ? "bg-primary text-surface border-primary font-bold"
                      : "bg-surface-container border-outline-variant text-secondary hover:border-outline hover:text-primary"
                  } transition-colors"
                >
                  [${cat}]
                </button>
              `
                )
                .join("")}
            </div>

            <!-- Row 3: Mode Toggles & Inputs -->
            <div class="flex flex-wrap items-center gap-3 pt-2 border-t border-outline-variant/40 font-mono text-xs text-secondary">
              <!-- At Time -->
              <div class="flex items-center gap-1.5 bg-surface-container-lowest px-2 py-1 border border-outline-variant">
                <span class="text-outline text-[11px]">// AT:</span>
                <input
                  id="quick-add-at"
                  type="text"
                  placeholder="HH:MM"
                  pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]"
                  maxlength="5"
                  class="w-16 bg-transparent text-primary focus:outline-none font-bold placeholder-outline/60"
                />
              </div>

              <!-- Target Duration (Mins) -->
              <div class="flex items-center gap-1.5 bg-surface-container-lowest px-2 py-1 border border-outline-variant">
                <span class="text-outline text-[11px]">// MINS:</span>
                <input
                  id="quick-add-mins"
                  type="number"
                  min="0"
                  max="600"
                  placeholder="25"
                  class="w-14 bg-transparent text-primary focus:outline-none font-bold placeholder-outline/60"
                />
              </div>

              <!-- Book Mode Toggle Button -->
              <button
                type="button"
                id="quick-add-toggle-book"
                class="px-2.5 py-1 border ${
                  showBookInputs ? "bg-surface-container-high border-stone-accent text-primary font-bold" : "bg-surface-container border-outline-variant text-secondary"
                } hover:border-outline transition-colors"
              >
                [--book mode]
              </button>

              <!-- Submit Button -->
              <div class="ml-auto">
                <button
                  type="submit"
                  id="quick-add-btn"
                  class="quick-add px-4 py-1.5 bg-primary text-surface font-mono text-xs font-bold hover:bg-stone-accent transition-colors flex items-center gap-1.5"
                >
                  <span>[+ ADD TASK]</span>
                </button>
              </div>
            </div>

            <!-- Row 4: Book Mode Extended Inputs (shown if book mode active) -->
            <div id="quick-add-book-fields" class="${showBookInputs ? "flex" : "hidden"} flex-wrap items-center gap-3 p-2 bg-surface-container-lowest border border-outline-variant/60 font-mono text-xs">
              <div class="flex items-center gap-1.5 flex-1 min-w-[160px]">
                <span class="text-outline text-[11px]">// BOOK TITLE:</span>
                <input
                  id="quick-add-book-title"
                  type="text"
                  placeholder="Book title..."
                  class="flex-1 bg-transparent text-primary focus:outline-none font-bold"
                />
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-outline text-[11px]">// TOTAL PAGES:</span>
                <input
                  id="quick-add-pages"
                  type="number"
                  min="1"
                  placeholder="250"
                  class="w-16 bg-transparent text-primary focus:outline-none font-bold"
                />
              </div>
            </div>
          </form>
        </div>

        <!-- 2. Filter Row -->
        <div class="filter-row flex flex-wrap items-center justify-between gap-3 bg-surface-container-low border border-outline-variant p-3 font-mono text-xs">
          <!-- Status Chips -->
          <div class="flex items-center gap-1">
            <span class="text-outline text-[11px] uppercase mr-1">// STATUS:</span>
            ${["all", "open", "done"]
              .map(
                (st) => `
              <button
                data-filter-status="${st}"
                class="filter-status-chip px-2.5 py-0.5 uppercase tracking-wide border ${
                  filterStatus === st
                    ? "bg-primary text-surface border-primary font-bold"
                    : "bg-surface-container border-outline-variant text-secondary hover:text-primary"
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
            <span class="text-outline text-[11px] uppercase mr-1">// CAT:</span>
            <button
              data-filter-category="all"
              class="filter-cat-chip px-2 py-0.5 uppercase border ${
                filterCategory === "all"
                  ? "bg-stone-accent text-surface border-stone-accent font-bold"
                  : "bg-surface-container border-outline-variant text-secondary hover:text-primary"
              } transition-colors"
            >
              all
            </button>
            ${categories
              .map(
                (cat) => `
              <button
                data-filter-category="${cat}"
                class="filter-cat-chip px-2 py-0.5 uppercase border ${
                  filterCategory === cat
                    ? "bg-stone-accent text-surface border-stone-accent font-bold"
                    : "bg-surface-container border-outline-variant text-secondary hover:text-primary"
                } transition-colors"
              >
                ${cat}
              </button>
            `
              )
              .join("")}
          </div>

          <!-- Search Filter -->
          <div class="flex items-center gap-1 bg-surface-container-lowest px-2 py-1 border border-outline-variant w-full sm:w-48">
            <span class="material-symbols-outlined text-sm text-outline">search</span>
            <input
              id="tasks-search"
              type="text"
              placeholder="filter..."
              value="${escapeHtml(searchQuery)}"
              class="w-full bg-transparent text-primary text-xs focus:outline-none placeholder-outline"
            />
            ${
              searchQuery
                ? `<button id="tasks-search-clear" class="text-outline hover:text-primary text-xs">✕</button>`
                : ""
            }
          </div>
        </div>

        <!-- 3. Task Cards List -->
        <div id="tasks-list-container" class="flex flex-col gap-4">
          ${
            filteredTasks.length === 0
              ? `
            <div class="p-8 border border-outline-variant bg-surface-container-low text-center font-mono text-secondary">
              <p class="text-sm font-space text-primary mb-1">┌─[ NO TASKS FOUND ]────────────────────────┐</p>
              <p class="text-xs text-outline">No tasks match current filter parameters. Press <kbd class="px-1.5 py-0.5 bg-surface-container border border-outline-variant text-primary font-bold">A</kbd> or use command bar above.</p>
            </div>
          `
              : renderTaskGroups(filteredTasks)
          }
        </div>
      </section>

      <!-- ── Secondary Sidebar: Telemetry & Quick Focus Logger (4 cols) ── -->
      <aside class="lg:col-span-4 xl:col-span-3 flex flex-col gap-6">

        <!-- Telemetry & Daily Quota Card -->
        <div class="bg-surface-container-low border border-outline-variant p-4 md:p-5 shadow-md flex flex-col gap-4 font-mono text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-outline-variant/60">
            <span class="text-stone-accent font-bold tracking-wider">┌─[ TELEMETRY &amp; STATS ]</span>
            <span class="text-outline text-[11px]">[HUD v2.4]</span>
          </div>

          <!-- Stats Grid -->
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-surface-container-lowest p-3 border border-outline-variant flex flex-col">
              <span class="text-outline text-[11px] uppercase tracking-wider">// COMPLETED</span>
              <span class="text-base font-bold text-primary mt-1 font-space">${doneTasks} / ${totalTasks}</span>
              <span class="text-[10px] text-outline mt-0.5">${efficiency}% efficiency</span>
            </div>

            <div class="bg-surface-container-lowest p-3 border border-outline-variant flex flex-col">
              <span class="text-outline text-[11px] uppercase tracking-wider">// STREAK</span>
              <span class="text-base font-bold text-stone-accent mt-1 font-space">${streakDays} DAYS</span>
              <span class="text-[10px] text-outline mt-0.5">active cadence</span>
            </div>

            <div class="bg-surface-container-lowest p-3 border border-outline-variant flex flex-col">
              <span class="text-outline text-[11px] uppercase tracking-wider">// TOTAL XP</span>
              <span class="text-base font-bold text-primary mt-1 font-space">${totalXp}</span>
              <span class="text-[10px] text-secondary mt-0.5">${levelInfo.rank || "Apprentice"}</span>
            </div>

            <div class="bg-surface-container-lowest p-3 border border-outline-variant flex flex-col">
              <span class="text-outline text-[11px] uppercase tracking-wider">// COINS</span>
              <span class="text-base font-bold text-secondary-fixed mt-1 font-space">⟐ ${user.coins ?? 0}</span>
              <span class="text-[10px] text-outline mt-0.5">wallet balance</span>
            </div>
          </div>

          <!-- Segmented XP Level Progress -->
          <div class="bg-surface-container-lowest p-3 border border-outline-variant flex flex-col gap-1.5">
            <div class="flex justify-between items-center text-[11px]">
              <span class="text-secondary font-bold">[LVL ${levelInfo.level}] ${levelInfo.rank}</span>
              <span class="text-outline">${levelInfo.prog_xp || 0} / ${levelInfo.needed_xp || 100} XP (${levelInfo.pct || 0}%)</span>
            </div>
            <div class="w-full bg-surface-container h-2 border border-outline-variant overflow-hidden">
              <div class="bg-stone-accent h-full transition-all duration-300" style="width: ${levelInfo.pct || 0}%"></div>
            </div>
          </div>
        </div>

        <!-- Quick Focus Logger -->
        <div class="bg-surface-container-low border border-outline-variant p-4 md:p-5 shadow-md flex flex-col gap-3 font-mono text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-outline-variant/60">
            <span class="text-stone-accent font-bold tracking-wider">┌─[ QUICK FOCUS LOG ]</span>
            <span class="text-outline text-[11px]">+0.5 ⟐/min</span>
          </div>
          <p class="text-secondary text-[11px] leading-relaxed">
            Record completed offline work block without running live timer:
          </p>
          <div class="grid grid-cols-2 gap-2 mt-1">
            <button data-quick-focus="15" class="quick-focus-btn px-3 py-2 bg-surface-container hover:bg-surface-container-high border border-outline-variant hover:border-outline text-primary font-bold text-center transition-colors">
              +15 MINS
            </button>
            <button data-quick-focus="25" class="quick-focus-btn px-3 py-2 bg-surface-container hover:bg-surface-container-high border border-outline-variant hover:border-outline text-primary font-bold text-center transition-colors">
              +25 MINS
            </button>
            <button data-quick-focus="45" class="quick-focus-btn px-3 py-2 bg-surface-container hover:bg-surface-container-high border border-outline-variant hover:border-outline text-primary font-bold text-center transition-colors">
              +45 MINS
            </button>
            <button data-quick-focus="60" class="quick-focus-btn px-3 py-2 bg-surface-container hover:bg-surface-container-high border border-outline-variant hover:border-outline text-primary font-bold text-center transition-colors">
              +60 MINS
            </button>
          </div>
        </div>

        <!-- Hotkey Reference Card -->
        <div class="bg-surface-container-low border border-outline-variant p-4 font-mono text-[11px] text-outline flex flex-col gap-2">
          <span class="text-secondary font-bold uppercase tracking-wider">// HOTKEYS &amp; SYSTEM HINTS</span>
          <div class="flex justify-between"><span>[1] - [5]</span><span class="text-primary">Switch Navigation Views</span></div>
          <div class="flex justify-between"><span>[A]</span><span class="text-primary">Focus Quick Add Title</span></div>
          <div class="flex justify-between"><span>[Space]</span><span class="text-primary">Pause / Resume Focus</span></div>
          <div class="flex justify-between"><span>[Esc]</span><span class="text-primary">Close Modals / Cancel</span></div>
        </div>

      </aside>
    </div>
  `;

  bindViewEvents(container);
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
      <div class="task-category-group flex flex-col gap-3">
        <!-- Category Section Header -->
        <div class="flex items-center justify-between text-xs font-mono text-outline border-b border-outline-variant/60 pb-1 pt-2">
          <span class="text-stone-accent font-bold tracking-wider font-space text-sm">
            ┌─[ ${category.toUpperCase()} ]─────────────────────────────────────────
          </span>
          <span class="text-secondary font-code-stat shrink-0 ml-2">
            ${doneCount}/${totalCount} DONE
          </span>
        </div>

        <!-- Cards List -->
        <div class="flex flex-col gap-2">
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
  const isCheck = !isTime && !isBook;

  // Mode badge
  let modeBadge = `<span class="px-1.5 py-0.2 text-[10px] font-mono border border-outline-variant bg-surface-container text-outline">[✓ CHECK]</span>`;
  if (isTime) {
    modeBadge = `<span class="px-1.5 py-0.2 text-[10px] font-mono border border-outline text-secondary bg-surface-container font-bold">[⏱ TIME ${task.mins}m]</span>`;
  } else if (isBook) {
    modeBadge = `<span class="px-1.5 py-0.2 text-[10px] font-mono border border-outline text-stone-accent bg-surface-container font-bold">[📖 BOOK]</span>`;
  }

  // Scheduled slot badge
  const atBadge = task.at
    ? `<span class="px-1.5 py-0.2 text-[10px] font-mono border border-outline-variant bg-surface-container-lowest text-stone-accent">@ ${escapeHtml(task.at)}</span>`
    : "";

  // Progress metrics & visual bar
  let progressSection = "";
  if (isTime) {
    const spentMins = Math.floor((task.time_spent || 0) / 60);
    const targetMins = task.mins || 25;
    const pct = isDone ? 100 : Math.min(100, Math.round((spentMins / targetMins) * 100));
    const bar = renderAsciiBar(pct, 10);
    progressSection = `
      <div class="flex items-center gap-2 text-[11px] font-mono text-outline shrink-0 mt-1 sm:mt-0">
        <span class="text-primary font-mono select-none">${bar}</span>
        <span class="text-secondary">${spentMins}m / ${targetMins}m (${pct}%)</span>
      </div>
    `;
  } else if (isBook) {
    const curPage = task.page || 0;
    const totPages = task.pages || 0;
    const pct = isDone ? 100 : totPages > 0 ? Math.min(100, Math.round((curPage / totPages) * 100)) : 0;
    const bar = renderAsciiBar(pct, 10);
    progressSection = `
      <div class="flex items-center gap-2 text-[11px] font-mono text-outline shrink-0 mt-1 sm:mt-0">
        <span class="text-primary font-mono select-none">${bar}</span>
        <span class="text-secondary">p${curPage}/${totPages} (${pct}%)</span>
      </div>
    `;
  }

  // Interactive buttons depending on mode
  let modeActionBtn = "";
  if (isTime && !isDone) {
    modeActionBtn = `
      <button
        data-action="focus"
        data-task-id="${task.id}"
        class="task-focus-btn px-2.5 py-1 bg-surface-container-high hover:bg-stone-accent hover:text-surface border border-outline text-primary font-mono text-xs font-bold transition-colors whitespace-nowrap"
      >
        [▶ START FOCUS]
      </button>
    `;
  } else if (isBook) {
    modeActionBtn = `
      <div class="flex items-center gap-1">
        <button
          data-action="page-prev"
          data-task-id="${task.id}"
          class="task-page-prev-btn px-1.5 py-1 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-secondary hover:text-primary font-mono text-xs transition-colors"
          title="Step -1 Page"
        >
          -1
        </button>
        <button
          data-action="page-next"
          data-task-id="${task.id}"
          class="task-page-next-btn px-1.5 py-1 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-secondary hover:text-primary font-mono text-xs transition-colors"
          title="Step +1 Page"
        >
          +1
        </button>
        <button
          data-action="read"
          data-task-id="${task.id}"
          class="task-read-btn px-2.5 py-1 bg-surface-container-high hover:bg-stone-accent hover:text-surface border border-outline text-primary font-mono text-xs font-bold transition-colors whitespace-nowrap"
        >
          [📖 READ]
        </button>
      </div>
    `;
  }

  return `
    <div
      class="task-card p-3 md:p-4 bg-surface-container-low border ${
        isDone ? "border-outline-variant/30 opacity-70" : "border-outline-variant hover:border-outline"
      } transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
      data-task-id="${task.id}"
    >
      <!-- Left: Checkbox, Badges, Title -->
      <div class="flex items-start sm:items-center gap-3 min-w-0 flex-1">
        <!-- Industrial Square Checkbox -->
        <button
          data-action="toggle-done"
          data-task-id="${task.id}"
          class="task-checkbox-btn shrink-0 w-5 h-5 mt-0.5 sm:mt-0 border ${
            isDone ? "border-primary bg-stone-accent text-surface" : "border-outline bg-surface-container-lowest hover:border-primary"
          } flex items-center justify-center font-mono font-bold text-xs transition-colors"
          title="${isDone ? "Mark Open" : "Mark Done"}"
        >
          ${isDone ? "✓" : ""}
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
          <span class="task-title font-geist text-sm ${
            isDone ? "line-through text-outline" : "text-primary font-medium"
          } truncate">
            ${escapeHtml(task.title)}
          </span>
        </div>
      </div>

      <!-- Right: Progress Meter & Action Buttons -->
      <div class="flex items-center gap-3 shrink-0 self-end sm:self-center">
        ${progressSection}
        ${modeActionBtn}

        <!-- Delete Button -->
        <button
          data-action="delete"
          data-task-id="${task.id}"
          class="task-del-btn px-2 py-1 border border-outline-variant/50 hover:border-red-400 text-outline hover:text-red-400 font-mono text-xs transition-colors"
          title="Delete Task"
        >
          [DEL]
        </button>
      </div>
    </div>
  `;
}

function bindViewEvents(container) {
  // 1. Quick Add Category selection pills
  container.querySelectorAll(".cat-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCategory = btn.getAttribute("data-category") || "code";
      renderTasksView(container);
    });
  });

  // 2. Toggle Book Mode fields
  container.querySelector("#quick-add-toggle-book")?.addEventListener("click", () => {
    showBookInputs = !showBookInputs;
    renderTasksView(container);
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

    const taskPayload = {
      title: parsed.title || rawTitle,
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
      await store.refreshTasks();
      await store.refreshUserAndStats();
    } catch (err) {
      store.showToast(err.message || "Failed to create task", "error");
    }
  });

  // 4. Status Filter chips
  container.querySelectorAll(".filter-status-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterStatus = btn.getAttribute("data-filter-status") || "all";
      renderTasksView(container);
    });
  });

  // 5. Category Filter chips
  container.querySelectorAll(".filter-cat-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterCategory = btn.getAttribute("data-filter-category") || "all";
      renderTasksView(container);
    });
  });

  // 6. Search Input
  const searchInput = container.querySelector("#tasks-search");
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchQuery = e.target.value;
        renderTasksView(container);
      }, 150);
    });
  }

  // Clear search
  container.querySelector("#tasks-search-clear")?.addEventListener("click", () => {
    searchQuery = "";
    renderTasksView(container);
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
      } else if (action === "delete") {
        if (confirm(`Delete task #${task.id} ("${task.title}")?`)) {
          try {
            await api.deleteTask(taskId);
            store.showToast("Task deleted", "info");
            await store.refreshTasks();
            await store.refreshUserAndStats();
          } catch (err) {
            store.showToast(err.message || "Failed to delete task", "error");
          }
        }
      } else if (action === "focus") {
        store.startFocusTimer(task);
        location.hash = "#focus";
      } else if (action === "read") {
        openReaderModal(task, () => {
          store.refreshTasks();
        });
      } else if (action === "page-prev") {
        const newPage = Math.max(0, (task.page || 0) - 1);
        try {
          await api.updateBook(task.id, newPage);
          sound.playCoinTick();
          await store.refreshTasks();
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
            store.showToast(`Completed book: "${task.book_title || task.title}"! (+${task.xp || 10} XP, +${task.coins || 10} ⟐)`, "success");
            await store.refreshUserAndStats();
          }
          await store.refreshTasks();
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
        store.showToast(`Logged ${mins}m focus session (+${mins} XP, +${coinsEarned} ⟐)`, "success");
        await store.refreshUserAndStats();
      } catch (err) {
        store.showToast(err.message || "Failed to log focus", "error");
      }
    });
  });
}
