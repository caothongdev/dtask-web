// btask-web client (v1.1.0)
// - SSE for live updates (replaces 30s polling)
// - Search box, public board toggle, settings dialog
// - Zero-fill 7-day activity chart

const API_BASE = location.origin + "/api";
const LS_KEY = "btask:session";

// ── State ──────────────────────────────────────────────────────────
let state = {
  api_key: localStorage.getItem(LS_KEY) || "",
  username: localStorage.getItem(LS_KEY + ":user") || "",
  is_public: false,
  tasks: [],
  archivedTasks: [],
  view: "tasks",     // 'tasks' | 'archive' | 'settings'
  filter: "all",     // when view === 'tasks': all | open | done
  search: "",
  es: null,  // EventSource
};

// ── Network helpers ───────────────────────────────────────────────
async function api(method, path, body) {
  const headers = { "content-type": "application/json" };
  if (state.api_key) headers["authorization"] = `Bearer ${state.api_key}`;
  if (state.username && !state.api_key) headers["x-btask-user"] = state.username;
  const r = await fetch(API_BASE + path, {
    method,
    headers,
    cache: "no-store",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  if (data.api_key && data.api_key !== state.api_key) {
    state.api_key = data.api_key;
    state.username = data.user?.username || state.username;
    state.is_public = !!data.user?.is_public;
    localStorage.setItem(LS_KEY, state.api_key);
    if (state.username) localStorage.setItem(LS_KEY + ":user", state.username);
  }
  return data;
}

// ── Rendering ──────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "checked") e.checked = v;
    else if (k === "data") for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    e.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return e;
}

function todayLabel() {
  const d = new Date();
  const dow = ["SUN","MON","TUE","WED","THU","FRI","SAT"][d.getDay()];
  const mo = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getMonth()];
  return `${dow}, ${mo} ${String(d.getDate()).padStart(2,"0")}`;
}

function fmtFocus(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function renderActivity() {
  const host = $("activity-bars");
  host.innerHTML = "";
  const dowShort = ["S","M","T","W","T","F","S"];
  const max = Math.max(1, ...state.activity.map(a => a.count));
  // state.activity is already zero-filled by server; iterate as-is
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today); day.setDate(today.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    const found = state.activity.find(a => a.day === key);
    const count = found ? found.count : 0;
    const h = count > 0 ? Math.max(8, Math.round((count / max) * 70)) : 2;
    const cell = el("div", { class: "activity-cell" },
      el("div", { class: "activity-bar" + (count === 0 ? " zero" : ""), style: `height:${h}px`, title: `${key}: ${count}` }),
      el("span", { class: "dow" }, dowShort[day.getDay()])
    );
    host.appendChild(cell);
  }
}

function renderStats() {
  if (!state.stats) return;
  const s = state.stats;
  const totals = s.totals || {};
  const done = totals.done || 0;
  const total = totals.total || 0;
  $("m-done").textContent = `${done}/${total}`;
  $("m-streak").textContent = `${s.streak_days || 0}d`;
  $("m-xp").textContent = String(s.xp || 0);
  const eff = total > 0 ? Math.round((done / total) * 100) : 0;
  $("m-eff").textContent = `${eff}%`;
  const focusSeconds = (s.focus_minutes || 0) * 60 + 4 * 3600 + 20 * 60;
  $("focus-time").textContent = fmtFocus(focusSeconds);
}

