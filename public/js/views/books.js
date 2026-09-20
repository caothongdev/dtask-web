// public/js/views/books.js
// In-App Book Reader & References view: linked reading tasks list + reader display window.
// Blueprint Silicon light theme.

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

let currentReadingTaskId = null;

export function renderBooksView(container) {
  if (!container) return;

  const tasks = store.state.tasks || [];
  const readingTasks = tasks.filter(
    (t) => !t.archived && (Number(t.pages) > 0 || !!t.book_title || !!t.book_text)
  );

  const activeTask = readingTasks.find((t) => t.id === currentReadingTaskId) || readingTasks[0] || null;
  if (activeTask) currentReadingTaskId = activeTask.id;

  const curPage = activeTask ? Number(activeTask.page) || 0 : 0;
  const totPages = activeTask ? Number(activeTask.pages) || 0 : 0;
  const pct = totPages > 0 ? Math.min(100, Math.round((curPage / totPages) * 100)) : 0;

  container.innerHTML = `
    <div class="space-y-6" data-books-view>
      <!-- Header Banner -->
      <div class="bg-surface rounded-2xl border border-outline-variant shadow-card p-5 flex items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-primary pulse-dot"></span>
            <h2 class="text-lg font-extrabold text-stone-accent tracking-tight font-sans">In-App Book Reader &amp; References</h2>
          </div>
          <p class="text-xs text-outline mt-0.5">Reading materials and documentation connected to your active reading tasks.</p>
        </div>
        <span class="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-badge-violet text-badge-violet-text border border-violet-200" id="attached-books-count">${readingTasks.length} Attachments</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- List of reading tasks -->
        <div class="lg:col-span-4 bg-surface rounded-2xl border border-outline-variant shadow-card p-4 space-y-2">
          <h3 class="text-xs font-mono font-bold uppercase text-outline tracking-wider mb-3">Linked Books</h3>
          <div id="reader-task-list" class="space-y-2">
            ${
              readingTasks.length === 0
                ? `<p class="text-xs text-outline py-3">No reading tasks yet. Create a task with <span class="font-mono">--book "Title" P</span> flags to attach a book.</p>`
                : readingTasks
                    .map(
                      (t) => `
              <button data-book-task-id="${t.id}" class="book-select-btn w-full text-left p-2.5 rounded-xl border ${
                activeTask && activeTask.id === t.id
                  ? "border-primary bg-primary-soft"
                  : "border-outline-variant hover:border-primary hover:bg-primary-soft/40"
              } transition">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-bold text-stone-accent truncate">${escapeHtml(t.book_title || "Attached Reading")}</span>
                  <span class="text-[10px] font-mono text-outline shrink-0">p${t.page || 0}/${t.pages || 0}</span>
                </div>
                <div class="text-[11px] text-outline truncate mt-0.5">Task: ${escapeHtml(t.title)}</div>
              </button>
            `
                    )
                    .join("")
            }
          </div>
        </div>

        <!-- Reader Display Window -->
        <div class="lg:col-span-8 bg-surface rounded-2xl border border-outline-variant shadow-card p-6 flex flex-col min-h-[460px]">
          <div class="border-b border-outline-variant pb-4 mb-4 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h3 class="font-bold text-stone-accent text-base truncate" id="reader-title">${activeTask ? escapeHtml(activeTask.book_title || activeTask.title) : "Select a Reading Item"}</h3>
              <p class="text-xs text-outline font-mono mt-0.5 truncate" id="reader-meta">${activeTask ? `Linked to: ${activeTask.title}` : "Ready to read"}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button id="reader-open-modal-btn" class="px-3 py-1.5 rounded-xl bg-primary-soft text-primary hover:bg-blue-100 border border-blue-200 text-xs font-bold transition ${activeTask ? "" : "hidden"}">
                📖 Open Full Reader
              </button>
              <button id="reader-start-timer-btn" class="px-3 py-1.5 rounded-xl bg-surface-subtle text-stone-accent hover:bg-surface-container border border-outline-variant text-xs font-bold transition ${activeTask ? "" : "hidden"}">
                ⏱️ Start Reading Timer
              </button>
            </div>
          </div>

          <!-- Progress meter -->
          ${
            activeTask && totPages > 0
              ? `
          <div class="flex items-center gap-3 mb-4">
            <div class="flex-1 bg-surface-container-high rounded-full h-2 overflow-hidden">
              <div class="bg-primary h-2 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
            </div>
            <span class="text-xs font-mono text-outline shrink-0">${curPage}/${totPages} (${pct}%)</span>
          </div>
          `
              : ""
          }

          <div id="reader-content" class="text-stone-soft text-sm leading-relaxed whitespace-pre-wrap font-sans bg-surface-container-low p-6 rounded-2xl border border-outline-variant flex-1 overflow-y-auto">
            ${
              activeTask
                ? activeTask.book_text
                  ? escapeHtml(activeTask.book_text)
                  : "No chapter content stored for this task yet. Open the full reader to paste or upload reading material (.txt/.md)."
                : "Choose a book from the left panel to load its content, or create a task with an attached book."
            }
          </div>

          <!-- Page stepper quick controls -->
          ${
            activeTask && totPages > 0
              ? `
          <div class="flex items-center justify-between mt-4 pt-4 border-t border-outline-variant text-xs font-mono">
            <div class="flex items-center gap-2">
              <button id="books-page-prev" data-task-id="${activeTask.id}" class="px-2.5 py-1 rounded-lg bg-white hover:bg-surface-subtle border border-outline-variant text-stone-accent font-bold transition">-1</button>
              <span class="text-outline">page</span>
              <button id="books-page-next" data-task-id="${activeTask.id}" class="px-2.5 py-1 rounded-lg bg-white hover:bg-surface-subtle border border-outline-variant text-stone-accent font-bold transition">+1</button>
            </div>
            <span class="text-outline">${activeTask.status === "done" ? "STATUS: RESOLVED ✓" : "IN PROGRESS"}</span>
          </div>
          `
              : ""
          }
        </div>
      </div>
    </div>
  `;

  bindBooksEvents(container, activeTask);
}

