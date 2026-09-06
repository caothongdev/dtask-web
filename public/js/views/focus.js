// public/js/views/focus.js
// Live Focus Engine terminal HUD with btop ASCII fill meters, digital clock,
// XP & coin accrual cards, execution controls, and dual-mode Relax Daemon.
// Modes: FOCUS_DAEMON // RUNNING | RELAX_DAEMON // COOLDOWN | FOCUS_DAEMON // STANDBY
// Hotkeys: [Space] Pause / Resume | [Enter] Mark Complete Now | [Ctrl+C / Esc] Stop & Bank

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

// ── Pure Helpers (Exported for Unit Tests & Live Telemetry) ─────────────

export function renderBtopAsciiBar(pct = 0, blocks = 20) {
  const safePct = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round((safePct / 100) * blocks);
  const empty = Math.max(0, blocks - filled);
  return "█".repeat(filled) + "░".repeat(empty);
}

export function formatTime(s) {
  const sec = Math.max(0, Math.floor(s || 0));
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function calculateAccruals(elapsedSeconds = 0, targetSeconds = 1500, task = {}) {
  const safeTargetSec = Math.max(1, targetSeconds || 1500);
  const targetMins = safeTargetSec / 60;
  const targetXp = task?.xp && task.xp > 0 ? task.xp : Math.max(10, Math.round(targetMins * 1.0));
  const targetCoins = task?.coins && task.coins > 0 ? task.coins : Math.max(5, Math.floor(targetMins * 0.5));

  const pct = Math.round((elapsedSeconds / safeTargetSec) * 100);
  const progressRatio = elapsedSeconds / safeTargetSec;

  const accruedXp = Math.round(targetXp * progressRatio);
  const accruedCoins = Math.floor((elapsedSeconds / 60) * 0.5); // 0.5 coins per minute banked

  const xpRatePerMin = targetMins > 0 ? targetXp / targetMins : 1.0;
  const coinRatePerMin = 0.5;

  return {
    targetXp,
    targetCoins,
    accruedXp,
    accruedCoins,
    pct,
    xpRatePerMin,
    coinRatePerMin,
  };
}

// ── Focus View Module State ─────────────────────────────────────────────

let mountedContainer = null;
let currentRenderedMode = null; // "focus" | "relax" | "standby"
let localTickerId = null;
let autoBreakEnabled = true;
let selectedAudioEngine = "binaural"; // "binaural" | "tokyo" | "ambient"
let unsubFocusCompleted = null;

export function getAutoBreakEnabled() {
  return autoBreakEnabled;
}

export function setAutoBreakEnabled(val) {
  autoBreakEnabled = !!val;
}

export function setupFocusCompletedListener() {
  if (!unsubFocusCompleted) {
    unsubFocusCompleted = store.subscribe("focus_completed", () => {
      if (autoBreakEnabled) {
        store.startRelaxTimer(5, "Guilt-Free Break");
        store.showToast("Focus completed! Auto-break handover activated.", "success");
      }
    });
  }
}

// ── Keyboard Hotkey Handler ─────────────────────────────────────────────

export function handleFocusKeydown(e) {
  // Never intercept keys when user is typing in form inputs
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable)) {
    return;
  }

  // If a modal dialog is open, let Escape close the dialog instead of banking the timer
  if (e.code === "Escape" && typeof document !== "undefined" && document.querySelector("dialog[open]")) {
    return;
  }

  // [Shift+Tab]: Quick switch to Relax Mode immediately
  if (e.shiftKey && (e.code === "Tab" || e.key === "Tab")) {
    e.preventDefault();
    if (store.state.activeTimer) {
      store.stopFocusTimer(true);
    }
    store.startRelaxTimer(5, "Guilt-Free Break");
    store.showToast("Switched to Relax Daemon cooldown", "info");
    return;
  }

  // [Ctrl+C]: Stop & Bank active session if no text is selected
  if (e.ctrlKey && (e.key === "c" || e.key === "C" || e.code === "KeyC")) {
    const selectedText = typeof window !== "undefined" && window.getSelection ? window.getSelection().toString() : "";
    if (!selectedText && store.state.activeTimer) {
      e.preventDefault();
      store.stopFocusTimer(true);
      store.showToast("Focus session stopped and banked", "info");
      return;
    }
  }

  // 1. Focus Mode Hotkeys
  if (store.state.activeTimer) {
    if (e.code === "Space") {
      e.preventDefault();
      if (store.state.activeTimer.running) {
        store.pauseFocusTimer();
      } else {
        store.resumeFocusTimer();
      }
    } else if (e.code === "Enter") {
      e.preventDefault();
      const task = store.state.activeTimer.task;
      store.stopFocusTimer(true);
      if (task?.id) {
        store.toggleTaskDone(task.id);
      }
    } else if (e.code === "Escape") {
      e.preventDefault();
      store.stopFocusTimer(true);
      store.showToast("Focus session stopped and banked", "info");
    }
    return;
  }

  // 2. Relax Mode Hotkeys
  if (store.state.relaxTimer) {
    if (e.code === "Space") {
      e.preventDefault();
      if (store.state.relaxTimer.running) {
        store.pauseRelaxTimer();
      } else {
        store.resumeRelaxTimer();
      }
    } else if (e.code === "Enter" || e.code === "Escape") {
      e.preventDefault();
      store.stopRelaxTimer();
      store.showToast("Relax Daemon dismissed. Ready for work.", "info");
    }
  }
}

// ── Cleanup View ────────────────────────────────────────────────────────

export function cleanupFocusView() {
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", handleFocusKeydown);
  }
  if (localTickerId) {
    clearInterval(localTickerId);
    localTickerId = null;
  }
  if (unsubFocusCompleted) {
    unsubFocusCompleted();
    unsubFocusCompleted = null;
  }
  mountedContainer = null;
  currentRenderedMode = null;
}

// ── Live Fine-Grained Telemetry Updater ──────────────────────────────────

