// public/js/views/timeline.js
// Daily Timeline view with 24h grid, mini calendar matrix, allocation gauges, and real-time NOW marker
// Blueprint Silicon light theme: white cards, cobalt accents, rounded shells, soft shadows.

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

export function parseAtTime(atStr) {
  if (!atStr || typeof atStr !== "string") return null;
  const match = atStr.trim().match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

export function formatHourSlot(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function formatMinutes(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function renderAsciiBar(pct, blocks = 20) {
  const filled = Math.max(0, Math.min(blocks, Math.round((pct / 100) * blocks)));
  const empty = Math.max(0, blocks - filled);
  return "█".repeat(filled) + "░".repeat(empty);
}

// ── Calendar Matrix Generator ──────────────────────────────────────────
export function generateCalendarMatrix(year, month, selectedDay = null) {
  const monthNames = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
  ];

  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday ... 6 = Saturday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days = [];

  // Previous month padding days
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    days.push({
      day: dayNum,
      isCurrentMonth: false,
      isPrevMonth: true,
      isNextMonth: false,
      isSelected: false,
      isToday: false,
      dateStr: `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`,
    });
  }

  // Current month days
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = isThisMonth && today.getDate() === d;
    const isSelected = selectedDay !== null ? selectedDay === d : isToday;
    days.push({
      day: d,
      isCurrentMonth: true,
      isPrevMonth: false,
      isNextMonth: false,
      isSelected,
      isToday,
      dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  // Next month padding days to complete full weeks (multiple of 7)
  const remaining = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    days.push({
      day: d,
      isCurrentMonth: false,
      isPrevMonth: false,
      isNextMonth: true,
      isSelected: false,
      isToday: false,
      dateStr: `${year}-${String(month + 2).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  return {
    year,
    month,
    monthLabel: monthNames[month],
    days,
  };
}

// ── Daily Allocation Calculation ─────────────────────────────────────────
export function calculateDailyAllocations(tasks = [], targetHours = 8.0) {
  const categoryCounts = {
    code: 0,
    learn: 0,
    health: 0,
    read: 0,
    build: 0,
  };

  let totalMinutes = 0;
  let unscheduledCount = 0;

  for (const t of tasks) {
    if (t.archived) continue;

    if (t.at && parseAtTime(t.at) !== null) {
      const mins = t.mins && t.mins > 0 ? t.mins : 30;
      totalMinutes += mins;

      const cat = (t.category || "code").toLowerCase();
      if (categoryCounts[cat] !== undefined) {
        categoryCounts[cat] += 1;
      } else {
        categoryCounts[cat] = 1;
      }
    } else if (t.status !== "done") {
      unscheduledCount += 1;
    }
  }

  const totalHours = totalMinutes / 60;
  const pct = Math.min(100, Math.round((totalHours / targetHours) * 100));

  return {
    totalMinutes,
    totalHours,
    targetHours,
    pct,
    categoryCounts,
    unscheduledCount,
  };
}

// ── State for Timeline View ─────────────────────────────────────────────
let currentDateOffset = 0; // 0 = TODAY, -1 = yesterday, +1 = tomorrow
let selectedCategoryFilter = "all";
let showFull24h = false;
let timelineIntervalId = null;
export let currentActiveTask = null;
export function getCurrentActiveTask() {
  return currentActiveTask;
}

export function cleanupTimelineView() {
  if (timelineIntervalId) {
    clearInterval(timelineIntervalId);
    timelineIntervalId = null;
  }
  currentActiveTask = null;
}

// ── Main View Renderer ──────────────────────────────────────────────────
export function renderTimelineView(container) {
  if (!container) return;

  cleanupTimelineView();

  const now = new Date();
  const viewingDate = new Date(now);
  viewingDate.setDate(viewingDate.getDate() + currentDateOffset);

  const year = viewingDate.getFullYear();
  const month = viewingDate.getMonth();
  const day = viewingDate.getDate();

  const dayOfWeekNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const dayName = dayOfWeekNames[viewingDate.getDay()];
  const monthNamesShort = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const dateFormatted = `${dayName} ${String(day).padStart(2, "0")} ${monthNamesShort[month]}`;

  const calMatrix = generateCalendarMatrix(year, month, currentDateOffset === 0 ? day : day);
  const tasks = store.state.tasks || [];
  const allocations = calculateDailyAllocations(tasks, 8.0);

  // Scheduled tasks sorted by start time
  const scheduledTasks = tasks
    .filter((t) => !t.archived && t.at && parseAtTime(t.at) !== null)
    .sort((a, b) => parseAtTime(a.at) - parseAtTime(b.at));

  // Current system minutes for NOW calculation
  const currentNow = new Date();
  const nowMins = currentNow.getHours() * 60 + currentNow.getMinutes();

  // Find active task and next task
  let activeTask = null;
  let nextTask = null;

  for (const t of scheduledTasks) {
    const startM = parseAtTime(t.at);
    const duration = t.mins && t.mins > 0 ? t.mins : 30;
    const endM = startM + duration;

    if (!activeTask && startM <= nowMins && nowMins < endM && t.status !== "done") {
      activeTask = {
        ...t,
        remaining_mins: endM - nowMins,
        elapsed_mins: nowMins - startM,
        duration,
        pct: Math.min(100, Math.round(((nowMins - startM) / duration) * 100)),
      };
    } else if (startM > nowMins && t.status !== "done") {
      if (!nextTask) {
        nextTask = {
          ...t,
          mins_until_start: startM - nowMins,
        };
      }
    }
  }

  currentActiveTask = activeTask;

  // Unscheduled tasks
  const unscheduledTasks = tasks.filter((t) => !t.archived && (!t.at || parseAtTime(t.at) === null) && t.status !== "done");

  // Determine hours range: default 06:00 to 23:00, or 00:00 to 23:00 if showFull24h
  const startHour = showFull24h ? 0 : 6;
  const endHour = 23;

  container.innerHTML = `
    <div class="grid grid-cols-12 gap-6 w-full items-start">
      <!-- ── LEFT PANE: Calendar, Filters, Allocations (Cols: 12 -> lg: 4 -> xl: 3) ── -->
      <aside class="col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col gap-6">

        <!-- 1. Mini Calendar Matrix Panel -->
        <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-4 flex flex-col gap-4">
          <div class="flex items-center justify-between font-mono text-xs">
            <span class="text-primary font-bold flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[16px]">calendar_month</span>
              CALENDAR
            </span>
            <span class="px-2 py-0.5 rounded-md bg-surface-subtle text-outline text-[11px] border border-outline-variant">
              WK ${Math.ceil((((viewingDate.getTime() - new Date(year, 0, 1).getTime()) / 86400000) + new Date(year, 0, 1).getDay() + 1) / 7)}
            </span>
          </div>

          <div class="flex items-baseline justify-between border-b border-outline-variant/70 pb-3">
            <div>
              <div class="font-sans text-base md:text-lg text-stone-accent font-extrabold tracking-tight">
                ${dateFormatted}
              </div>
              <div class="font-mono text-[11px] text-outline">
                ${currentDateOffset === 0 ? "LIVE · TODAY" : currentDateOffset < 0 ? "PAST DATE" : "FUTURE DATE"}
              </div>
            </div>

            <div class="flex items-center gap-1 font-mono text-xs text-secondary">
              <button id="cal-prev-btn" class="px-2 py-0.5 rounded-lg bg-white hover:bg-surface-subtle hover:text-stone-accent transition-colors border border-outline-variant" title="Previous Day">◀</button>
              <button id="cal-today-btn" class="px-2 py-0.5 rounded-lg bg-primary text-white font-bold border border-primary hover:bg-primary-strong transition-colors">
                ${currentDateOffset === 0 ? "TODAY" : "◀ TODAY ▶"}
              </button>
              <button id="cal-next-btn" class="px-2 py-0.5 rounded-lg bg-white hover:bg-surface-subtle hover:text-stone-accent transition-colors border border-outline-variant" title="Next Day">▶</button>
            </div>
          </div>

          <!-- Calendar Grid -->
          <div class="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant font-mono text-xs select-none">
            <div class="grid grid-cols-7 gap-1 text-center font-bold text-outline text-[11px] pb-2 border-b border-outline-variant/60 mb-1.5">
              <span>SU</span><span>MO</span><span>TU</span><span>WE</span><span>TH</span><span>FR</span><span>SA</span>
            </div>
            <div class="grid grid-cols-7 gap-1 text-center text-xs">
              ${calMatrix.days
                .map((d) => {
                  let classes = "py-1 rounded-md transition-colors ";
                  if (!d.isCurrentMonth) {
                    classes += "text-outline-variant opacity-40 ";
                  } else if (d.isSelected && currentDateOffset === 0) {
                    classes += "bg-primary text-white font-bold shadow-sm ";
                  } else if (d.isSelected) {
                    classes += "bg-surface-container-high text-stone-accent font-bold border border-outline ";
                  } else if (d.isToday) {
                    classes += "text-primary border border-blue-200 bg-primary-soft ";
                  } else {
                    classes += "text-secondary hover:text-stone-accent hover:bg-surface-subtle ";
                  }
                  return `<span class="${classes}">${String(d.day).padStart(2, "0")}</span>`;
                })
                .join("")}
            </div>
          </div>
        </div>

        <!-- 2. Category Counters & Quick Filter -->
        <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-4 flex flex-col gap-3 font-mono text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-outline-variant/70">
            <span class="text-primary font-bold">CATEGORY ALLOCATIONS</span>
            <span class="text-outline text-[11px]">${selectedCategoryFilter === "all" ? "ALL ACTIVE" : selectedCategoryFilter.toUpperCase()}</span>
          </div>

          <div class="flex flex-col gap-1.5">
            <button
              data-cat-filter="all"
              class="cat-filter-btn flex items-center justify-between px-3 py-1.5 rounded-lg border transition-all text-left ${
                selectedCategoryFilter === "all"
                  ? "bg-primary text-white border-primary font-bold"
                  : "bg-white border-outline-variant text-secondary hover:border-outline hover:text-stone-accent"
              }"
            >
              <span class="flex items-center gap-2 font-bold">All Categories</span>
              <span class="text-[11px]">${scheduledTasks.length} slots</span>
            </button>

            ${["code", "learn", "health", "read", "build"]
              .map((cat) => {
                const count = allocations.categoryCounts[cat] || 0;
                const isSel = selectedCategoryFilter === cat;
                return `
                  <button
                    data-cat-filter="${cat}"
                    class="cat-filter-btn flex items-center justify-between px-3 py-1.5 rounded-lg border transition-all text-left ${
                      isSel
                        ? "bg-primary text-white border-primary font-bold"
                        : "bg-white border-outline-variant text-secondary hover:border-outline hover:text-stone-accent"
                    }"
                  >
                    <span class="flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full bg-primary"></span>
                      <span>${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                    </span>
                    <span class="text-[11px] font-mono">${count} slot${count === 1 ? "" : "s"}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>

        <!-- 3. Daily Quotas / Allocation Meters -->
        <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-4 flex flex-col gap-4 font-mono text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-outline-variant/70">
            <span class="text-primary font-bold">DAILY ALLOCATIONS</span>
            <span class="text-stone-accent font-bold">${allocations.totalHours.toFixed(1)}h / ${allocations.targetHours.toFixed(1)}h</span>
          </div>

          <!-- Deep Focus Gauge -->
          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between text-xs">
              <span class="text-stone-accent font-bold">CORE DEEP FOCUS</span>
              <span class="text-primary font-bold">${allocations.totalHours.toFixed(1)}h [${allocations.pct}%]</span>
            </div>
            <div class="w-full bg-surface-subtle rounded-xl border border-outline-variant px-2 py-1.5 font-mono text-xs text-primary overflow-x-hidden select-none">
              ${renderAsciiBar(allocations.pct, 18)}
            </div>
            <div class="flex justify-between text-[11px] text-outline">
              <span>TARGET: 8h 00m</span>
              <span>${allocations.totalMinutes} MINS SCHEDULED</span>
            </div>
          </div>

          <!-- Habit / Done Meter -->
          <div class="flex flex-col gap-1.5 pt-2 border-t border-outline-variant/70">
            <div class="flex justify-between text-xs">
              <span class="text-secondary">SLOTS COMPLETED</span>
              <span class="text-primary font-bold">
                ${scheduledTasks.filter((t) => t.status === "done").length} / ${scheduledTasks.length}
              </span>
            </div>
            <div class="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
              <div
                class="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style="width: ${scheduledTasks.length > 0 ? Math.round((scheduledTasks.filter((t) => t.status === "done").length / scheduledTasks.length) * 100) : 0}%"
              ></div>
            </div>
          </div>

          <!-- Sync Status Box -->
          <div class="bg-surface-subtle p-2.5 rounded-xl flex items-center justify-between border border-outline-variant text-[11px]">
            <div class="flex items-center gap-2 text-secondary">
              <span class="material-symbols-outlined text-[15px] text-emerald-600">memory</span>
              <span>SYNC STATUS</span>
            </div>
            <span class="text-emerald-600 font-bold">LIVE [SSE]</span>
          </div>
        </div>

      </aside>

      <!-- ── MAIN PANE: Active Banner, 24h Timeline Grid, Unpinned Pool (Cols: 12 -> lg: 8 -> xl: 9) ── -->
      <main class="col-span-12 lg:col-span-8 xl:col-span-9 flex flex-col gap-6">

        <!-- 1. Top Action & Controls Bar -->
        <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-4 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-primary pulse-dot"></span>
            <span class="text-stone-accent font-bold">TIMELINE // SCHEDULE: ${dateFormatted}</span>
          </div>
          <div class="flex items-center gap-3">
            <button id="toggle-24h-btn" class="px-2.5 py-1 rounded-lg bg-white border border-outline-variant hover:border-outline text-secondary hover:text-stone-accent transition-colors">
              VIEW: ${showFull24h ? "FULL 24H (00-24)" : "DAYTIME (06-24)"}
            </button>
            <button id="timeline-new-slot-btn" class="px-3 py-1 rounded-xl bg-primary text-white font-bold hover:bg-primary-strong transition-colors flex items-center gap-1.5 shadow-md shadow-blue-500/20">
              <span>+ Schedule Item</span>
            </button>
          </div>
        </div>

        <!-- 2. Active Slot / Now Exec Callout Banner -->
        ${
          activeTask
            ? `
          <div class="bg-surface rounded-2xl border-2 border-primary p-5 shadow-card-md relative overflow-hidden flex flex-col gap-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-md bg-primary text-white font-bold text-xs animate-pulse font-mono">
                    ● NOW
                  </span>
                  <span class="text-outline text-xs font-mono">#${activeTask.id}</span>
                  <span class="px-2 py-0.5 rounded-md bg-surface-subtle border border-outline-variant text-stone-soft text-xs uppercase font-bold font-mono">
                    ${activeTask.category || "code"}
                  </span>
                </div>
                <h2 class="font-sans text-lg md:text-xl text-stone-accent font-extrabold mt-1">
                  ${escapeHtml(activeTask.title)}
                </h2>
                <div class="flex items-center gap-3 text-xs font-mono mt-0.5">
                  <span class="text-secondary">SLOT: ${activeTask.at} (${activeTask.duration}m)</span>
                  <span>•</span>
                  <span class="text-primary font-bold">+${activeTask.xp || 10} XP</span>
                  <span>•</span>
                  <span class="text-coin-amber font-bold">🪙 ${activeTask.coins || 10}</span>
                </div>
              </div>

              <!-- Big Countdown Readout -->
              <div class="text-right flex flex-col items-end">
                <div id="live-active-countdown" class="font-sans text-2xl md:text-3xl font-extrabold text-primary tracking-tight font-mono">
                  ${activeTask.remaining_mins}m 00s
                </div>
                <div class="text-[11px] text-outline tracking-wider font-mono">REMAINING // ${activeTask.duration}m TARGET</div>
              </div>
            </div>

            <!-- Segmented Progress Bar -->
            <div class="flex flex-col gap-1.5 bg-surface-subtle p-3 rounded-xl border border-outline-variant">
              <div class="flex items-center justify-between text-xs text-secondary font-bold font-mono">
                <span>PROG [ ${activeTask.elapsed_mins}m / ${activeTask.duration}m ]</span>
                <span class="text-primary">${activeTask.pct}%</span>
              </div>
              <div class="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
                <div class="bg-primary h-full rounded-full transition-all duration-300" style="width: ${activeTask.pct}%"></div>
              </div>
            </div>

            <!-- Action Triggers -->
            <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div class="flex items-center gap-2">
                <button
                  data-action="focus"
                  data-task-id="${activeTask.id}"
                  class="timeline-action-btn px-4 py-1.5 rounded-xl bg-primary text-white font-bold hover:bg-primary-strong transition-colors text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                >
                  <span class="material-symbols-outlined text-sm">play_arrow</span>
                  <span>▶ START FOCUS</span>
                </button>
                <button
                  data-action="toggle-done"
                  data-task-id="${activeTask.id}"
                  class="timeline-action-btn px-3 py-1.5 rounded-xl bg-white border border-outline-variant hover:border-primary text-secondary hover:text-primary transition-colors text-xs flex items-center gap-1.5 font-semibold"
                >
                  <span class="material-symbols-outlined text-sm">check_circle</span>
                  <span>Mark Done</span>
                </button>
              </div>

              <div class="text-[11px] text-outline font-mono">
                AUTO-SYNC WITH SERVER
              </div>
            </div>
          </div>
        `
            : `
          <!-- Idle / Next Up Callout Banner -->
          <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-4 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
            <div class="flex items-center gap-3">
              <span class="px-2 py-0.5 rounded-md bg-surface-subtle border border-outline-variant text-outline font-bold">
                IDLE // NO ACTIVE TASK
              </span>
              ${
                nextTask
                  ? `
                <span class="text-secondary">
                  NEXT UP: <strong class="text-stone-accent">${escapeHtml(nextTask.title)}</strong> at <strong class="text-primary">${nextTask.at}</strong> (in ~${nextTask.mins_until_start}m)
                </span>
              `
                  : `
                <span class="text-outline">No more scheduled tasks for today. Click an empty slot or unscheduled task to plan ahead.</span>
              `
              }
            </div>

            ${
              nextTask
                ? `
              <button
                data-action="focus"
                data-task-id="${nextTask.id}"
                class="timeline-action-btn px-3 py-1 rounded-xl bg-primary-soft border border-blue-200 hover:bg-blue-100 text-primary font-bold transition-colors"
              >
                ▶ START FOCUS
              </button>
            `
                : ""
            }
          </div>
        `
        }

        <!-- 3. Vertical Chronological Timeline Grid (06:00 to 23:00 / 24h) -->
        <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-4 md:p-6 flex flex-col font-mono text-xs relative">
          <div class="flex items-center justify-between pb-3 mb-2 border-b border-outline-variant/70">
            <span class="text-primary font-bold">24-HOUR CHRONOLOGICAL TIMELINE</span>
            <span class="text-outline text-[11px]">CLICK ANY EMPTY SLOT TO SCHEDULE</span>
          </div>

          <div id="timeline-hours-grid" class="flex flex-col relative divide-y divide-outline-variant/40">
            ${(() => {
              const currentH = currentNow.getHours();
              const currentM = currentNow.getMinutes();
              const nowTimeFormatted = `${String(currentH).padStart(2, "0")}:${String(currentM).padStart(2, "0")}:${String(currentNow.getSeconds()).padStart(2, "0")}`;

              let html = "";

              for (let h = startHour; h <= endHour; h++) {
                const hourStr = formatHourSlot(h);
                const hourStartMins = h * 60;
                const hourEndMins = (h + 1) * 60;

                // Find tasks scheduled in this hour slot
                const tasksInSlot = scheduledTasks.filter((t) => {
                  if (selectedCategoryFilter !== "all" && t.category !== selectedCategoryFilter) return false;
                  const tMins = parseAtTime(t.at);
                  return tMins >= hourStartMins && tMins < hourEndMins;
                });

                const isCurrentHour = currentDateOffset === 0 && currentH === h;

                // If current time falls at the beginning or within this hour, insert real-time NOW marker
                const shouldInsertNowMarker = currentDateOffset === 0 && currentH === h;

                html += `
                  <div class="py-2 flex flex-col gap-2 relative group" data-hour="${h}">
                    ${
                      shouldInsertNowMarker
                        ? `
                      <!-- Dynamic Real-Time NOW Marker Line -->
                      <div id="timeline-now-marker" class="my-1 py-1 px-3 rounded-xl bg-primary-soft border border-blue-300 text-primary font-bold flex items-center justify-between shadow-sm transition-all duration-300">
                        <div class="flex items-center gap-2">
                          <span class="w-2 h-2 rounded-full bg-primary animate-ping"></span>
                          <span class="tracking-wider live-marker-time">► NOW [${nowTimeFormatted}]</span>
                          <span class="hidden sm:inline text-[11px] opacity-70">// LIVE SYNC</span>
                        </div>
                        <span class="text-[11px] font-mono opacity-70">CYCLE RUNNING</span>
                      </div>
                    `
                        : ""
                    }

                    <div class="flex items-start gap-4">
                      <!-- Hour label -->
                      <div class="w-14 shrink-0 font-bold ${isCurrentHour ? "text-primary" : "text-outline"} pt-1 select-none">
                        ${hourStr}
                      </div>

                      <!-- Slot Contents -->
                      <div class="flex-1 flex flex-col gap-2">
                        ${
                          tasksInSlot.length > 0
                            ? tasksInSlot
                                .map((task) => {
                                  const isDone = task.status === "done";
                                  const isExecuting = activeTask && activeTask.id === task.id;
                                  return `
                              <div
                                class="p-3 rounded-xl border ${
                                  isExecuting
                                    ? "bg-primary-soft border-blue-300 shadow-sm"
                                    : isDone
                                    ? "bg-surface-subtle/50 border-outline-variant/50 opacity-70"
                                    : "bg-surface-container-lowest border-outline-variant hover:border-primary"
                                } transition-colors flex flex-col gap-2"
                                data-task-id="${task.id}"
                              >
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                  <div class="flex items-center gap-2 truncate">
                                    <button
                                      data-action="toggle-done"
                                      data-task-id="${task.id}"
                                      class="timeline-action-btn w-5 h-5 rounded-md border flex items-center justify-center font-bold transition-colors text-[10px] ${
                                        isDone
                                          ? "bg-emerald-500 border-emerald-600 text-white"
                                          : "border-slate-300 hover:border-primary bg-white text-transparent"
                                      }"
                                      title="${isDone ? "Mark Open" : "Mark Done"}"
                                    >
                                      ${isDone ? "✓" : ""}
                                    </button>

                                    <span class="px-1.5 py-0.5 rounded-md bg-surface-subtle border border-outline-variant text-[10px] uppercase font-bold text-stone-soft">
                                      ${task.category || "code"}
                                    </span>

                                    <span class="font-bold text-sm ${isDone ? "line-through text-outline" : "text-stone-accent"} truncate">
                                      ${escapeHtml(task.title)}
                                    </span>

                                    ${
                                      isExecuting
                                        ? `
                                      <span class="px-1.5 py-0.5 rounded-md bg-primary text-white text-[10px] font-bold animate-pulse">
                                        ● RUNNING
                                      </span>
                                    `
                                        : ""
                                    }
                                  </div>

                                  <div class="flex items-center gap-2 text-[11px] text-secondary shrink-0">
                                    <span class="text-primary font-bold">+${task.xp || 10} XP</span>
                                    <span class="text-coin-amber font-bold">🪙 ${task.coins || 10}</span>
                                    <span class="px-1.5 py-0.5 rounded-md bg-surface-subtle border border-outline-variant">
                                      @ ${task.at} (${task.mins || 30}m)
                                    </span>
                                  </div>
                                </div>

                                <!-- Action Buttons Row -->
                                <div class="flex items-center justify-between pt-1 border-t border-outline-variant/60 text-[11px]">
                                  <div class="flex items-center gap-2">
                                    ${
                                      !isDone
                                        ? `
                                      <button
                                        data-action="focus"
                                        data-task-id="${task.id}"
                                        class="timeline-action-btn px-2 py-0.5 rounded-lg bg-primary-soft border border-blue-200 hover:bg-blue-100 text-primary font-bold transition-colors flex items-center gap-1"
                                      >
                                        <span class="material-symbols-outlined text-[13px]">play_arrow</span>
                                        <span>Start Focus</span>
                                      </button>
                                    `
                                        : ""
                                    }

                                    <button
                                      data-action="reschedule"
                                      data-task-id="${task.id}"
                                      class="timeline-action-btn px-2 py-0.5 rounded-lg bg-white hover:bg-surface-subtle border border-outline-variant text-secondary hover:text-stone-accent transition-colors"
                                    >
                                      Edit Time
                                    </button>

                                    <button
                                      data-action="delete"
                                      data-task-id="${task.id}"
                                      class="timeline-action-btn px-2 py-0.5 rounded-lg bg-white hover:bg-danger-soft border border-transparent hover:border-red-200 text-outline hover:text-danger transition-colors"
                                    >
                                      Remove
                                    </button>
                                  </div>

                                  <div class="text-[10px] text-outline">
                                    ${isDone ? "STATUS: RESOLVED" : `BURST // ${task.mins || 30}m`}
                                  </div>
                                </div>
                              </div>
                            `;
                                })
                                .join("")
                            : `
                          <!-- Empty Slot Row (Clickable) -->
                          <div
                            class="empty-slot-btn py-2 px-3 rounded-xl border border-dashed border-outline-variant hover:border-primary hover:bg-primary-soft/40 transition-colors cursor-pointer text-outline hover:text-primary flex items-center justify-between"
                            data-hour-slot="${hourStr}"
                          >
                            <span>+ [EMPTY // Click to schedule task at ${hourStr}]</span>
                            <span class="text-[11px] opacity-60">openQuickScheduleModal</span>
                          </div>
                        `
                        }
                      </div>
                    </div>
                  </div>
                `;
              }
              return html;
            })()}
          </div>
        </div>

        <!-- 4. Unpinned Flex Queue -->
        <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-4 flex flex-col gap-3 font-mono text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-outline-variant/70">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-sm text-primary">data_array</span>
              <span class="text-primary font-bold">UNPINNED FLEX QUEUE</span>
            </div>
            <span class="text-outline text-[11px]">${unscheduledTasks.length} READY // CLICK TO SCHEDULE</span>
          </div>

          ${
            unscheduledTasks.length > 0
              ? `
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pt-1">
              ${unscheduledTasks
                .slice(0, 9)
                .map((task) => {
                  return `
                <div class="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant hover:border-primary transition-all flex flex-col justify-between gap-2">
                  <div class="flex items-center justify-between">
                    <span class="px-1.5 py-0.5 rounded-md bg-surface-subtle border border-outline-variant text-[10px] uppercase font-bold text-stone-soft">
                      ${task.category || "code"}
                    </span>
                    <span class="text-[11px] text-outline">#T${task.id}</span>
                  </div>

                  <div class="font-bold text-stone-accent truncate" title="${escapeHtml(task.title)}">
                    ${escapeHtml(task.title)}
                  </div>

                  <div class="flex items-center justify-between pt-2 border-t border-outline-variant/60 text-[11px]">
                    <span class="text-secondary">${task.mins || 25}m • +${task.xp || 10} XP</span>
                    <button
                      data-action="schedule-unscheduled"
                      data-task-id="${task.id}"
                      class="timeline-action-btn px-2 py-0.5 rounded-lg bg-primary text-white font-bold hover:bg-primary-strong transition-colors"
                    >
                      @ Schedule
                    </button>
                  </div>
                </div>
              `;
                })
                .join("")}
            </div>
          `
              : `
            <div class="p-4 rounded-xl bg-surface-subtle border border-outline-variant/60 text-center text-outline">
              No unscheduled open tasks. All items are mapped to timeline slots!
            </div>
          `
          }
        </div>

      </main>
    </div>

    <!-- Quick Schedule Modal Dialog -->
    <dialog id="quick-schedule-dialog" class="bg-surface border border-outline-variant text-stone-accent p-6 max-w-md w-full rounded-2xl shadow-2xl backdrop:bg-slate-900/50 font-mono text-xs">
      <form method="dialog" id="quick-schedule-form">
        <h2 class="font-sans text-base font-extrabold mb-1 text-stone-accent">Schedule Timeline Slot</h2>
        <p id="schedule-modal-subtitle" class="text-secondary mb-3 text-[11px]">Assign an existing task or create a new slot at this hour.</p>

        <!-- Prominent Rescheduling Banner (shown when editing an existing slot) -->
        <div id="schedule-reschedule-banner" class="hidden mb-4 p-2.5 rounded-xl bg-primary-soft border border-blue-300 text-primary flex items-center justify-between">
          <div class="flex flex-col gap-0.5 min-w-0">
            <span class="text-[10px] text-primary font-bold">// RESCHEDULING TASK:</span>
            <span id="schedule-reschedule-title" class="font-bold truncate text-stone-accent text-xs"></span>
          </div>
          <span id="schedule-reschedule-cat" class="px-1.5 py-0.5 rounded-md bg-white border border-blue-200 text-[10px] uppercase font-bold text-primary ml-2 shrink-0"></span>
        </div>

        <div class="space-y-4 mb-6">
          <!-- Time Slot Field -->
          <div>
            <label class="block text-secondary mb-1">TIME SLOT (HH:MM):</label>
            <input
              id="schedule-slot-time"
              type="text"
              required
              pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]"
              maxlength="5"
              placeholder="14:00"
              class="w-full bg-surface-subtle border border-outline-variant px-3 py-2 text-sm text-stone-accent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-bold"
            />
          </div>

          <!-- Mode Picker: Pick Existing or Create New -->
          <div id="schedule-tabs-row" class="flex items-center gap-2 pt-1 border-t border-outline-variant/60">
            <button
              type="button"
              id="tab-pick-existing"
              class="flex-1 py-1.5 rounded-xl bg-primary text-white font-bold border border-primary text-center"
            >
              Pick Existing Task
            </button>
            <button
              type="button"
              id="tab-create-new"
              class="flex-1 py-1.5 rounded-xl bg-white text-secondary border border-outline-variant hover:border-outline text-center"
            >
              + Create New Task
            </button>
          </div>

          <!-- Pick Existing Task Section -->
          <div id="section-pick-existing" class="space-y-3">
            <label class="block text-secondary mb-1">SELECT TASK:</label>
            <select
              id="schedule-task-select"
              class="w-full bg-surface-subtle border border-outline-variant px-3 py-2 text-xs text-stone-accent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">-- Choose task to assign --</option>
              ${unscheduledTasks
                .map((t) => `<option value="${t.id}">#${t.id}: ${escapeHtml(t.title)} [${t.category || "code"}]</option>`)
                .join("")}
            </select>
          </div>

          <!-- Create New Task Section (hidden by default) -->
          <div id="section-create-new" class="space-y-3 hidden">
            <div>
              <label class="block text-secondary mb-1">TASK TITLE:</label>
              <input
                id="schedule-new-title"
                type="text"
                placeholder="Deep work slot..."
                class="w-full bg-surface-subtle border border-outline-variant px-3 py-2 text-xs text-stone-accent rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-secondary mb-1">CATEGORY:</label>
                <select
                  id="schedule-new-category"
                  class="w-full bg-surface-subtle border border-outline-variant px-2 py-1.5 text-xs text-stone-accent rounded-xl focus:outline-none"
                >
                  <option value="code">code</option>
                  <option value="learn">learn</option>
                  <option value="health">health</option>
                  <option value="read">read</option>
                  <option value="build">build</option>
                </select>
              </div>
              <div>
                <label class="block text-secondary mb-1">DURATION (MINS):</label>
                <input
                  id="schedule-new-mins"
                  type="number"
                  min="5"
                  max="600"
                  value="45"
                  class="w-full bg-surface-subtle border border-outline-variant px-2 py-1.5 text-xs text-stone-accent rounded-xl focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 font-mono text-xs">
          <button
            type="button"
            id="schedule-cancel-btn"
            class="px-4 py-2 rounded-xl border border-outline-variant hover:border-outline text-secondary hover:text-stone-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            id="schedule-submit-btn"
            class="px-4 py-2 rounded-xl bg-primary text-white font-bold hover:bg-primary-strong transition-colors shadow-md shadow-blue-500/20"
          >
            Confirm Slot
          </button>
        </div>
      </form>
    </dialog>
  `;

  // ── Bind Event Handlers ───────────────────────────────────────────────
  bindTimelineEvents(container);

  // ── Start Live Clock Ticker for NOW Marker ────────────────────────────
  timelineIntervalId = setInterval(() => {
    updateTimelineLiveClocks(container);
  }, 1000);
}

// ── Live Clock & Countdown Updates (Every 1s) ───────────────────────────
export function updateTimelineLiveClocks(container) {
  if (!container) return;
  const now = new Date();
  const currentH = now.getHours();
  const currentM = now.getMinutes();
  const currentS = now.getSeconds();
  const timeFormatted = `${String(currentH).padStart(2, "0")}:${String(currentM).padStart(2, "0")}:${String(currentS).padStart(2, "0")}`;

  // 1. Dynamic NOW Marker positioning & hour rollover
  if (currentDateOffset === 0) {
    let marker = container.querySelector("#timeline-now-marker");
    const currentHourSlot = container.querySelector(`[data-hour="${currentH}"]`);

    if (currentHourSlot) {
      if (!marker) {
        marker = document.createElement("div");
        marker.id = "timeline-now-marker";
        marker.className = "my-1 py-1 px-3 rounded-xl bg-primary-soft border border-blue-300 text-primary font-bold flex items-center justify-between shadow-sm transition-all duration-300";
        marker.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-primary animate-ping"></span>
            <span class="tracking-wider live-marker-time">► NOW [${timeFormatted}]</span>
            <span class="hidden sm:inline text-[11px] opacity-70">// LIVE SYNC</span>
          </div>
          <span class="text-[11px] font-mono opacity-70">CYCLE RUNNING</span>
        `;
        currentHourSlot.prepend(marker);
      } else {
        const parentHourSlot = marker.closest("[data-hour]");
        if (parentHourSlot && parentHourSlot.getAttribute("data-hour") !== String(currentH)) {
          // Hour rollover: move marker to the new hour slot
          currentHourSlot.prepend(marker);
        }
      }

      // Minute offset within hour: 0% to 100%
      const minutePct = ((currentM * 60 + currentS) / 3600) * 100;
      marker.dataset.minuteOffset = String(minutePct.toFixed(1));
      marker.style.transform = `translateY(${Math.min(12, (minutePct / 100) * 16)}px)`;

      const textEl = marker.querySelector(".live-marker-time") || marker.querySelector(".tracking-wider");
      if (textEl) {
        textEl.textContent = `► NOW [${timeFormatted}]`;
      }
    } else if (marker) {
      marker.remove();
    }
  }

  // 2. Active Slot Countdown & Auto-transition
  const countdownEl = container.querySelector("#live-active-countdown");
  if (countdownEl) {
    if (store.state.activeTimer && store.state.activeTimer.running) {
      const rem = Math.max(0, store.state.activeTimer.targetSeconds - store.state.activeTimer.elapsedSeconds);
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      countdownEl.textContent = `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
    } else if (currentActiveTask && currentActiveTask.at) {
      const startMins = parseAtTime(currentActiveTask.at);
      const duration = currentActiveTask.mins && currentActiveTask.mins > 0 ? currentActiveTask.mins : 30;
      const endMinutes = startMins + duration;
      const nowSeconds = currentH * 3600 + currentM * 60 + currentS;
      const remainingSeconds = endMinutes * 60 - nowSeconds;

      if (remainingSeconds > 0) {
        const m = Math.floor(remainingSeconds / 60);
        const s = remainingSeconds % 60;
        countdownEl.textContent = `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
      } else {
        // Active slot ended -> transition to idle / re-render
        currentActiveTask = null;
        renderTimelineView(container);
        return;
      }
    }
  } else {
    // If showing IDLE, check if a scheduled slot just became active
    const nowMins = currentH * 60 + currentM;
    const tasks = store.state.tasks || [];
    const shouldBeActive = tasks.find((t) => {
      if (t.archived || t.status === "done" || !t.at) return false;
      const startM = parseAtTime(t.at);
      if (startM === null) return false;
      const duration = t.mins && t.mins > 0 ? t.mins : 30;
      return startM <= nowMins && nowMins < startM + duration;
    });

    if (shouldBeActive && (!currentActiveTask || currentActiveTask.id !== shouldBeActive.id)) {
      renderTimelineView(container);
      return;
    }
  }
}

// ── Event Handlers ──────────────────────────────────────────────────────
function bindTimelineEvents(container) {
  // 1. Calendar Day Navigation
  container.querySelector("#cal-prev-btn")?.addEventListener("click", () => {
    currentDateOffset -= 1;
    renderTimelineView(container);
  });

  container.querySelector("#cal-next-btn")?.addEventListener("click", () => {
    currentDateOffset += 1;
    renderTimelineView(container);
  });

  container.querySelector("#cal-today-btn")?.addEventListener("click", () => {
    currentDateOffset = 0;
    renderTimelineView(container);
  });

  // 2. Category Filter Buttons
  container.querySelectorAll(".cat-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCategoryFilter = btn.getAttribute("data-cat-filter") || "all";
      renderTimelineView(container);
    });
  });

  // 3. Toggle 24h / Daytime View
  container.querySelector("#toggle-24h-btn")?.addEventListener("click", () => {
    showFull24h = !showFull24h;
    renderTimelineView(container);
  });

  // 4. Click Empty Slot to Schedule
  container.querySelectorAll(".empty-slot-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slotTime = btn.getAttribute("data-hour-slot") || "09:00";
      openQuickScheduleModal(slotTime, null, container);
    });
  });

  // 5. Schedule New Button in Top Bar
  container.querySelector("#timeline-new-slot-btn")?.addEventListener("click", () => {
    const now = new Date();
    const defaultTime = `${String(now.getHours()).padStart(2, "0")}:00`;
    openQuickScheduleModal(defaultTime, null, container);
  });

  // 6. Action Button Delegations (Done, Focus, Reschedule, Delete)
  container.querySelectorAll(".timeline-action-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const action = btn.getAttribute("data-action");
      const taskId = parseInt(btn.getAttribute("data-task-id"), 10);
      if (!taskId) return;

      const task = store.state.tasks.find((t) => t.id === taskId);
      if (!task) return;

      if (action === "toggle-done") {
        await store.toggleTaskDone(taskId);
        renderTimelineView(container);
      } else if (action === "focus") {
        store.startFocusTimer(task);
        location.hash = "#focus";
      } else if (action === "reschedule") {
        openQuickScheduleModal(task.at || "12:00", taskId, container);
      } else if (action === "schedule-unscheduled") {
        const now = new Date();
        const defaultTime = `${String(now.getHours()).padStart(2, "0")}:00`;
        openQuickScheduleModal(defaultTime, taskId, container);
      } else if (action === "delete") {
        if (confirm(`Remove slot #${task.id} ("${task.title}") from schedule?`)) {
          try {
            await api.updateTask(taskId, { at: null });
            store.showToast(`Unscheduled "${task.title}"`, "info");
            await store.refreshTasks();
            renderTimelineView(container);
          } catch (err) {
            store.showToast(err.message || "Failed to remove slot", "error");
          }
        }
      }
    });
  });
}