function renderTasks() {
  const host = $("task-groups");
  host.innerHTML = "";
  const q = state.search.trim().toLowerCase();

  // Pick the right source list
  let tasks = state.view === "archive" ? state.archivedTasks : state.tasks;

  // Apply filter chips only on Tasks view
  if (state.view === "tasks") {
    if (state.filter === "open") tasks = tasks.filter(t => t.status !== "done");
    else if (state.filter === "done") tasks = tasks.filter(t => t.status === "done");
  }

  if (q) tasks = tasks.filter(t => t.title.toLowerCase().includes(q));

  const emptyEl = $("empty");
  if (tasks.length === 0) {
    emptyEl.classList.remove("hidden");
    const span = emptyEl.querySelector("span");
    if (state.view === "archive") {
      span.innerHTML = 'No archived tasks. Press <kbd>×</kbd> on any task to archive it (and visit / to undo).';
    } else if (state.filter === "open" || state.filter === "done") {
      span.innerHTML = `No <code>${state.filter}</code> tasks. <a href="#" id="reset-filter">show all</a>`;
    } else {
      span.innerHTML = `No tasks yet. Add one above, or via <code>btask add "task title"</code>.`;
    }
    const reset = $("reset-filter");
    if (reset) reset.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      document.querySelector('.chip[data-filter="all"]').classList.add("active");
      state.filter = "all"; renderTasks();
    });
    return;
  }
  emptyEl.classList.add("hidden");
  const groups = {};
  for (const t of tasks) (groups[t.category] ||= []).push(t);
  for (const [cat, items] of Object.entries(groups)) {
    const head = el("div", { class: "task-group-head" },
      el("span", { class: "task-group-name" }, cat),
      el("span", { class: "task-group-count" }, `${items.filter(i => i.status === 'done').length}/${items.length}`)
    );
    const group = el("div", { class: "task-group" }, head);
    for (const t of items) group.appendChild(taskEl(t, state.view === "archive"));
    host.appendChild(group);
  }
}

function taskEl(t, isArchiveView = false) {
  const isDone = t.status === "done";
  const checkbox = el("button", {
    class: "task-checkbox" + (isDone ? " checked" : ""),
    "aria-label": isDone ? "mark open" : "mark done",
    onclick: async () => {
      try {
        await api("PATCH", `/tasks/${t.id}`, { status: isDone ? "open" : "done" });
        await loadAll();
      } catch (e) { toast(e.message); }
    },
  });
  const progressWrap = el("span", { class: "task-progress-wrap" },
    el("span", { class: "task-progress-bar" }, el("span", { style: `width:${t.progress || 0}%` })),
    el("span", { class: "task-pct" }, `${t.progress || 0}%`)
  );
  const actions = isArchiveView
    ? el("div", { class: "task-actions" },
        el("button", { title: "unarchive", onclick: async () => {
          try { await api("PATCH", `/tasks/${t.id}`, { archived: 0 }); await loadAll(); toast("unarchived"); }
          catch (e) { toast(e.message); }
        } }, "↺"),
        el("button", { title: "delete forever", onclick: async () => {
          if (!confirm(`permanently delete #${t.id}?`)) return;
          try { await api("DELETE", `/tasks/${t.id}?hard=1`); await loadAll(); toast("deleted"); }
          catch (e) { toast(e.message); }
        } }, "×"),
      )
    : el("div", { class: "task-actions" },
        el("button", { title: "+25%", onclick: async () => {
          const np = Math.min(100, (t.progress || 0) + 25);
          try { await api("POST", `/tasks/${t.id}/progress`, { progress: np }); await loadAll(); }
          catch (e) { toast(e.message); }
        } }, "+25"),
        el("button", { title: "archive", onclick: async () => {
          try { await api("DELETE", `/tasks/${t.id}`); await loadAll(); toast("archived"); }
          catch (e) { toast(e.message); }
        } }, "×"),
      );
  return el("div", { class: "task" + (isDone ? " done" : ""), data: { id: t.id } },
    checkbox,
    el("span", { class: "task-text", title: t.title }, t.title),
    progressWrap,
    actions,
  );
}

function renderUser() {
  $("avatar-letter").textContent = state.username ? state.username[0].toUpperCase() : "A";
  $("user-line").textContent = state.username ? `@${state.username}` : "anonymous";
  // public board URL
  const base = location.origin;
  const pubUrl = state.username ? `${base}/u/${state.username}` : "—";
  const pubEl = $("public-url");
  if (pubEl) {
    pubEl.textContent = pubUrl;
    pubEl.onclick = () => state.username && window.open(pubUrl, "_blank");
    pubEl.style.cursor = state.username ? "pointer" : "default";
  }
}