function updateLiveTelemetry() {
  if (!mountedContainer) return;

  // Mode 1: Active Focus Timer
  if (store.state.activeTimer) {
    const timer = store.state.activeTimer;
    const accrual = calculateAccruals(timer.elapsedSeconds, timer.targetSeconds, timer.task);
    const rem = Math.max(0, timer.targetSeconds - timer.elapsedSeconds);

    const elapsedEl = mountedContainer.querySelector("#focus-elapsed");
    if (elapsedEl) elapsedEl.textContent = formatTime(timer.elapsedSeconds);

    const targetEl = mountedContainer.querySelector("#focus-target");
    if (targetEl) targetEl.textContent = formatTime(timer.targetSeconds);

    const remEl = mountedContainer.querySelector("#focus-remaining");
    if (remEl) remEl.textContent = `⏳ ${formatTime(rem)} REMAINING`;

    const tickCountEl = mountedContainer.querySelector("#focus-tick-count");
    if (tickCountEl) tickCountEl.textContent = `[TICK: ${timer.elapsedSeconds}s]`;

    const pctLabelEl = mountedContainer.querySelector("#focus-pct-label");
    if (pctLabelEl) pctLabelEl.textContent = `${accrual.pct}% EXEC`;

    const timeSubEl = mountedContainer.querySelector("#focus-time-sub");
    if (timeSubEl) timeSubEl.textContent = `[${(timer.elapsedSeconds / 60).toFixed(1)} / ${(timer.targetSeconds / 60).toFixed(1)} MIN]`;

    const asciiMeterEl = mountedContainer.querySelector("#focus-ascii-meter");
    if (asciiMeterEl) asciiMeterEl.textContent = renderBtopAsciiBar(accrual.pct, 30);

    const currentSubEl = mountedContainer.querySelector("#focus-current-sub");
    if (currentSubEl) currentSubEl.textContent = `CURRENT: ${formatTime(timer.elapsedSeconds)}`;

    const xpBarEl = mountedContainer.querySelector("#focus-xp-bar");
    if (xpBarEl) xpBarEl.style.width = `${Math.min(100, accrual.pct)}%`;

    const xpAccruedEl = mountedContainer.querySelector("#focus-xp-accrued");
    if (xpAccruedEl) xpAccruedEl.textContent = `+${accrual.accruedXp} ACCRUED`;

    const coinBarEl = mountedContainer.querySelector("#focus-coin-bar");
    if (coinBarEl) coinBarEl.style.width = `${Math.min(100, accrual.pct)}%`;

    const coinsAccruedEl = mountedContainer.querySelector("#focus-coins-accrued");
    if (coinsAccruedEl) coinsAccruedEl.textContent = `+${accrual.accruedCoins} BANKED`;

    const stopLabelEl = mountedContainer.querySelector("#focus-stop-label");
    if (stopLabelEl) stopLabelEl.textContent = `Stop & Bank ${accrual.accruedCoins} Coins`;

    const pauseLabelEl = mountedContainer.querySelector("#focus-pause-label");
    if (pauseLabelEl) pauseLabelEl.textContent = timer.running ? "Pause Session" : "Resume Session";

    const headerStateEl = mountedContainer.querySelector("#focus-header-state");
    if (headerStateEl) headerStateEl.textContent = timer.running ? "RUNNING" : "PAUSED";

    const flowStateEl = mountedContainer.querySelector("#focus-flow-state");
    if (flowStateEl) {
      flowStateEl.innerHTML = `
        <span class="w-1.5 h-1.5 bg-stone-accent ${timer.running ? "animate-pulse" : ""}"></span>
        ${timer.running ? "FLOW_ACTIVE (100% INTENSITY)" : "FLOW_PAUSED (HOLD)"}
      `;
    }
    return;
  }

  // Mode 2: Relax Timer
  if (store.state.relaxTimer) {
    const timer = store.state.relaxTimer;
    const rem = Math.max(0, timer.totalSeconds - timer.elapsedSeconds);
    const pct = timer.totalSeconds > 0 ? Math.min(100, Math.round((timer.elapsedSeconds / timer.totalSeconds) * 100)) : 0;

    const countdownEl = mountedContainer.querySelector("#relax-countdown");
    if (countdownEl) countdownEl.textContent = formatTime(rem);

    const asciiMeterEl = mountedContainer.querySelector("#relax-ascii-meter");
    if (asciiMeterEl) asciiMeterEl.textContent = renderBtopAsciiBar(pct, 30);

    const elapsedSubEl = mountedContainer.querySelector("#relax-elapsed-sub");
    if (elapsedSubEl) elapsedSubEl.textContent = `${formatTime(timer.elapsedSeconds)} / ${formatTime(timer.totalSeconds)}`;

    const pctLabelEl = mountedContainer.querySelector("#relax-pct-label");
    if (pctLabelEl) pctLabelEl.textContent = `${pct}% RESTORED`;

    const pauseLabelEl = mountedContainer.querySelector("#relax-pause-label");
    if (pauseLabelEl) pauseLabelEl.textContent = timer.running ? "Pause Cooldown" : "Resume Cooldown";
  }
}

// ── Main View Renderer ──────────────────────────────────────────────────

export function renderFocusView(container) {
  if (!container) return;
  mountedContainer = container;

  // Determine current mode
  let targetMode = "standby";
  if (store.state.relaxTimer) {
    targetMode = "relax";
  } else if (store.state.activeTimer) {
    targetMode = "focus";
  }

  // If already in same mode, only do fine-grained DOM telemetry update (do not short-circuit standby mode)
  if (currentRenderedMode === targetMode && targetMode !== "standby" && container.querySelector("[data-focus-rendered]")) {
    updateLiveTelemetry();
    return;
  }

  currentRenderedMode = targetMode;

  // Setup auto-break listener
  setupFocusCompletedListener();

  // Ensure keyboard listener is bound once
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", handleFocusKeydown);
    window.addEventListener("keydown", handleFocusKeydown);
  }

  // Start smooth local ticker if not already running
  if (!localTickerId) {
    localTickerId = setInterval(() => {
      updateLiveTelemetry();
    }, 1000);
  }

  // Render appropriate view mode
  if (targetMode === "relax") {
    renderRelaxDaemonMode(container);
  } else if (targetMode === "focus") {
    renderFocusDaemonMode(container);
  } else {
    renderStandbyLauncherMode(container);
  }
}

// ── MODE 1: Focus Daemon HUD (Running / Paused) ──────────────────────────

