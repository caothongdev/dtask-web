// public/js/views/reader.js
// Hybrid Book Reader modal with distraction-free reading overlay, steppers, and session timer
// Blueprint Silicon light theme.

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

function fmtTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function openReaderModal(task, onUpdate) {
  if (!task) return;

  let currentPage = Number(task.page) || 0;
  let totalPages = Number(task.pages) || 0;
  let bookText = task.book_text || "";
  let sessionSeconds = 0;
  let isSerif = false;
  let timerInterval = null;

  // Backdrop overlay with soft slate treatment
  const overlay = document.createElement("div");
  overlay.id = "reader-modal-overlay";
  overlay.className = "fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-slate-900/60 backdrop-blur-md";

  // Modal Container
  const modal = document.createElement("div");
  modal.className = "w-full max-w-4xl h-[90vh] flex flex-col bg-surface rounded-3xl border border-outline-variant shadow-2xl overflow-hidden";

  function renderModalContent() {
    const pct = totalPages > 0 ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : 0;
    const isCompleted = currentPage >= totalPages && totalPages > 0;

    modal.innerHTML = `
      <!-- Header -->
      <div class="h-14 px-6 border-b border-outline-variant bg-surface-subtle/70 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-primary font-sans text-sm font-bold tracking-tight truncate">
            📖 ${escapeHtml(task.book_title || task.title)}
          </span>
          <span id="reader-page-chip" class="text-xs font-mono px-2 py-0.5 rounded-md bg-white border border-outline-variant text-stone-soft shrink-0">
            p${currentPage}/${totalPages} (${pct}%)
          </span>
        </div>
        <div class="flex items-center gap-4 shrink-0">
          <span id="reader-timer" class="text-xs font-mono text-primary bg-primary-soft px-2 py-1 rounded-md border border-blue-200">
            [SESSION: ${fmtTime(sessionSeconds)}]
          </span>
          <button id="reader-close-btn" class="text-secondary hover:text-stone-accent font-mono text-sm px-2 py-1 rounded-lg hover:bg-white transition-colors" title="Close (Esc)">
            ✕
          </button>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="px-6 py-2.5 bg-surface border-b border-outline-variant flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs font-mono">
        <!-- Page Stepper & Jumper -->
        <div class="flex items-center gap-2">
          <span class="text-outline text-[11px] uppercase tracking-wider">PAGE:</span>
          <button id="reader-step-prev" class="px-2.5 py-1 rounded-lg bg-white hover:bg-surface-subtle border border-outline-variant text-stone-accent font-bold transition-colors">
            -1
          </button>
          <div class="flex items-center gap-1 bg-surface-subtle px-2 py-0.5 rounded-lg border border-outline-variant">
            <input id="reader-page-input" type="number" min="0" max="${totalPages || 9999}" value="${currentPage}" class="w-14 bg-transparent text-center text-stone-accent focus:outline-none font-bold" />
            <span class="text-outline">/ ${totalPages}</span>
          </div>
          <button id="reader-step-next" class="px-2.5 py-1 rounded-lg bg-white hover:bg-surface-subtle border border-outline-variant text-stone-accent font-bold transition-colors">
            +1
          </button>
          ${isCompleted ? '<span class="text-success font-bold px-2 py-0.5 rounded-md bg-success-soft border border-emerald-200 text-[11px]">[TARGET REACHED]</span>' : ''}
        </div>

        <!-- View Controls & Upload -->
        <div class="flex items-center gap-2">
          <button id="reader-font-toggle" class="px-2.5 py-1 rounded-lg bg-white hover:bg-surface-subtle border border-outline-variant text-secondary hover:text-stone-accent transition-colors">
            FONT: ${isSerif ? "SERIF" : "MONO"}
          </button>
          <label class="px-2.5 py-1 rounded-lg bg-white hover:bg-surface-subtle border border-outline-variant text-secondary hover:text-stone-accent transition-colors cursor-pointer">
            <span>[UPLOAD .TXT/.MD]</span>
            <input id="reader-file-input" type="file" accept=".txt,.md" class="hidden" />
          </label>
        </div>
      </div>

      <!-- Segmented Progress Bar -->
      <div class="w-full bg-surface-subtle h-1.5 border-b border-outline-variant overflow-hidden shrink-0">
        <div class="bg-primary h-full transition-all duration-300" style="width: ${pct}%"></div>
      </div>

      <!-- Reader Body / Text Viewport -->
      <div class="flex-1 p-6 bg-surface overflow-hidden flex flex-col">
        <div class="flex items-center justify-between text-[11px] font-mono text-outline mb-2">
          <span>TEXT VIEWPORT — PASTE OR READ CHAPTER CONTENT:</span>
          <span id="reader-char-count">${bookText ? `${bookText.length} CHARS` : "EMPTY (PASTE OR TYPE BELOW)"}</span>
        </div>
        <textarea id="reader-text" class="flex-1 w-full p-4 bg-surface-container-low rounded-2xl border border-outline-variant text-stone-accent resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary leading-relaxed ${isSerif ? "font-serif text-base" : "font-mono text-xs"}" placeholder="Paste chapter content, reading notes, or reflections here...">${escapeHtml(bookText)}</textarea>
      </div>

      <!-- Footer Actions -->
      <div class="h-16 px-6 border-t border-outline-variant bg-surface-subtle/70 flex items-center justify-between shrink-0 text-xs font-mono">
        <div class="flex items-center gap-3 text-outline">
          <span>XP: <strong class="text-primary">+${task.xp || 10}</strong></span>
          <span>|</span>
          <span>COINS: <strong class="text-coin-amber">🪙 +${task.coins || 10}</strong></span>
        </div>
        <div class="flex items-center gap-3">
          <button id="reader-chapter-read-btn" class="px-3 py-2 rounded-xl border border-outline-variant hover:border-primary text-secondary hover:text-primary transition-colors font-semibold">
            [Mark Chapter Read]
          </button>
          <button id="reader-save-btn" class="px-4 py-2 bg-primary text-white font-bold hover:bg-primary-strong transition-colors rounded-xl shadow-md shadow-blue-500/20">
            [Save & Close]
          </button>
        </div>
      </div>
    `;

    bindEvents();
  }

  function updatePageChips() {
    const pageChip = modal.querySelector("#reader-page-chip");
    const pageInput = modal.querySelector("#reader-page-input");
    const progressBar = modal.querySelector(".bg-primary.h-full");
    const pct = totalPages > 0 ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : 0;
    if (pageChip) pageChip.textContent = `p${currentPage}/${totalPages} (${pct}%)`;
    if (pageInput) pageInput.value = currentPage;
    if (progressBar) progressBar.style.width = `${pct}%`;
  }

  async function checkAutoCompletion() {
    if (totalPages > 0 && currentPage >= totalPages) {
      if (task.status !== "done") {
        try {
          await api.markDone(task.id);
          sound.playComplete();
          task.status = "done";
          task.progress = 100;
          store.showToast(`Book finished: "${task.book_title || task.title}"! (+${task.xp || 10} XP, +${task.coins || 10} 🪙)`, "success");
          await store.refreshUserAndStats();
        } catch (err) {
          console.error("Auto markDone error:", err);
        }
      }
    }
  }

  async function saveProgress(close = true) {
    const textEl = modal.querySelector("#reader-text");
    if (textEl) bookText = textEl.value;

    try {
      await api.updateBook(task.id, currentPage, totalPages, bookText);
      task.page = currentPage;
      task.book_text = bookText;
      await checkAutoCompletion();
      if (onUpdate) onUpdate(task);
      await store.refreshTasks();
      store.showToast(`Reading progress saved (p${currentPage}/${totalPages})`, "info");
    } catch (err) {
      store.showToast(err.message || "Failed to save reading progress", "error");
    }

    if (close) {
      cleanup();
    }
  }

  function cleanup() {
    if (timerInterval) clearInterval(timerInterval);
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      saveProgress(true);
    }
  }

  function bindEvents() {
    // Stepper -1
    modal.querySelector("#reader-step-prev")?.addEventListener("click", () => {
      if (currentPage > 0) {
        currentPage--;
        sound.playCoinTick();
        updatePageChips();
      }
    });

    // Stepper +1
    modal.querySelector("#reader-step-next")?.addEventListener("click", async () => {
      currentPage++;
      sound.playCoinTick();
      updatePageChips();
      await checkAutoCompletion();
    });

    // Page Jumper Input
    const pageInput = modal.querySelector("#reader-page-input");
    pageInput?.addEventListener("change", async (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 0) {
        currentPage = val;
        updatePageChips();
        await checkAutoCompletion();
      }
    });

    // Font toggle
    modal.querySelector("#reader-font-toggle")?.addEventListener("click", () => {
      isSerif = !isSerif;
      const textEl = modal.querySelector("#reader-text");
      const fontBtn = modal.querySelector("#reader-font-toggle");
      if (textEl) {
        if (isSerif) {
          textEl.className = "flex-1 w-full p-4 bg-surface-container-low rounded-2xl border border-outline-variant text-stone-accent resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 leading-relaxed font-serif text-base";
        } else {
          textEl.className = "flex-1 w-full p-4 bg-surface-container-low rounded-2xl border border-outline-variant text-stone-accent resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 leading-relaxed font-mono text-xs";
        }
      }
      if (fontBtn) fontBtn.textContent = `FONT: ${isSerif ? "SERIF" : "MONO"}`;
    });

    // File upload
    const fileInput = modal.querySelector("#reader-file-input");
    fileInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const content = evt.target.result;
          const textEl = modal.querySelector("#reader-text");
          const countEl = modal.querySelector("#reader-char-count");
          if (textEl && typeof content === "string") {
            textEl.value = content;
            bookText = content;
            if (countEl) countEl.textContent = `${content.length} CHARS`;
            store.showToast(`Loaded ${file.name}`, "info");
          }
        };
        reader.readAsText(file);
      }
    });

    // Text input sync
    modal.querySelector("#reader-text")?.addEventListener("input", (e) => {
      bookText = e.target.value;
      const countEl = modal.querySelector("#reader-char-count");
      if (countEl) countEl.textContent = `${bookText.length} CHARS`;
    });

    // Mark Chapter Read (advance by 1 or 5 pages and auto-save)
    modal.querySelector("#reader-chapter-read-btn")?.addEventListener("click", async () => {
      const step = totalPages > 10 ? 5 : 1;
      currentPage = Math.min(totalPages || 9999, currentPage + step);
      sound.playCoinTick();
      updatePageChips();
      await checkAutoCompletion();
      await saveProgress(false);
    });

    // Save & Close
    modal.querySelector("#reader-save-btn")?.addEventListener("click", () => {
      saveProgress(true);
    });

    // Close button
    modal.querySelector("#reader-close-btn")?.addEventListener("click", () => {
      saveProgress(true);
    });
  }

  // Reading session timer ticker
  timerInterval = setInterval(() => {
    sessionSeconds++;
    const timerEl = modal.querySelector("#reader-timer");
    if (timerEl) {
      timerEl.textContent = `[SESSION: ${fmtTime(sessionSeconds)}]`;
    }
  }, 1000);

  document.addEventListener("keydown", onKeyDown);

  // Initial render & attach
  renderModalContent();
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