function bindBooksEvents(container, activeTask) {
  // Book selection
  container.querySelectorAll(".book-select-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentReadingTaskId = parseInt(btn.getAttribute("data-book-task-id"), 10);
      renderBooksView(container);
    });
  });

  // Open full reader modal
  container.querySelector("#reader-open-modal-btn")?.addEventListener("click", () => {
    if (!activeTask) return;
    openReaderModal(activeTask, () => {
      store.refreshTasks();
      renderBooksView(container);
    });
  });

  // Start reading timer via focus engine
  container.querySelector("#reader-start-timer-btn")?.addEventListener("click", () => {
    if (!activeTask) return;
    store.startFocusTimer(activeTask);
    location.hash = "#focus";
  });

  // Page steppers
  container.querySelector("#books-page-prev")?.addEventListener("click", async (e) => {
    const taskId = parseInt(e.currentTarget.getAttribute("data-task-id"), 10);
    const task = (store.state.tasks || []).find((t) => t.id === taskId);
    if (!task) return;
    const newPage = Math.max(0, (task.page || 0) - 1);
    try {
      await api.updateBook(taskId, newPage);
      sound.playCoinTick();
      await store.refreshTasks();
      renderBooksView(container);
    } catch (err) {
      store.showToast(err.message || "Failed to update page", "error");
    }
  });

  container.querySelector("#books-page-next")?.addEventListener("click", async (e) => {
    const taskId = parseInt(e.currentTarget.getAttribute("data-task-id"), 10);
    const task = (store.state.tasks || []).find((t) => t.id === taskId);
    if (!task) return;
    const newPage = (task.page || 0) + 1;
    try {
      await api.updateBook(taskId, newPage);
      sound.playCoinTick();
      if (task.pages > 0 && newPage >= task.pages && task.status !== "done") {
        await api.markDone(taskId);
        sound.playComplete();
        store.showToast(`Completed book: "${task.book_title || task.title}"! (+${task.xp || 10} XP, +${task.coins || 10} 🪙)`, "success");
        await store.refreshUserAndStats();
      }
      await store.refreshTasks();
      renderBooksView(container);
    } catch (err) {
      store.showToast(err.message || "Failed to advance page", "error");
    }
  });
}