function renderFocusDaemonMode(container) {
  const timer = store.state.activeTimer;
  const task = timer?.task || {};
  const accrual = calculateAccruals(timer.elapsedSeconds, timer.targetSeconds, task);
  const streak = store.state.stats?.current_streak ?? 1;
  const pid = task.id || 4092;

  container.innerHTML = `
    <div data-focus-rendered="focus" class="flex flex-col w-full text-primary select-none pb-12 font-mono">
      <!-- Top Telemetry Diagnostics Ribbon -->
      <div class="w-full mb-3 flex flex-wrap items-center justify-between gap-2 bg-surface-container-low px-4 py-2 border border-outline-variant/40 shadow-sm text-xs">
        <div class="flex items-center gap-3 flex-wrap">
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 bg-surface-container text-primary border border-outline-variant font-bold">
            <span class="w-1.5 h-1.5 bg-stone-accent ${timer.running ? "animate-ping" : ""}"></span>
            FOCUS_SESSION://PID.${pid}
          </span>
          <span class="text-secondary font-bold truncate max-w-xs md:max-w-md">TARGET: ${escapeHtml(task.title || "DAEMON_CORE_V2")}</span>
          <span class="text-outline-variant">::</span>
          <span class="text-outline">THREAD_PRIORITY: REALTIME_0</span>
        </div>
        <div class="flex items-center gap-4 text-xs text-outline">
          <div class="flex items-center gap-1.5">
            <span>AUDIO_SYNTH:</span>
            <span class="text-stone-accent font-bold">432Hz_WARM_TAPE</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span>STREAK:</span>
            <span class="text-stone-accent font-bold">^${streak} DAYS (1.25x GAIN)</span>
          </div>
          <div class="hidden sm:inline-block text-outline-variant">
            TERM_LAYOUT: BTOP_3WAY
          </div>
        </div>
      </div>

      <!-- Main 3-Column Viewport Workspace (3 / 6 / 3) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 w-full items-start">
        
        <!-- LEFT PANE: Session Context & Objectives (3/12) -->
        <div class="lg:col-span-3 flex flex-col gap-3">
          <!-- Thread Context Card -->
          <div class="bg-surface-container-low p-3 border border-outline-variant/40 flex flex-col gap-2 shadow-sm">
            <div class="flex items-center justify-between pb-1 border-b border-outline-variant/40">
              <span class="text-stone-accent text-xs font-bold tracking-wider">// THREAD_CONTEXT</span>
              <span class="text-outline text-xs">P${pid}#92</span>
            </div>
            <div class="bg-surface-container-lowest p-2 border border-outline-variant/30 flex flex-col gap-1 text-xs">
              <div class="flex justify-between items-center">
                <span class="text-outline uppercase">EXEC_MODE</span>
                <span class="px-1.5 py-0.2 bg-surface-container-high text-stone-accent font-bold border border-outline-variant">STRICT_POMO</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-outline uppercase">WINDOW_BLOCK</span>
                <span class="text-primary font-bold">${Math.round(timer.targetSeconds / 60)} MIN TOTAL</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-outline uppercase">HARD_ISOLATE</span>
                <span class="text-secondary font-bold">NET_LOCKED</span>
              </div>
            </div>

            <!-- Linked Task Buffer -->
            <div class="mt-1">
              <div class="text-[11px] text-outline uppercase tracking-wider mb-1">LINKED_TASK_BUFFER</div>
              <div class="bg-surface-container p-2.5 border border-outline-variant/50 flex flex-col gap-1">
                <div class="flex items-center gap-1.5 text-primary text-sm font-bold leading-tight font-space">
                  <span class="material-symbols-outlined text-sm text-stone-accent">terminal</span>
                  <span class="line-clamp-2">${escapeHtml(task.title || "Deep Work Session")}</span>
                </div>
                <div class="flex items-center gap-2 mt-1 text-[11px]">
                  <span class="px-1.5 py-0.5 bg-surface-container-high text-stone-accent border border-outline-variant font-bold">#${(task.category || "code").toUpperCase()}</span>
                  <span class="text-outline">DIFF: HIGH (+${accrual.targetXp} XP)</span>
                </div>
              </div>
            </div>

            <!-- Task Objectives Checklist -->
            <div class="mt-1">
              <div class="flex items-center justify-between mb-1 text-[11px]">
                <span class="text-outline uppercase tracking-wider">EXEC_CHECKLIST [2/3]</span>
                <span class="text-stone-accent font-bold">66%</span>
              </div>
              <div class="flex flex-col gap-1 text-xs">
                <label class="flex items-center gap-2 p-1.5 bg-surface-container-lowest border border-outline-variant/30 text-outline line-through">
                  <span class="text-stone-accent font-bold">[x]</span>
                  <span>Initialize terminal HUD</span>
                </label>
                <label class="flex items-center gap-2 p-1.5 bg-surface-container-lowest border border-outline-variant/30 text-outline line-through">
                  <span class="text-stone-accent font-bold">[x]</span>
                  <span>Lock distraction shield</span>
                </label>
                <label class="flex items-center gap-2 p-1.5 bg-surface-container border border-outline-variant/40 text-primary">
                  <span class="text-stone-accent font-bold">[ ]</span>
                  <span>Complete focus block</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Prior Session History Log -->
          <div class="bg-surface-container-low p-3 border border-outline-variant/40 flex flex-col gap-2 shadow-sm text-xs">
            <div class="flex items-center justify-between pb-1 border-b border-outline-variant/40">
              <span class="text-outline uppercase tracking-wider">// PRIOR_SESSION_LOGS</span>
              <span class="text-secondary">ARCHIVED</span>
            </div>
            <div class="bg-surface-container p-2 border border-outline-variant/30 flex flex-col gap-1">
              <div class="flex justify-between items-center text-primary font-semibold">
                <span>T#02: Refactor State Store</span>
                <span class="text-stone-accent font-bold">+35 XP</span>
              </div>
              <div class="flex justify-between items-center text-outline text-[11px]">
                <span>55 MIN / 1 PAUSE</span>
                <span class="text-secondary font-bold">⟐ +18 COINS</span>
              </div>
            </div>
          </div>

          <!-- Ambient Terminal Hook -->
          <div class="bg-surface-container-lowest p-2.5 border border-outline-variant/40 text-xs text-outline flex items-start gap-2">
            <span class="text-stone-accent font-bold">❯</span>
            <span class="text-secondary italic">"Flow is the state where syntax fades and only state machines exist."</span>
          </div>
        </div>

        <!-- CENTER MAIN PANE: Focus Engine Terminal (6/12) -->
        <div class="lg:col-span-6 flex flex-col gap-3">
          <div class="bg-surface-container-low p-5 border border-outline-variant relative overflow-hidden flex flex-col gap-4 shadow-xl">
            <!-- Ambient Neutral Glow Backdrop -->
            <div class="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-stone-accent/5 blur-3xl pointer-events-none"></div>

            <!-- Terminal Header Syntax Top Line -->
            <div class="flex items-center justify-between text-xs text-outline pb-1 border-b border-outline-variant/40">
              <div class="flex items-center gap-1.5 text-secondary">
                <span class="text-outline font-bold">┌─[</span>
                <span class="text-stone-accent font-bold tracking-wider">FOCUS_DAEMON // <span id="focus-header-state">${timer.running ? "RUNNING" : "PAUSED"}</span></span>
                <span class="text-outline font-bold">]</span>
                <span class="text-outline-variant">─────────────────────────</span>
              </div>
              <div id="focus-flow-state" class="flex items-center gap-1.5 text-xs text-stone-accent">
                <span class="w-1.5 h-1.5 bg-stone-accent ${timer.running ? "animate-pulse" : ""}"></span>
                <span>${timer.running ? "FLOW_ACTIVE (100% INTENSITY)" : "FLOW_PAUSED (HOLD)"}</span>
              </div>
            </div>

            <!-- Digital Clock Display & Flow State Diagnostics -->
            <div class="flex flex-col items-center justify-center py-2 relative">
              <!-- Pulsing Status Bead -->
              <div class="flex items-center gap-2 mb-2 px-3 py-1 bg-surface-container text-xs text-secondary border border-outline-variant">
                <span class="text-stone-accent font-bold">SYS.CLK</span>
                <span class="text-outline-variant">::</span>
                <span class="font-bold text-primary animate-pulse">ACTIVE_FLOW_PULSE</span>
                <span id="focus-tick-count" class="text-outline">[TICK: ${timer.elapsedSeconds}s]</span>
              </div>

              <!-- Master Digital Time Display -->
              <div class="font-space text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-primary flex items-baseline justify-center gap-3 py-2">
                <span id="focus-elapsed" class="text-stone-accent drop-shadow-[0_0_16px_rgba(216,210,198,0.2)]">${formatTime(timer.elapsedSeconds)}</span>
                <span class="text-outline-variant text-3xl font-light">/</span>
                <span id="focus-target" class="text-outline text-3xl font-normal">${formatTime(timer.targetSeconds)}</span>
              </div>

              <!-- Pace and Remaining Sub-HUD -->
              <div class="mt-1 flex items-center gap-3 text-xs text-secondary flex-wrap justify-center">
                <span id="focus-remaining" class="text-stone-accent font-bold">⏳ ${formatTime(Math.max(0, timer.targetSeconds - timer.elapsedSeconds))} REMAINING</span>
                <span class="text-outline-variant">|</span>
                <span>PACE: <span class="text-primary font-semibold">1.0x NOMINAL</span></span>
                <span class="text-outline-variant">|</span>
                <span class="text-secondary font-semibold">DISTRACTION_SHIELD: ON</span>
              </div>
            </div>

            <!-- Signature BTOP Gradient ASCII Progress Bar -->
            <div class="flex flex-col gap-1.5 bg-surface-container-lowest p-3 border border-outline-variant/40 shadow-inner">
              <div class="flex justify-between items-center text-xs">
                <span class="text-stone-accent font-bold flex items-center gap-1.5">
                  <span>[BTOP_RESOURCE_FILL]</span>
                  <span class="text-outline font-normal">CPU_CLOCK_ALLOC</span>
                </span>
                <div class="flex items-center gap-2">
                  <span id="focus-pct-label" class="text-primary font-bold">${accrual.pct}% EXEC</span>
                  <span id="focus-time-sub" class="text-outline">[${(timer.elapsedSeconds / 60).toFixed(1)} / ${(timer.targetSeconds / 60).toFixed(1)} MIN]</span>
                </div>
              </div>
              <!-- ASCII Bar -->
              <div id="focus-ascii-meter" class="font-mono text-stone-accent tracking-widest text-base sm:text-lg leading-none py-1 select-none overflow-x-auto whitespace-pre">${renderBtopAsciiBar(accrual.pct, 30)}</div>
              <div class="flex justify-between items-center text-[11px] text-outline pt-1">
                <span>00:00:00 (BOOT)</span>
                <span id="focus-current-sub" class="text-stone-accent font-bold">CURRENT: ${formatTime(timer.elapsedSeconds)}</span>
                <span>SESSION_MAX: ${formatTime(timer.targetSeconds)}</span>
              </div>
            </div>

            <!-- Real-Time XP Accrual & Coin Ledger HUD Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- XP Card -->
              <div class="bg-surface-container p-3 border border-outline-variant/50 flex flex-col justify-between gap-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-outline uppercase tracking-wider font-bold">XP_REWARD_PIPELINE</span>
                  <span class="material-symbols-outlined text-base text-stone-accent">bolt</span>
                </div>
                <div>
                  <div class="flex items-baseline gap-2">
                    <span class="font-space text-xl font-bold text-stone-accent">+${accrual.targetXp} XP</span>
                    <span class="text-xs text-outline">EST. COMPLETION</span>
                  </div>
                  <div class="w-full bg-surface-container-lowest h-1.5 overflow-hidden mt-1.5 border border-outline-variant/30">
                    <div id="focus-xp-bar" class="bg-stone-accent h-full transition-all duration-300" style="width: ${Math.min(100, accrual.pct)}%"></div>
                  </div>
                </div>
                <div class="flex items-center justify-between text-xs text-outline">
                  <span>RATE: ${accrual.xpRatePerMin.toFixed(2)} XP/MIN</span>
                  <span id="focus-xp-accrued" class="text-stone-accent font-bold">+${accrual.accruedXp} ACCRUED</span>
                </div>
              </div>

              <!-- Coin Ledger Card -->
              <div class="bg-surface-container p-3 border border-outline-variant/50 flex flex-col justify-between gap-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-outline uppercase tracking-wider font-bold">COIN_LEDGER_ACTIVE</span>
                  <span class="text-stone-accent font-bold">⟐ ACCRUAL</span>
                </div>
                <div>
                  <div class="flex items-baseline gap-2">
                    <span id="focus-coins-accrued" class="font-space text-xl font-bold text-secondary">+${accrual.accruedCoins} BANKED</span>
                    <span class="text-xs text-outline">/ ${accrual.targetCoins} TARGET</span>
                  </div>
                  <div class="w-full bg-surface-container-lowest h-1.5 overflow-hidden mt-1.5 border border-outline-variant/30">
                    <div id="focus-coin-bar" class="bg-secondary h-full transition-all duration-300" style="width: ${Math.min(100, accrual.pct)}%"></div>
                  </div>
                </div>
                <div class="flex items-center justify-between text-xs text-outline">
                  <span>BASE: ${accrual.coinRatePerMin.toFixed(2)} C/MIN</span>
                  <span class="text-stone-accent font-bold">MULT: 1.25x</span>
                </div>
              </div>
            </div>

            <!-- Terminal Interactive Command Key Controls Bar -->
            <div class="flex flex-col gap-2 pt-2 border-t border-outline-variant/50">
              <div class="text-outline text-xs uppercase tracking-wider font-bold">EXECUTION_BUS_CONTROLS</div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <!-- Pause / Resume Button -->
                <button id="focus-pause-btn" class="flex items-center justify-center gap-1.5 py-2 px-3 bg-surface-container hover:bg-surface-container-high active:bg-primary active:text-surface text-primary transition-all border border-outline-variant text-xs">
                  <span class="font-bold text-stone-accent">[ Space ]</span>
                  <span id="focus-pause-label" class="font-semibold">${timer.running ? "Pause Session" : "Resume Session"}</span>
                </button>

                <!-- Complete Now Button -->
                <button id="focus-complete-btn" class="flex items-center justify-center gap-1.5 py-2 px-3 bg-primary text-surface font-bold hover:bg-stone-accent active:scale-[0.99] transition-all border border-secondary-fixed text-xs">
                  <span class="text-surface font-bold">[ Enter ]</span>
                  <span>Mark Complete Now</span>
                </button>

                <!-- Stop & Bank Button -->
                <button id="focus-stop-btn" class="flex items-center justify-center gap-1.5 py-2 px-3 bg-surface-container hover:bg-surface-container-high text-secondary hover:text-red-400 transition-all border border-outline-variant text-xs">
                  <span class="text-red-400 font-bold">[ Ctrl+C / Esc ]</span>
                  <span id="focus-stop-label">Stop & Bank ${accrual.accruedCoins} Coins</span>
                </button>
              </div>
            </div>

            <!-- Inline Mini CLI Prompt -->
            <div class="flex items-center gap-2 bg-surface-container-lowest px-3 py-2 border border-outline-variant/40 text-xs text-primary">
              <span class="text-stone-accent font-bold">focus@dtask:~$</span>
              <input id="focus-cli-input" type="text" class="bg-transparent border-none outline-none text-primary placeholder:text-outline/60 flex-1 w-full font-mono text-xs" placeholder="type 'note <string>' or 'split <title>' to modify thread..." />
              <span class="text-outline text-[11px] hidden sm:inline">[Tab: auto-complete]</span>
            </div>
          </div>

          <!-- Flow Heartbeat Mini Sparkline Graph Panel -->
          <div class="bg-surface-container-low p-3 border border-outline-variant/40 flex items-center justify-between text-xs shadow-sm">
            <div class="flex flex-col">
              <span class="text-outline uppercase text-[11px]">FLOW_HEARTBEAT_METRICS</span>
              <span class="text-stone-accent font-semibold">KEYSTROKES: 78 WPM AVG</span>
            </div>
            <!-- Inline SVG Sparkline -->
            <div class="w-40 h-6 flex items-center">
              <svg class="w-full h-full" fill="none" viewBox="0 0 100 24">
                <path class="text-stone-accent" d="M0 12 L10 12 L15 3 L20 20 L25 12 L40 12 L45 5 L50 18 L55 12 L70 12 L75 8 L80 16 L85 12 L100 12" stroke="currentColor" stroke-width="1.8"></path>
              </svg>
            </div>
            <div class="text-right">
              <span class="text-outline text-[11px]">DRIFT_DETECTOR</span>
              <div class="text-secondary font-bold">0.02% (LOCKED)</div>
            </div>
          </div>
        </div>

        <!-- RIGHT PANE: Break Rewards & Telemetry (3/12) -->
        <div class="lg:col-span-3 flex flex-col gap-3">
          <!-- Guilt-Free Break Reward Switcher -->
          <div class="bg-surface-container-low p-3 border border-outline-variant/40 flex flex-col gap-2 shadow-sm text-xs">
            <div class="flex items-center justify-between pb-1 border-b border-outline-variant/40">
              <div class="flex items-center gap-1.5 font-bold text-primary">
                <span class="material-symbols-outlined text-sm text-stone-accent">coffee</span>
                <span>Guilt-Free Break Ready</span>
              </div>
              <span class="px-1.5 py-0.2 bg-surface-container-high text-stone-accent font-bold border border-outline-variant">READY</span>
            </div>
            <div class="text-outline text-[11px]">
              Guilt-free relaxation slots staged for immediate handover when timer ticks zero:
            </div>

            <!-- Staged Break Card -->
            <div class="bg-surface-container p-2.5 border border-outline-variant/50 flex flex-col gap-1.5 hover:bg-surface-container-high transition-colors">
              <div class="flex items-start justify-between">
                <div>
                  <span class="text-[10px] text-stone-accent uppercase font-bold">STAGED REWARD #1</span>
                  <div class="font-bold text-primary text-xs">Pour-Over Coffee Ritual</div>
                </div>
                <span class="px-1.5 py-0.5 bg-surface-container-lowest text-stone-accent font-bold border border-outline-variant text-[10px]">0 COINS</span>
              </div>
              <p class="text-secondary text-[11px]">
                15m single-origin brew reset. Zero guilt penalty. HP restorative loop active.
              </p>
              <div class="flex items-center justify-between text-[11px] pt-1">
                <span class="text-stone-accent font-semibold">+5 HP REGAINED</span>
                <span class="text-outline">15 MIN</span>
              </div>
            </div>

            <!-- Auto Switch CLI Toggle -->
            <div class="flex items-center justify-between bg-surface-container-lowest p-2 border border-outline-variant/30 text-xs">
              <span class="text-secondary">Auto-trigger on zero:</span>
              <button id="focus-auto-break-toggle" class="px-2 py-0.5 bg-surface-container-high border border-outline-variant font-bold text-xs ${autoBreakEnabled ? "text-stone-accent" : "text-outline"}">
                AUTO: [${autoBreakEnabled ? "ON" : "OFF"}]
              </button>
            </div>

            <!-- Quick Switch to Relax Timer Button -->
            <button id="focus-switch-relax-btn" class="w-full py-2 px-3 bg-surface-container-high hover:bg-surface-container-highest active:bg-stone-accent active:text-surface transition-all flex items-center justify-between text-primary font-bold border border-outline-variant text-xs">
              <span class="text-stone-accent">[Shift+Tab]</span>
              <span>Switch to Relax Mode</span>
              <span class="material-symbols-outlined text-sm text-stone-accent">bedtime</span>
            </button>
          </div>

          <!-- Audio Engine (Lo-Fi) -->
          <div class="bg-surface-container-low p-3 border border-outline-variant/40 flex flex-col gap-2 shadow-sm text-xs">
            <div class="flex items-center justify-between pb-1 border-b border-outline-variant/40">
              <span class="text-outline uppercase tracking-wider font-bold">// AUDIO_ENGINE (LO-FI)</span>
              <span class="material-symbols-outlined text-sm text-stone-accent animate-pulse">equalizer</span>
            </div>
            <div class="flex flex-col gap-1.5 mt-0.5">
              <button data-audio="binaural" class="audio-track-btn w-full text-left flex items-center justify-between p-2 border ${selectedAudioEngine === "binaural" ? "bg-surface-container border-outline text-primary" : "bg-surface-container-lowest border-outline-variant/30 text-secondary hover:bg-surface-container"}">
                <div class="flex items-center gap-2">
                  <span class="font-bold ${selectedAudioEngine === "binaural" ? "text-stone-accent" : "text-outline"}">${selectedAudioEngine === "binaural" ? "[*]" : "[ ]"}</span>
                  <span>Binaural 432Hz Brown</span>
                </div>
                <span class="font-bold text-[10px] ${selectedAudioEngine === "binaural" ? "text-stone-accent" : "text-outline"}">${selectedAudioEngine === "binaural" ? "ACTIVE" : "IDLE"}</span>
              </button>
              <button data-audio="tokyo" class="audio-track-btn w-full text-left flex items-center justify-between p-2 border ${selectedAudioEngine === "tokyo" ? "bg-surface-container border-outline text-primary" : "bg-surface-container-lowest border-outline-variant/30 text-secondary hover:bg-surface-container"}">
                <div class="flex items-center gap-2">
                  <span class="font-bold ${selectedAudioEngine === "tokyo" ? "text-stone-accent" : "text-outline"}">${selectedAudioEngine === "tokyo" ? "[*]" : "[ ]"}</span>
                  <span>Tokyo Terminal Rainy Night</span>
                </div>
                <span class="font-bold text-[10px] ${selectedAudioEngine === "tokyo" ? "text-stone-accent" : "text-outline"}">${selectedAudioEngine === "tokyo" ? "ACTIVE" : "IDLE"}</span>
              </button>
            </div>
          </div>

          <!-- ASCII Footer Telemetry Status -->
          <div class="flex items-center justify-between text-outline text-[11px] px-1 select-none">
            <span>└─[ STATUS: FOCUS_LOCKED ]</span>
            <span>STOKED_STREAK: ☕ ${streak} ─┘</span>
          </div>
        </div>

      </div>
    </div>
  `;

  // Attach button event listeners
  const pauseBtn = container.querySelector("#focus-pause-btn");
  if (pauseBtn) {
    pauseBtn.onclick = () => {
      if (store.state.activeTimer?.running) {
        store.pauseFocusTimer();
      } else {
        store.resumeFocusTimer();
      }
    };
  }

  const completeBtn = container.querySelector("#focus-complete-btn");
  if (completeBtn) {
    completeBtn.onclick = () => {
      const activeTask = store.state.activeTimer?.task;
      store.stopFocusTimer(true);
      if (activeTask?.id) {
        store.toggleTaskDone(activeTask.id);
      }
    };
  }

  const stopBtn = container.querySelector("#focus-stop-btn");
  if (stopBtn) {
    stopBtn.onclick = () => {
      store.stopFocusTimer(true);
      store.showToast("Focus session stopped and banked", "info");
    };
  }

  const autoBreakToggle = container.querySelector("#focus-auto-break-toggle");
  if (autoBreakToggle) {
    autoBreakToggle.onclick = () => {
      autoBreakEnabled = !autoBreakEnabled;
      autoBreakToggle.textContent = `AUTO: [${autoBreakEnabled ? "ON" : "OFF"}]`;
      autoBreakToggle.className = `px-2 py-0.5 bg-surface-container-high border border-outline-variant font-bold text-xs ${autoBreakEnabled ? "text-stone-accent" : "text-outline"}`;
      store.showToast(`Auto-break handover ${autoBreakEnabled ? "enabled" : "disabled"}`, "info");
    };
  }

  const switchRelaxBtn = container.querySelector("#focus-switch-relax-btn");
  if (switchRelaxBtn) {
    switchRelaxBtn.onclick = () => {
      store.stopFocusTimer(true);
      store.startRelaxTimer(5, "Guilt-Free Coffee Break");
      store.showToast("Switched to Relax Daemon cooldown", "info");
    };
  }

  // Audio track selectors
  const audioButtons = container.querySelectorAll(".audio-track-btn");
  audioButtons.forEach((btn) => {
    btn.onclick = () => {
      selectedAudioEngine = btn.getAttribute("data-audio") || "binaural";
      sound.playCoinTick();
      renderFocusView(container);
    };
  });

  // Mini CLI Prompt
  const cliInput = container.querySelector("#focus-cli-input");
  if (cliInput) {
    cliInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        const val = cliInput.value.trim();
        if (val) {
          store.showToast(`Logged thread note: "${val}"`, "success");
          cliInput.value = "";
        }
      }
    };
  }
}

