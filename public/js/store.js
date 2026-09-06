// public/js/store.js
// Reactive SPA state store, SSE real-time sync, and background timer ticker

import { api } from "./api.js";
import { sound } from "./audio.js";

export class Store {
  constructor() {
    this.state = {
      user: null,
      levelInfo: null,
      tasks: [],
      rewards: [],
      transactions: [],
      timeline: null,
      stats: null,
      activeTimer: null,
      relaxTimer: null,
      currentView: "tasks",
      categories: ["code", "learn", "health", "read", "build"],
    };

    this.listeners = new Set();
    this.eventListeners = new Map();
    this.es = null;
    this._reconnectTimer = null;
    this._timerInterval = null;

    this._startBackgroundTicker();
  }

  // ── Event Bus & Subscriptions ─────────────────────────────────────────
  subscribe(fnOrEvent, maybeFn) {
    if (typeof fnOrEvent === "function") {
      this.listeners.add(fnOrEvent);
      return () => this.listeners.delete(fnOrEvent);
    } else if (typeof fnOrEvent === "string" && typeof maybeFn === "function") {
      if (!this.eventListeners.has(fnOrEvent)) {
        this.eventListeners.set(fnOrEvent, new Set());
      }
      const set = this.eventListeners.get(fnOrEvent);
      set.add(maybeFn);
      return () => set.delete(maybeFn);
    }
    return () => {};
  }

  emit(event = "state_changed", payload = null) {
    for (const fn of this.listeners) {
      try {
        fn(this.state, event, payload);
      } catch (err) {
        console.error("Store listener error:", err);
      }
    }

    const set = this.eventListeners.get(event);
    if (set) {
      for (const fn of set) {
        try {
          fn(payload, this.state);
        } catch (err) {
          console.error(`Store event listener [${event}] error:`, err);
        }
      }
    }
  }

