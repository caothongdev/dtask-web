// dtask-web — Global Application Controller & Hotkey Router
// Manages global keyboard shortcuts (1-5, A, ?, Esc), modal management, and SPA navigation.

export const VIEW_HOTKEYS = {
  "1": "tasks",
  "2": "timeline",
  "3": "focus",
  "4": "shop",
  "5": "stats",
};

export const HOTKEY_DESCRIPTIONS = [
  { key: "1", label: "Dashboard / Tasks", description: "Switch to task directives view" },
  { key: "2", label: "Daily Timeline", description: "Switch to 24h schedule view" },
  { key: "3", label: "Focus Engine", description: "Switch to live focus & relax timer" },
  { key: "4", label: "Rewards Shop", description: "Switch to rewards shop & purchases" },
  { key: "5", label: "Telemetry & Stats", description: "Switch to RPG telemetry & quotas" },
  { key: "A", label: "Quick Add Directive", description: "Focus directive input on Dashboard" },
  { key: "?", label: "Keyboard Shortcuts", description: "Toggle this shortcuts cheat sheet" },
  { key: "Esc", label: "Dismiss / Unfocus", description: "Close any open dialog or blur inputs" },
  { key: "Space", label: "Timer Play / Pause", description: "Toggle countdown in Focus Engine" },
  { key: "Shift+Tab", label: "Switch Mode", description: "Toggle Focus / Relax timer modes" },
  { key: "Ctrl+C", label: "Bank Minutes", description: "Stop timer and bank elapsed focus minutes" },
];

/**
 * Global keydown event dispatcher.
 * Handles hotkeys 1-5, 'A', '?', and 'Escape' while respecting active input fields and modals.
 */
export function handleGlobalKeydown(e, options = {}) {
  const target = e.target;
  const tag = target?.tagName;
  const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;

  // Escape closes any open modal or blurs current input
  if (e.key === "Escape") {
    if (typeof document !== "undefined") {
      const openDialog = document.querySelector("dialog[open]");
      if (openDialog) {
        openDialog.close();
        return true;
      }
    }
    if (isInput) {
      target.blur?.();
      return true;
    }
    return false;
  }

  // If typing inside an input/textarea/select, do not trigger global shortcuts
  if (isInput) return false;

  const anyDialogOpen = typeof document !== "undefined" ? !!document.querySelector("dialog[open]") : false;

  // '?' toggles the keyboard shortcuts modal even if already open
  if (e.key === "?") {
    e.preventDefault?.();
    if (typeof document !== "undefined") {
      const shortcutsDialog = document.getElementById("shortcuts-dialog");
      if (shortcutsDialog) {
        if (shortcutsDialog.open) {
          shortcutsDialog.close();
        } else {
          shortcutsDialog.showModal();
        }
        return true;
      }
    }
    return true;
  }

  // If a modal is open, ignore other navigation hotkeys
  if (anyDialogOpen) return false;

  // View switching: keys 1 through 5
  if (VIEW_HOTKEYS[e.key]) {
    e.preventDefault?.();
    const targetView = VIEW_HOTKEYS[e.key];
    if (options.onNavigate) {
      options.onNavigate(targetView);
    } else if (typeof location !== "undefined") {
      location.hash = targetView;
    }
    return true;
  }

  // 'A' or 'a': Focus Quick Add input
  if (e.key === "a" || e.key === "A") {
    e.preventDefault?.();
    const activeView = typeof location !== "undefined" ? (location.hash.replace("#", "") || "tasks") : "tasks";
    if (activeView !== "tasks") {
      if (typeof location !== "undefined") location.hash = "tasks";
      setTimeout(() => {
        if (typeof document !== "undefined") {
          const titleInput = document.getElementById("quick-add-title");
          titleInput?.focus();
        }
      }, 60);
    } else {
      if (typeof document !== "undefined") {
        const titleInput = document.getElementById("quick-add-title");
        if (titleInput) {
          titleInput.focus();
        }
      }
    }
    return true;
  }

  return false;
}

/**
 * Initializes global hotkeys listener on the window.
 */
export function initGlobalHotkeys(options = {}) {
  if (typeof window === "undefined") return () => {};
  const listener = (e) => handleGlobalKeydown(e, options);
  window.addEventListener("keydown", listener);
  return () => window.removeEventListener("keydown", listener);
}