// ── MODE 2: Relax Daemon Cooldown HUD ────────────────────────────────────

function renderRelaxDaemonMode(container) {
  const timer = store.state.relaxTimer;
  const rem = Math.max(0, timer.totalSeconds - timer.elapsedSeconds);
  const pct = timer.totalSeconds > 0 ? Math.min(100, Math.round((timer.elapsedSeconds / timer.totalSeconds) * 100)) : 0;
  const breakName = timer.name || "Guilt-Free Break";

  container.innerHTML = `
    <div data-focus-rendered="relax" class="flex flex-col w-full text-primary select-none pb-12 font-mono max-w-4xl mx-auto">
      <!-- Ambient Stone Glow Backdrop -->
      <div class="relative bg-surface-container-low p-6 md:p-8 border border-outline-variant/60 shadow-2xl overflow-hidden flex flex-col gap-6">
        <!-- Ambient Warm Stone Radial Glow -->
        <div class="absolute -top-32 -right-32 w-96 h-96 bg-stone-accent/10 blur-3xl pointer-events-none rounded-full"></div>
        <div class="absolute -bottom-32 -left-32 w-96 h-96 bg-secondary-fixed/5 blur-3xl pointer-events-none rounded-full"></div>

        <!-- Top Header Syntax Line -->
        <div class="flex items-center justify-between text-xs text-outline pb-2 border-b border-outline-variant/40">
          <div class="flex items-center gap-2">
            <span class="text-outline font-bold">┌─[</span>
            <span class="text-stone-accent font-bold tracking-wider">RELAX_DAEMON // COOLDOWN</span>
            <span class="text-outline font-bold">]</span>
            <span class="text-outline-variant hidden sm:inline">─────────────────────────</span>
          </div>
          <span class="text-stone-accent font-bold tracking-wider uppercase text-[11px]">// WARM STONE AMBIENT GLOW</span>
        </div>

        <!-- Cooldown Status Bead -->
        <div class="flex flex-col items-center justify-center py-4 text-center">
          <div class="flex items-center gap-2 mb-3 px-3 py-1 bg-surface-container text-xs text-stone-accent border border-outline-variant">
            <span class="w-2 h-2 bg-stone-accent rounded-full animate-pulse"></span>
            <span class="font-bold">REST_PROTOCOL_ACTIVE // GUILT-FREE RECOVERY</span>
          </div>

          <div class="font-space text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-primary my-2 drop-shadow-[0_0_20px_rgba(216,210,198,0.25)]">
            <span id="relax-countdown" class="text-stone-accent">${formatTime(rem)}</span>
          </div>

          <p class="text-sm text-secondary mt-1 font-geist">
            Buffer: <span class="text-primary font-bold font-mono">${escapeHtml(breakName)}</span>
          </p>
        </div>

        <!-- Segmented ASCII Meter -->
        <div class="flex flex-col gap-2 bg-surface-container-lowest p-4 border border-outline-variant/40 shadow-inner">
          <div class="flex justify-between items-center text-xs">
            <span class="text-stone-accent font-bold flex items-center gap-1.5">
              <span>[REST_BUFFER_FILL]</span>
              <span class="text-outline font-normal">HP_RESTORE_ALLOC</span>
            </span>
            <span class="text-primary font-bold">
              <span id="relax-pct-label">${pct}% RESTORED</span>
              <span id="relax-elapsed-sub" class="text-outline font-normal ml-2">${formatTime(timer.elapsedSeconds)} / ${formatTime(timer.totalSeconds)}</span>
            </span>
          </div>
          <div id="relax-ascii-meter" class="font-mono text-stone-accent tracking-widest text-base sm:text-xl leading-none py-1 select-none overflow-x-auto whitespace-pre">${renderBtopAsciiBar(pct, 30)}</div>
        </div>

        <!-- Telemetry Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div class="bg-surface-container p-3 border border-outline-variant/40 flex flex-col gap-1">
            <span class="text-outline uppercase text-[11px] font-bold">SANITY_RESTORATION</span>
            <span class="text-stone-accent font-bold text-sm">+15 SANITY RESTORED</span>
            <span class="text-secondary text-[11px]">Zero guilt penalty. Cooldown pool active.</span>
          </div>
          <div class="bg-surface-container p-3 border border-outline-variant/40 flex flex-col gap-1">
            <span class="text-outline uppercase text-[11px] font-bold">LEISURE_COOLDOWN</span>
            <span class="text-secondary font-bold text-sm">DAEMON REST CYCLE</span>
            <span class="text-outline text-[11px]">Sound chime rings automatically at zero.</span>
          </div>
        </div>

        <!-- Interactive Control Bar -->
        <div class="flex flex-col sm:flex-row gap-3 pt-2 border-t border-outline-variant/40">
          <button id="relax-pause-btn" class="flex-1 py-2.5 px-4 bg-surface-container hover:bg-surface-container-high active:bg-stone-accent active:text-surface text-primary border border-outline-variant font-bold text-xs flex items-center justify-center gap-2 transition-all">
            <span class="text-stone-accent">[ Space ]</span>
            <span id="relax-pause-label">${timer.running ? "Pause Cooldown" : "Resume Cooldown"}</span>
          </button>
          <button id="relax-return-btn" class="flex-1 py-2.5 px-4 bg-primary text-surface hover:bg-stone-accent active:scale-[0.99] font-bold text-xs flex items-center justify-center gap-2 transition-all border border-secondary-fixed">
            <span class="text-surface font-bold">[ Enter ]</span>
            <span>Return to Work</span>
          </button>
          <button id="relax-dismiss-btn" class="py-2.5 px-4 bg-surface-container hover:bg-surface-container-high text-secondary hover:text-red-400 border border-outline-variant font-bold text-xs flex items-center justify-center gap-2 transition-all">
            <span class="text-red-400 font-bold">[ Esc ]</span>
            <span>Dismiss</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach button event listeners
  const pauseBtn = container.querySelector("#relax-pause-btn");
  if (pauseBtn) {
    pauseBtn.onclick = () => {
      if (store.state.relaxTimer?.running) {
        store.pauseRelaxTimer();
      } else {
        store.resumeRelaxTimer();
      }
    };
  }

  const returnBtn = container.querySelector("#relax-return-btn");
  if (returnBtn) {
    returnBtn.onclick = () => {
      store.stopRelaxTimer();
      store.showToast("Relax break concluded. Back to work!", "info");
      renderFocusView(container);
    };
  }

  const dismissBtn = container.querySelector("#relax-dismiss-btn");
  if (dismissBtn) {
    dismissBtn.onclick = () => {
      store.stopRelaxTimer();
      renderFocusView(container);
    };
  }
}

// ── MODE 3: Standby / Quick Dispatcher HUD ───────────────────────────────

function renderStandbyLauncherMode(container) {
  const openTasks = (store.state.tasks || []).filter((t) => !t.archived && t.status !== "done");

  container.innerHTML = `
    <div data-focus-rendered="standby" class="flex flex-col w-full text-primary select-none pb-12 font-mono max-w-5xl mx-auto">
      <!-- Standby Header Banner -->
      <div class="w-full mb-4 flex flex-wrap items-center justify-between gap-2 bg-surface-container-low px-4 py-2.5 border border-outline-variant/40 shadow-sm text-xs">
        <div class="flex items-center gap-2">
          <span class="text-outline font-bold">┌─[</span>
          <span class="text-stone-accent font-bold tracking-wider">FOCUS_DAEMON // STANDBY</span>
          <span class="text-outline font-bold">]</span>
          <span class="text-outline-variant hidden sm:inline">─────────────────────────</span>
        </div>
        <span class="text-outline text-xs uppercase font-bold">READY FOR MISSION DISPATCH</span>
      </div>

      <!-- Quick Pomodoro Presets Banner -->
      <div class="mb-6">
        <div class="text-xs text-outline uppercase font-bold mb-2 tracking-wider">// RAPID_DISPATCH_PRESETS</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button data-mins="25" class="quick-preset-btn p-4 bg-surface-container border border-outline-variant/60 hover:border-stone-accent hover:bg-surface-container-high transition-all text-left flex flex-col gap-1 shadow-sm group">
            <div class="flex items-center justify-between">
              <span class="font-space text-lg font-bold text-stone-accent group-hover:translate-x-0.5 transition-transform">[ 25m ]</span>
              <span class="text-xs text-outline">CLASSIC</span>
            </div>
            <div class="text-xs text-primary font-bold font-geist">Short Sprint (Pomodoro)</div>
            <div class="text-[11px] text-outline">Target: 25 mins · +25 XP · +12 ⟐</div>
          </button>

          <button data-mins="45" class="quick-preset-btn p-4 bg-surface-container border border-outline-variant/60 hover:border-stone-accent hover:bg-surface-container-high transition-all text-left flex flex-col gap-1 shadow-sm group">
            <div class="flex items-center justify-between">
              <span class="font-space text-lg font-bold text-primary group-hover:translate-x-0.5 transition-transform">[ 45m ]</span>
              <span class="text-xs text-stone-accent font-bold">STANDARD</span>
            </div>
            <div class="text-xs text-primary font-bold font-geist">Deep Work Block</div>
            <div class="text-[11px] text-outline">Target: 45 mins · +45 XP · +22 ⟐</div>
          </button>

          <button data-mins="60" class="quick-preset-btn p-4 bg-surface-container border border-outline-variant/60 hover:border-stone-accent hover:bg-surface-container-high transition-all text-left flex flex-col gap-1 shadow-sm group">
            <div class="flex items-center justify-between">
              <span class="font-space text-lg font-bold text-secondary-fixed group-hover:translate-x-0.5 transition-transform">[ 60m ]</span>
              <span class="text-xs text-outline">HEAVY</span>
            </div>
            <div class="text-xs text-primary font-bold font-geist">Architecture & Flow</div>
            <div class="text-[11px] text-outline">Target: 60 mins · +60 XP · +30 ⟐</div>
          </button>
        </div>
      </div>

      <!-- Main 2-Column Split: Open Tasks Quick Dispatcher vs Custom Launcher -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        <!-- Left 7 Cols: Open Task Queue Dispatcher -->
        <div class="lg:col-span-7 flex flex-col gap-3">
          <div class="flex items-center justify-between pb-1 border-b border-outline-variant/40 text-xs">
            <span class="text-stone-accent font-bold uppercase tracking-wider">// QUICK_DISPATCHER (OPEN TASKS)</span>
            <span class="text-outline">${openTasks.length} AVAILABLE</span>
          </div>

          ${openTasks.length === 0 ? `
            <div class="p-8 bg-surface-container-lowest border border-outline-variant/30 text-center text-secondary text-xs">
              <span class="material-symbols-outlined text-2xl text-outline mb-1">done_all</span>
              <p>No open tasks in queue. Create one on the right or pick a rapid preset above.</p>
            </div>
          ` : `
            <div class="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
              ${openTasks.map((t) => `
                <div class="bg-surface-container-low p-3 border border-outline-variant/40 hover:border-outline transition-all flex items-center justify-between gap-3 text-xs">
                  <div class="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="px-1.5 py-0.2 bg-surface-container-high text-stone-accent text-[10px] font-bold border border-outline-variant">#${(t.category || "code").toUpperCase()}</span>
                      <span class="font-bold text-primary truncate font-geist text-sm">${escapeHtml(t.title)}</span>
                    </div>
                    <div class="text-[11px] text-outline flex items-center gap-2 mt-0.5">
                      <span>Target: ${t.mins || 25}m</span>
                      <span>·</span>
                      <span class="text-secondary">+${t.xp || 10} XP</span>
                      <span>·</span>
                      <span class="text-stone-accent">+${t.coins || 10} ⟐</span>
                    </div>
                  </div>
                  <button data-task-id="${t.id}" class="launch-task-btn px-3 py-1.5 bg-primary text-surface font-bold hover:bg-stone-accent transition-all text-xs whitespace-nowrap">
                    LAUNCH FOCUS ❯
                  </button>
                </div>
              `).join("")}
            </div>
          `}
        </div>

        <!-- Right 5 Cols: Custom Task Focus Launcher & Quick Relax Trigger -->
        <div class="lg:col-span-5 flex flex-col gap-4">
          <!-- Custom Launcher Box -->
          <form id="custom-launch-form" class="bg-surface-container-low p-4 border border-outline-variant/50 flex flex-col gap-3 text-xs shadow-sm">
            <div class="pb-1 border-b border-outline-variant/40 text-stone-accent font-bold uppercase tracking-wider">
              // AD-HOC FOCUS LAUNCHER
            </div>
            <div>
              <label class="block text-outline text-[11px] uppercase mb-1">Focus Mission Title</label>
              <input id="custom-title-input" type="text" placeholder="e.g. Implement parser optimization" required class="w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-xs font-mono text-primary focus:outline-none focus:border-stone-accent" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-outline text-[11px] uppercase mb-1">Category</label>
                <select id="custom-cat-select" class="w-full bg-surface-container-lowest border border-outline-variant px-2 py-1.5 text-xs font-mono text-primary focus:outline-none">
                  <option value="code">code</option>
                  <option value="learn">learn</option>
                  <option value="health">health</option>
                  <option value="read">read</option>
                  <option value="build">build</option>
                </select>
              </div>
              <div>
                <label class="block text-outline text-[11px] uppercase mb-1">Duration</label>
                <select id="custom-mins-select" class="w-full bg-surface-container-lowest border border-outline-variant px-2 py-1.5 text-xs font-mono text-primary focus:outline-none">
                  <option value="15">15 mins</option>
                  <option value="25" selected>25 mins</option>
                  <option value="45">45 mins</option>
                  <option value="60">60 mins</option>
                  <option value="90">90 mins</option>
                </select>
              </div>
            </div>
            <button type="submit" class="mt-1 w-full py-2.5 bg-primary text-surface font-bold hover:bg-stone-accent active:scale-[0.99] transition-all text-xs flex items-center justify-center gap-1.5">
              <span>Launch Focus Session ⚡</span>
            </button>
          </form>

          <!-- Direct Relax Cooldown Trigger -->
          <div class="bg-surface-container-low p-4 border border-outline-variant/50 flex flex-col gap-2 text-xs shadow-sm">
            <div class="pb-1 border-b border-outline-variant/40 text-secondary font-bold uppercase tracking-wider">
              // INSTANT COOLDOWN
            </div>
            <p class="text-outline text-[11px]">
              Need a reset before your next sprint? Launch a guilt-free Relax Daemon break.
            </p>
            <div class="flex gap-2 mt-1">
              <button id="quick-relax-5m-btn" class="flex-1 py-2 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-stone-accent font-bold text-xs transition-all">
                ☕ 5m Coffee Break
              </button>
              <button id="quick-relax-15m-btn" class="flex-1 py-2 bg-surface-container hover:bg-surface-container-high border border-outline-variant text-secondary font-bold text-xs transition-all">
                🌿 15m Reset
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  // Attach Preset Buttons
  container.querySelectorAll(".quick-preset-btn").forEach((btn) => {
    btn.onclick = async () => {
      const mins = parseInt(btn.getAttribute("data-mins"), 10) || 25;
      try {
        const res = await api.createTask({
          title: `${mins}m Focus Sprint`,
          category: "code",
          mins,
        });
        const task = res.task || res;
        await store.refreshTasks();
        sound.playCoinTick();
        store.startFocusTimer(task);
      } catch (err) {
        store.showToast(err.message || "Failed to launch preset", "error");
      }
    };
  });

  // Attach Launch Task Buttons
  container.querySelectorAll(".launch-task-btn").forEach((btn) => {
    btn.onclick = () => {
      const taskId = parseInt(btn.getAttribute("data-task-id"), 10);
      const task = (store.state.tasks || []).find((t) => t.id === taskId);
      if (task) {
        sound.playCoinTick();
        store.startFocusTimer(task);
      }
    };
  });

  // Attach Custom Launch Form
  const form = container.querySelector("#custom-launch-form");
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const titleInput = container.querySelector("#custom-title-input");
      const catSelect = container.querySelector("#custom-cat-select");
      const minsSelect = container.querySelector("#custom-mins-select");

      const title = (titleInput?.value || "").trim();
      if (!title) return;

      const category = catSelect?.value || "code";
      const mins = parseInt(minsSelect?.value, 10) || 25;

      try {
        const res = await api.createTask({ title, category, mins });
        const task = res.task || res;
        await store.refreshTasks();
        sound.playCoinTick();
        store.startFocusTimer(task);
      } catch (err) {
        store.showToast(err.message || "Failed to launch session", "error");
      }
    };
  }

  // Quick Relax Triggers
  const r5Btn = container.querySelector("#quick-relax-5m-btn");
  if (r5Btn) {
    r5Btn.onclick = () => {
      store.startRelaxTimer(5, "5m Coffee Reset");
    };
  }

  const r15Btn = container.querySelector("#quick-relax-15m-btn");
  if (r15Btn) {
    r15Btn.onclick = () => {
      store.startRelaxTimer(15, "15m Mindful Reset");
    };
  }
}
