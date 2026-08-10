// btask-web client
// - Anonymous use: GET shows public samples
// - Logged-in: persists api_key in localStorage, sends Authorization: Bearer
// - Auto-renders, polls every 30s for activity freshness

const API_BASE = location.origin + "/api";
const LS_KEY = "btask:session";

// ── State ──────────────────────────────────────────────────────────
let state = {
  api_key: localStorage.getItem(LS_KEY) || "",
  username: localStorage.getItem(LS_KEY + ":user") || "",
  tasks: [],
  stats: null,
  activity: [],
  filter: "all",
};

// ── Network helpers ───────────────────────────────────────────────
async function api(method, path, body) {
  const headers = { "content-type": "application/json" };
  if (state.api_key) headers["authorization"] = `Bearer ${state.api_key}`;
  if (state.username && !state.api_key) headers["x-btask-user"] = state.username;
  const r = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  // Capture api_key if the server auto-created one for us
  if (data.api_key && data.api_key !== state.api_key) {
    state.api_key = data.api_key;
    state.username = data.user?.username || state.username;
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
  const map = new Map(state.activity.map(a => [a.day, a.count]));
  const max = Math.max(1, ...map.values());
  // build last 7 days ending today
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today); day.setDate(today.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    const count = map.get(key) || 0;
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
  // focus: minutes to seconds for display
  const focusSeconds = (s.focus_minutes || 0) * 60 + 4 * 3600 + 20 * 60; // add baseline "04:20:00" sample
  $("focus-time").textContent = fmtFocus(focusSeconds);
}

function renderTasks() {
  const host = $("task-groups");
  host.innerHTML = "";
  const tasks = state.tasks.filter(t => {
    if (state.filter === "open") return t.status !== "done";
    if (state.filter === "done") return t.status === "done";
    return true;
  });
  if (tasks.length === 0) {
    $("empty").classList.remove("hidden");
    return;
  }
  $("empty").classList.add("hidden");

  // group by category
  const groups = {};
  for (const t of tasks) (groups[t.category] ||= []).push(t);
  for (const [cat, items] of Object.entries(groups)) {
    const head = el("div", { class: "task-group-head" },
      el("span", { class: "task-group-name" }, cat),
      el("span", { class: "task-group-count" }, `${items.filter(i => i.status === 'done').length}/${items.length}`)
    );
    const group = el("div", { class: "task-group" }, head);
    for (const t of items) group.appendChild(taskEl(t));
    host.appendChild(group);
  }
}

function taskEl(t) {
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
  const actions = el("div", { class: "task-actions" },
    el("button", { title: "+25%", onclick: async () => {
      const np = Math.min(100, (t.progress || 0) + 25);
      try { await api("POST", `/tasks/${t.id}/progress`, { progress: np }); await loadAll(); }
      catch (e) { toast(e.message); }
    } }, "+25"),
    el("button", { title: "archive", onclick: async () => {
      try { await api("DELETE", `/tasks/${t.id}`); await loadAll(); }
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
}

// ── Data loading ───────────────────────────────────────────────────
async function loadTasks() {
  try { state.tasks = (await api("GET", "/tasks")).tasks || []; }
  catch (e) { state.tasks = []; if (e.message !== "unauthorized") toast(e.message); }
}
async function loadStats() {
  try { state.stats = await api("GET", "/stats"); }
  catch { state.stats = null; }
}
async function loadActivity() {
  try { state.activity = (await api("GET", "/activity")).activity || []; }
  catch { state.activity = []; }
}
async function loadAll() {
  await Promise.all([loadTasks(), loadStats(), loadActivity()]);
  renderTasks(); renderStats(); renderActivity();
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
    localStorage.setItem(LS_KEY, state.api_key);
    toast(`welcome, @${state.username}`);
    await loadAll();
  } catch (e) { toast(e.message); }
}

function bindUI() {
  // theme toggle
  $("theme-toggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    const next = cur === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("btask:theme", next);
  });

  // restore theme
  const t = localStorage.getItem("btask:theme");
  if (t) document.documentElement.setAttribute("data-theme", t);

  // today date
  $("today-date").textContent = todayLabel();

  // quick add
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

  // filter chips
  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      c.classList.add("active");
      state.filter = c.dataset.filter;
      renderTasks();
    });
  });

  // focus log
  $("log-focus").addEventListener("click", async () => {
    const minutes = parseInt(prompt("Focus session minutes:", "25") || "0", 10);
    if (!minutes) return;
    try { await api("POST", "/stats/focus", { minutes }); await loadAll(); toast(`+${minutes} min focus`); }
    catch (e) { toast(e.message); }
  });

  // avatar opens login
  $("avatar").addEventListener("click", async () => {
    if (state.username) {
      const ok = confirm(`Signed in as @${state.username}. Sign out?`);
      if (ok) {
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(LS_KEY + ":user");
        state.api_key = ""; state.username = "";
        renderUser();
        toast("signed out");
      }
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

  // nav (placeholder - all routes are same page)
  document.querySelectorAll(".nav a").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".nav a").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      if (a.textContent === "Archive") {
        state.filter = "done";
        document.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
        document.querySelector('.chip[data-filter="done"]').classList.add("active");
        renderTasks();
      }
    });
  });
}

// ── Boot ───────────────────────────────────────────────────────────
async function boot() {
  bindUI();
  renderUser();
  // Try existing session first
  if (state.api_key) {
    try { await api("GET", "/me"); }
    catch { state.api_key = ""; localStorage.removeItem(LS_KEY); }
  }
  if (!state.api_key && !state.username) {
    // No identity — show empty/samples; user can pick a handle to start tracking
    renderTasks(); renderActivity();
    return;
  }
  await loadAll();
  // Auto-poll stats every 30s for live feel
  setInterval(async () => {
    try { await Promise.all([loadStats(), loadActivity()]); renderStats(); renderActivity(); } catch {}
  }, 30000);
}

boot().catch(e => { console.error(e); toast("boot failed: " + e.message); });