  // ── Notifications ───────────────────────────────────────────────────
  notify(title, message, type = "info") {
    this.showToast(`${title}: ${message}`, type);
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, { body: message });
      } catch {}
    }
  }

  showToast(message, type = "info") {
    if (typeof document === "undefined") return;
    const container = document.getElementById("toast");
    if (!container) return;

    const item = document.createElement("div");
    item.className = "px-4 py-2 border border-outline bg-surface text-primary shadow-2xl flex items-center gap-3 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto mb-2";
    
    const icon = type === "success" ? "check_circle" : type === "error" ? "error" : "info";
    item.innerHTML = `
      <span class="material-symbols-outlined text-sm text-stone-accent">${icon}</span>
      <span class="text-xs font-mono tracking-wide">${message}</span>
    `;

    container.appendChild(item);
    requestAnimationFrame(() => {
      item.classList.remove("translate-y-2", "opacity-0");
    });

    setTimeout(() => {
      item.classList.add("opacity-0", "translate-y-2");
      setTimeout(() => {
        item.remove();
      }, 300);
    }, 4000);
  }

  // ── Background Timer Ticker (1000ms) ──────────────────────────────────
  _startBackgroundTicker() {
    if (typeof setInterval === "undefined") return;
    if (this._timerInterval) clearInterval(this._timerInterval);

    this._timerInterval = setInterval(() => {
      let stateChanged = false;

      // 1. Focus Timer Tick
      if (this.state.activeTimer && this.state.activeTimer.running) {
        const timer = this.state.activeTimer;
        timer.elapsedSeconds += 1;
        stateChanged = true;
        this.emit("timer_tick", { type: "focus", timer });

        // Completion check
        if (timer.targetSeconds > 0 && timer.elapsedSeconds >= timer.targetSeconds) {
          const task = timer.task;
          this.state.activeTimer = null;
          sound.playComplete();
          this.notify("FOCUS COMPLETE", `"${task.title}" target completed!`, "success");

          api.markDone(task.id)
            .then(() => {
              this.refreshTasks();
              this.refreshUserAndStats();
            })
            .catch((err) => {
              console.error("Auto markDone error:", err);
            });

          this.emit("focus_completed", { task });
          this.emit("state_changed", this.state);
        }
      }

      // 2. Relax Timer Tick
      if (this.state.relaxTimer && this.state.relaxTimer.running) {
        const timer = this.state.relaxTimer;
        timer.elapsedSeconds += 1;
        stateChanged = true;
        this.emit("timer_tick", { type: "relax", timer });

        // Completion check
        if (timer.totalSeconds > 0 && timer.elapsedSeconds >= timer.totalSeconds) {
          const name = timer.name;
          this.state.relaxTimer = null;
          sound.playBell();
          this.notify("RELAX TIMER OVER", `${name} ended! Back to work.`, "info");
          this.emit("relax_completed", { name });
          this.emit("state_changed", this.state);
        }
      }

      if (stateChanged) {
        // Debounced or general tick notification if needed
      }
    }, 1000);
  }

  // ── Focus & Relax Timer Controls ─────────────────────────────────────
  async toggleTaskDone(taskId) {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    try {
      if (task.status === "done") {
        await api.markUndone(taskId);
        this.showToast(`Reopened: "${task.title}"`, "info");
      } else {
        await api.markDone(taskId);
        sound.playComplete();
        this.showToast(`Completed: "${task.title}" (+${task.xp || 10} XP, +${task.coins || 10} ⟐)`, "success");
      }
      await Promise.all([this.refreshTasks(), this.refreshUserAndStats()]);
    } catch (err) {
      this.showToast(err.message || "Failed to toggle task", "error");
    }
  }

  startFocusTimer(task) {
    if (!task) return;
    const targetSeconds = (task.mins && task.mins > 0 ? task.mins : 25) * 60;
    const elapsedSeconds = task.time_spent || 0;

    this.state.activeTimer = {
      task,
      running: true,
      elapsedSeconds,
      targetSeconds,
      startedAt: Date.now(),
    };

    api.syncTimer(task.id, "start", elapsedSeconds).catch(() => {});
    this.emit("timer_started", this.state.activeTimer);
    this.emit("state_changed", this.state);
  }

  pauseFocusTimer() {
    if (!this.state.activeTimer) return;
    this.state.activeTimer.running = false;
    api.syncTimer(this.state.activeTimer.task.id, "pause", this.state.activeTimer.elapsedSeconds).catch(() => {});
    this.emit("timer_paused", this.state.activeTimer);
    this.emit("state_changed", this.state);
  }

  resumeFocusTimer() {
    if (!this.state.activeTimer || this.state.activeTimer.running) return;
    this.state.activeTimer.running = true;
    api.syncTimer(this.state.activeTimer.task.id, "start", this.state.activeTimer.elapsedSeconds).catch(() => {});
    this.emit("timer_resumed", this.state.activeTimer);
    this.emit("state_changed", this.state);
  }

  stopFocusTimer(bank = true) {
    if (!this.state.activeTimer) return;
    const timer = this.state.activeTimer;
    const mins = Math.floor(timer.elapsedSeconds / 60);
    this.state.activeTimer = null;

    if (bank && mins > 0) {
      api.syncTimer(timer.task.id, "bank", timer.elapsedSeconds, mins)
        .then(() => {
          this.refreshUserAndStats();
          this.refreshTasks();
        })
        .catch(() => {});
    } else {
      api.syncTimer(timer.task.id, "pause", timer.elapsedSeconds).catch(() => {});
    }

    this.emit("timer_stopped", { task: timer.task, banked: bank, minutes: mins });
    this.emit("state_changed", this.state);
  }

  startRelaxTimer(mins = 5, name = "Relax Break") {
    const totalSeconds = Math.max(1, mins) * 60;
    this.state.relaxTimer = {
      name,
      running: true,
      elapsedSeconds: 0,
      totalSeconds,
      startedAt: Date.now(),
    };
    this.emit("relax_started", this.state.relaxTimer);
    this.emit("state_changed", this.state);
  }

  pauseRelaxTimer() {
    if (!this.state.relaxTimer) return;
    this.state.relaxTimer.running = false;
    this.emit("relax_paused", this.state.relaxTimer);
    this.emit("state_changed", this.state);
  }

  resumeRelaxTimer() {
    if (!this.state.relaxTimer || this.state.relaxTimer.running) return;
    this.state.relaxTimer.running = true;
    this.emit("relax_resumed", this.state.relaxTimer);
    this.emit("state_changed", this.state);
  }

  stopRelaxTimer() {
    if (!this.state.relaxTimer) return;
    this.state.relaxTimer = null;
    this.emit("relax_stopped", null);
    this.emit("state_changed", this.state);
  }

  // ── Server-Sent Events Sync ──────────────────────────────────────────
  connectSSE() {
    if (typeof EventSource === "undefined") return;

    if (this.es) {
      this.es.close();
      this.es = null;
    }

    const token = api.getToken();
    if (!token) return;

    const url = `/api/events?api_key=${encodeURIComponent(token)}`;
    try {
      this.es = new EventSource(url);

      this.es.onopen = () => {
        this.emit("sse_connected", { status: "connected" });
      };

      this.es.onerror = () => {
        this.emit("sse_disconnected", { status: "disconnected" });
        if (this.es) {
          this.es.close();
          this.es = null;
        }
        // Auto-reconnect with 3s backoff
        if (!this._reconnectTimer) {
          this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.connectSSE();
          }, 3000);
        }
      };

      this.es.addEventListener("task", (e) => {
        try {
          const data = JSON.parse(e.data);
          this.handleTaskEvent(data);
        } catch {}
      });

      this.es.addEventListener("focus", () => {
        this.refreshUserAndStats();
      });

      this.es.addEventListener("reward_buy", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (this.state.user && data.coins_left !== undefined) {
            this.state.user.coins = data.coins_left;
          }
          this.refreshTransactions();
          this.emit("reward_bought", data);
          this.emit("state_changed", this.state);
        } catch {}
      });

      this.es.addEventListener("reward_create", () => {
        this.refreshRewards();
      });

      this.es.addEventListener("activity", () => {
        this.refreshStats();
      });

      this.es.addEventListener("import", () => {
        this.loadAll();
      });
    } catch (err) {
      console.error("SSE setup error:", err);
    }
  }

  disconnectSSE() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  handleTaskEvent(payload) {
    if (!payload || !payload.id) return;

    if (payload.deleted) {
      this.state.tasks = this.state.tasks.filter((t) => t.id !== payload.id);
    } else if (payload.archived) {
      this.state.tasks = this.state.tasks.filter((t) => t.id !== payload.id);
    } else {
      const idx = this.state.tasks.findIndex((t) => t.id === payload.id);
      if (idx >= 0) {
        this.state.tasks[idx] = payload;
      } else {
        this.state.tasks.unshift(payload);
      }
    }

    this.refreshTimeline();
    this.refreshUserAndStats();
    this.emit("task_updated", payload);
    this.emit("state_changed", this.state);
  }

  // ── Data Fetching ─────────────────────────────────────────────────────
  async loadAll() {
    const token = api.getToken();
    if (!token && !api.username) return;

    try {
      const [meRes, tasksRes, rewardsRes, txRes, tlRes, statsRes] = await Promise.allSettled([
        api.getMe(),
        api.getTasks(),
        api.getRewards(),
        api.getTransactions(),
        api.getTimeline(),
        api.getStats(),
      ]);

      if (meRes.status === "fulfilled" && meRes.value) {
        this.state.user = meRes.value.user;
        this.state.levelInfo = meRes.value.level_info;
      }

      if (tasksRes.status === "fulfilled" && tasksRes.value?.tasks) {
        this.state.tasks = tasksRes.value.tasks;
      }

      if (rewardsRes.status === "fulfilled" && rewardsRes.value?.rewards) {
        this.state.rewards = rewardsRes.value.rewards;
      }

      if (txRes.status === "fulfilled" && txRes.value?.transactions) {
        this.state.transactions = txRes.value.transactions;
      }

      if (tlRes.status === "fulfilled" && tlRes.value) {
        this.state.timeline = tlRes.value;
      }

      if (statsRes.status === "fulfilled" && statsRes.value) {
        this.state.stats = statsRes.value;
      }

      this.connectSSE();
      this.emit("state_changed", this.state);
    } catch (err) {
      console.error("Error loading store data:", err);
    }
  }

  async refreshTasks(params = {}) {
    try {
      const data = await api.getTasks(params);
      if (data?.tasks) {
        this.state.tasks = data.tasks;
        this.emit("tasks_loaded", this.state.tasks);
        this.emit("state_changed", this.state);
      }
    } catch {}
  }

  async refreshUserAndStats() {
    try {
      const [me, stats] = await Promise.all([api.getMe(), api.getStats()]);
      if (me) {
        this.state.user = me.user;
        this.state.levelInfo = me.level_info;
      }
      if (stats) {
        this.state.stats = stats;
      }
      this.emit("state_changed", this.state);
    } catch {}
  }

  async refreshRewards() {
    try {
      const data = await api.getRewards();
      if (data?.rewards) {
        this.state.rewards = data.rewards;
        this.emit("rewards_loaded", this.state.rewards);
        this.emit("state_changed", this.state);
      }
    } catch {}
  }

  async refreshTransactions() {
    try {
      const data = await api.getTransactions();
      if (data?.transactions) {
        this.state.transactions = data.transactions;
        this.emit("transactions_loaded", this.state.transactions);
        this.emit("state_changed", this.state);
      }
    } catch {}
  }

  async refreshTimeline(now = null) {
    try {
      const data = await api.getTimeline(now);
      if (data) {
        this.state.timeline = data;
        this.emit("timeline_loaded", this.state.timeline);
        this.emit("state_changed", this.state);
      }
    } catch {}
  }

  async refreshStats() {
    try {
      const data = await api.getStats();
      if (data) {
        this.state.stats = data;
        this.emit("stats_loaded", this.state.stats);
        this.emit("state_changed", this.state);
      }
    } catch {}
  }
}

export const store = new Store();
if (typeof window !== "undefined") {
  window.store = store;
}
