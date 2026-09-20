import React from "react";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200/90 bg-white py-12">
      <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-6 px-6 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <span>🪙</span>
          <span className="font-bold text-zinc-900">dtask-web</span>
          <span>— Gamified Daily Task & Focus Engine</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="font-medium text-zinc-700">All Systems Operational</span>
          </div>
          <a href="/app" className="hover:text-zinc-900 transition-colors font-medium">Launch App</a>
          <a href="/public.html" className="hover:text-zinc-900 transition-colors">Public Board</a>
          <a href="https://github.com/caothongdev/dtask-web" target="_blank" rel="noreferrer" className="hover:text-zinc-900 transition-colors">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