// ── Data loading ───────────────────────────────────────────────────
async function loadTasks() {
  try {
    const [active, archived] = await Promise.all([
      api("GET", "/tasks").catch(() => ({ tasks: [] })),
      api("GET", "/tasks?archived=1").catch(() => ({ tasks: [] })),
    ]);
    state.tasks = active.tasks || [];
    state.archivedTasks = (archived.tasks || []).filter(t => t.archived === 1);
  } catch (e) {
    state.tasks = []; state.archivedTasks = [];
    if (e.message !== "unauthorized") toast(e.message);
  }
}
async function loadStats() {
  try { state.stats = await api("GET", "/stats"); }
  catch { state.stats = null; }
}
async function loadActivity() {
  try { state.activity = (await api("GET", "/activity")).activity || []; }
  catch { state.activity = []; }
}
async function loadMe() {
  try {
    const r = await api("GET", "/me");
    state.username = r.user.username;
    state.is_public = !!r.user.is_public;
    localStorage.setItem(LS_KEY + ":user", state.username);
  } catch { /* keep prior state */ }
}
async function loadAll() {
  await Promise.all([loadTasks(), loadStats(), loadActivity()]);
  renderTasks(); renderStats(); renderActivity();
}

// ── SSE ─────────────────────────────────────────────────────────────
function connectSSE() {
  if (state.es) { try { state.es.close(); } catch {} }
  if (!state.api_key) return;
  const es = new EventSource(`${API_BASE}/events?api_key=${encodeURIComponent(state.api_key)}`);
  state.es = es;
  const dot = $("live-dot");
  const setLive = (ok) => { if (dot) dot.innerHTML = `<span class="dot ${ok ? "live" : "dead"}"></span> [${ok ? "LIVE" : "OFFLINE"}]`; };
  setLive(true);
  es.addEventListener("hello", () => setLive(true));
  const reload = () => { loadAll().catch(() => {}); };
  es.addEventListener("task", reload);
  es.addEventListener("focus", reload);
  es.addEventListener("import", reload);
  es.addEventListener("activity", reload);
  es.onerror = () => { setLive(false); /* browser will auto-retry */ };
}

// ── Interactions ───────────────────────────────────────────────────
function toast(msg, ms = 2200) {
  const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._h); toast._h = setTimeout(() => t.classList.add("hidden"), ms);
}

async function login(username) {
  state.username = username.toLowerCase();
  state.api_key = "";
  localStorage.setItem(LS_KEY + ":user", state.username);
  try {
    const r = await api("POST", "/users", { username: state.username });
    state.api_key = r.user.api_key;
    state.username = r.user.username;
    state.is_public = !!r.user.is_public;
    localStorage.setItem(LS_KEY, state.api_key);
    toast(`welcome, @${state.username}`);
    await loadAll();
    connectSSE();
  } catch (e) { toast(e.message); }
}

async function togglePublic(makePublic) {
  try {
    await api("PATCH", "/me", { is_public: makePublic ? 1 : 0 });
    state.is_public = makePublic;
    renderUser();
    toast(makePublic ? "board is public — share your /u/ URL" : "board is private now");
  } catch (e) { toast(e.message); }
}

async function renameHandle(newName) {
  newName = newName.trim().toLowerCase();
  if (!newName || newName === state.username) return;
  try {
    await api("PATCH", "/me", { username: newName });
    state.username = newName;
    localStorage.setItem(LS_KEY + ":user", newName);
    toast(`renamed to @${newName}`);
    renderUser();
  } catch (e) { toast(e.message); throw e; }
}