// ── Quick Schedule Modal Dialog Controller ───────────────────────────────
export function openQuickScheduleModal(initialTimeStr = "12:00", preselectedTaskId = null, viewContainer = null) {
  const dialog = document.getElementById("quick-schedule-dialog");
  if (!dialog) return;

  const timeInput = document.getElementById("schedule-slot-time");
  const taskSelect = document.getElementById("schedule-task-select");
  const tabPick = document.getElementById("tab-pick-existing");
  const tabCreate = document.getElementById("tab-create-new");
  const sectionPick = document.getElementById("section-pick-existing");
  const sectionCreate = document.getElementById("section-create-new");
  const titleInput = document.getElementById("schedule-new-title");
  const catSelect = document.getElementById("schedule-new-category");
  const minsInput = document.getElementById("schedule-new-mins");
  const cancelBtn = document.getElementById("schedule-cancel-btn");
  const form = document.getElementById("quick-schedule-form");
  const banner = document.getElementById("schedule-reschedule-banner");
  const bannerTitle = document.getElementById("schedule-reschedule-title");
  const bannerCat = document.getElementById("schedule-reschedule-cat");

  if (timeInput) timeInput.value = initialTimeStr;

  const tasks = store.state.tasks || [];
  const preselTask = preselectedTaskId ? tasks.find((t) => t.id === preselectedTaskId) : null;

  // Prominent banner display for rescheduling
  if (preselTask && banner && bannerTitle && bannerCat) {
    bannerTitle.textContent = `#${preselTask.id}: ${preselTask.title}`;
    bannerCat.textContent = `[${preselTask.category || "code"}]`;
    banner.classList.remove("hidden");
  } else if (banner) {
    banner.classList.add("hidden");
  }

  // Populate task options ensuring preselectedTask is included even if already scheduled
  if (taskSelect) {
    const unscheduledTasks = tasks.filter((t) => !t.archived && (!t.at || parseAtTime(t.at) === null) && t.status !== "done");
    let options = '<option value="">-- Choose task to assign --</option>';

    if (preselTask) {
      options += `<option value="${preselTask.id}" selected>#${preselTask.id}: ${escapeHtml(preselTask.title)} [${preselTask.category || "code"}] (Selected)</option>`;
    }

    for (const t of unscheduledTasks) {
      if (!preselTask || t.id !== preselTask.id) {
        options += `<option value="${t.id}">#${t.id}: ${escapeHtml(t.title)} [${t.category || "code"}]</option>`;
      }
    }
    taskSelect.innerHTML = options;
    if (preselTask) {
      taskSelect.value = String(preselTask.id);
    }
  }

  let activeTab = "pick"; // "pick" | "create"

  function updateTabs() {
    if (activeTab === "pick") {
      tabPick.className = "flex-1 py-1.5 rounded-xl bg-primary text-white font-bold border border-primary text-center";
      tabCreate.className = "flex-1 py-1.5 rounded-xl bg-white text-secondary border border-outline-variant hover:border-outline text-center";
      sectionPick.classList.remove("hidden");
      sectionCreate.classList.add("hidden");
    } else {
      tabCreate.className = "flex-1 py-1.5 rounded-xl bg-primary text-white font-bold border border-primary text-center";
      tabPick.className = "flex-1 py-1.5 rounded-xl bg-white text-secondary border border-outline-variant hover:border-outline text-center";
      sectionCreate.classList.remove("hidden");
      sectionPick.classList.add("hidden");
    }
  }

  updateTabs();

  // Clean listener cleanup using property assignments (prevents stacking)
  tabPick.onclick = () => {
    activeTab = "pick";
    updateTabs();
  };

  tabCreate.onclick = () => {
    activeTab = "create";
    updateTabs();
  };

  cancelBtn.onclick = () => dialog.close();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const timeVal = (timeInput?.value || "").trim();
    if (!parseAtTime(timeVal)) {
      alert("Please enter a valid HH:MM time (e.g. 09:30 or 14:00)");
      return;
    }

    try {
      if (activeTab === "pick") {
        const taskId = parseInt(taskSelect?.value, 10) || (preselTask ? preselTask.id : null);
        if (!taskId) {
          alert("Please select a task from the list, or switch to '+ Create New Task'.");
          return;
        }
        await api.updateTask(taskId, { at: timeVal });
        sound.playCoinTick();
        store.showToast(`Rescheduled #${taskId} to ${timeVal}`, "success");
      } else {
        const titleVal = (titleInput?.value || "").trim();
        if (!titleVal) {
          alert("Please enter a task title.");
          return;
        }
        const catVal = catSelect?.value || "code";
        const minsVal = parseInt(minsInput?.value, 10) || 30;

        await api.createTask({
          title: titleVal,
          category: catVal,
          at: timeVal,
          mins: minsVal,
        });
        sound.playCoinTick();
        store.showToast(`Created & scheduled "${titleVal}" at ${timeVal}`, "success");
      }

      await store.refreshTasks();
      dialog.close();

      const container = viewContainer || document.getElementById("view-root");
      if (container && store.state.currentView === "timeline") {
        renderTimelineView(container);
      }
    } catch (err) {
      alert(err.message || "Failed to schedule slot");
    }
  };

  dialog.showModal();
}
