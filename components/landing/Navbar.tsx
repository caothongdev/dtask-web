import React from "react";
import { ArrowRight } from "lucide-react";

function Github({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        <a href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-900">
          <span className="text-xl">🪙</span>
          <span className="font-extrabold text-zinc-900 tracking-tight">dtask</span>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-mono font-semibold text-blue-700 border border-blue-200/70">v2.0</span>
        </a>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600">
          <a href="#features" className="hover:text-zinc-950 transition-colors">Features</a>
          <a href="#preview" className="hover:text-zinc-950 transition-colors">Engine</a>
          <a href="#pricing" className="hover:text-zinc-950 transition-colors">Pricing</a>
          <a href="#testimonials" className="hover:text-zinc-950 transition-colors">Craft</a>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/caothongdev/dtask-web"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-2 rounded-lg border border-zinc-200/90 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors shadow-sm"
          >
            <Github className="w-3.5 h-3.5 text-zinc-700" />
            <span>GitHub</span>
          </a>
          <a
            href="/app"
            className="flex items-center gap-1.5 rounded-lg bg-zinc-950 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 transition-all ring-1 ring-zinc-900/10"
          >
            <span>Launch App</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