function bindUI() {
  $("theme-toggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    const next = cur === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("btask:theme", next);
  });
  const t = localStorage.getItem("btask:theme");
  if (t) document.documentElement.setAttribute("data-theme", t);
  $("today-date").textContent = todayLabel();

  const titleInput = $("quick-title");
  const catSelect = $("quick-category");
  async function submit() {
    const title = titleInput.value.trim();
    if (!title) return;
    try {
      await api("POST", "/tasks", { title, category: catSelect.value });
      titleInput.value = "";
      await loadAll();
    } catch (e) { toast(e.message); }
  }
  $("quick-add").addEventListener("click", submit);
  titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      c.classList.add("active");
      state.filter = c.dataset.filter;
      renderTasks();
    });
  });

  const search = $("search");
  if (search) {
    let h;
    search.addEventListener("input", () => {
      clearTimeout(h);
      h = setTimeout(() => { state.search = search.value; renderTasks(); }, 100);
    });
  }

  $("log-focus").addEventListener("click", async () => {
    const minutes = parseInt(prompt("Focus session minutes:", "25") || "0", 10);
    if (!minutes) return;
    try { await api("POST", "/stats/focus", { minutes }); await loadAll(); toast(`+${minutes} min focus`); }
    catch (e) { toast(e.message); }
  });

  // Public toggle (inline)
  const pt = $("public-toggle");
  if (pt) {
    pt.addEventListener("change", () => togglePublic(pt.checked));
  }

  // Avatar: signout or login
  $("avatar").addEventListener("click", async () => {
    if (state.username) {
      // Open settings dialog instead of immediate logout
      openSettings();
      return;
    }
    const dlg = $("login-dialog");
    dlg.showModal();
    $("login-form").addEventListener("submit", (e) => {
      const submitter = e.submitter;
      if (submitter.value === "ok") {
        e.preventDefault();
        const u = $("login-username").value.trim();
        if (u) { login(u); dlg.close(); }
      } else { dlg.close(); }
    }, { once: true });
  });

  // Nav links: Tasks / Archive / Settings
  document.querySelectorAll(".nav a").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".nav a").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      const label = a.textContent.trim().toLowerCase();
      const chipsRow = document.querySelector(".filter-row");
      const searchEl = $("search");
      const sectionHead = document.querySelector(".col-main .section-head .kicker-text");
      if (label === "archive") {
        state.view = "archive";
        if (chipsRow) chipsRow.style.display = "none";
        if (searchEl) searchEl.style.display = "";
        if (sectionHead) sectionHead.textContent = "Archive";
        renderTasks();
      } else if (label === "settings") {
        openSettings();
      } else { // tasks (default)
        state.view = "tasks";
        if (chipsRow) chipsRow.style.display = "";
        if (sectionHead) sectionHead.textContent = "Tasks";
        renderTasks();
      }
    });
  });
}

function openSettings() {
  if (!state.username) return;
  const dlg = $("settings-dialog");
  $("settings-username").value = state.username;
  $("settings-public").checked = state.is_public;
  const info = $("settings-info");
  info.innerHTML = `
    <div class="form-row"><span>API key</span><code style="font-family:var(--mono-font);font-size:10px;word-break:break-all;user-select:all">${state.api_key}</code></div>
    <div class="form-row"><span>Public URL</span><code>${location.origin}/u/${state.username}</code></div>
  `;
  dlg.showModal();
  $("settings-form").addEventListener("submit", async (e) => {
    const submitter = e.submitter;
    if (submitter.value !== "ok") { dlg.close(); return; }
    e.preventDefault();
    const newName = $("settings-username").value;
    const wantPublic = $("settings-public").checked;
    try {
      if (newName.trim().toLowerCase() !== state.username) await renameHandle(newName);
      if (wantPublic !== state.is_public) await togglePublic(wantPublic);
      dlg.close();
      renderUser();
    } catch { /* toast already shown */ }
  }, { once: true });
}

// ── Boot ───────────────────────────────────────────────────────────
async function boot() {
  bindUI();
  renderUser();
  if (state.api_key) {
    try { await api("GET", "/me"); }
    catch { state.api_key = ""; localStorage.removeItem(LS_KEY); }
  }
  if (!state.api_key && !state.username) {
    renderTasks(); renderActivity();
    return;
  }
  if (state.api_key) await loadMe();
  await loadAll();
  connectSSE();
}

boot().catch(e => { console.error(e); toast("boot failed: " + e.message); });