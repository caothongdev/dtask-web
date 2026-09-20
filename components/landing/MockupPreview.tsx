import React from "react";
import { Coins, Sparkles, Clock, Flame, Play } from "lucide-react";

export function MockupPreview() {
  return (
    <section id="preview" className="relative mx-auto max-w-6xl px-6 py-10">
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-2.5 sm:p-4 shadow-[0_16px_50px_-12px_rgba(0,0,0,0.07)]">
        {/* macOS Studio Window Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/70 px-4 py-3 rounded-t-xl">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-400/90" />
            <span className="h-3 w-3 rounded-full bg-amber-400/90" />
            <span className="h-3 w-3 rounded-full bg-blue-500/90" />
            <span className="ml-2 font-mono text-xs text-zinc-400">dtask studio — focus daemon v2.0</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-medium text-blue-700 border border-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              LIVE SSE SYNC
            </span>
          </div>
        </div>

        {/* Studio Window Content: Real 3-Pane Dashboard Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 sm:p-6 bg-zinc-50/40 rounded-b-xl border border-zinc-100">
          {/* Left Pane: 24h Timeline Slot */}
          <div className="lg:col-span-4 rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs font-mono text-zinc-400 mb-3">
              <span className="flex items-center gap-1.5 font-semibold text-zinc-700">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                24H TIMELINE
              </span>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 font-bold">14:00 - 15:30</span>
            </div>
            <div className="rounded-lg border border-blue-200/70 bg-blue-50/40 p-3 mb-3">
              <div className="flex items-center justify-between text-[11px] font-mono text-blue-800 mb-1">
                <span className="font-bold">SLOT #3 ACTIVE</span>
                <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">► NOW</span>
              </div>
              <h4 className="text-sm font-bold text-zinc-900 leading-snug">
                Refactor timeline vector parser & add btop meters
              </h4>
              <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 font-semibold">category: code</span>
                <span>•</span>
                <span className="text-blue-700 font-semibold">+45 XP</span>
              </div>
            </div>
            <div className="space-y-2 text-xs font-mono text-zinc-400">
              <div className="flex items-center justify-between p-2 rounded border border-dashed border-zinc-200 text-zinc-500">
                <span>15:45 - 16:30</span>
                <span>Read "Designing Data-Intensive Apps"</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded border border-dashed border-zinc-200 text-zinc-400">
                <span>17:00 - 18:00</span>
                <span>Sprint review & release deploy</span>
              </div>
            </div>
          </div>

          {/* Middle Pane: Focus Daemon Terminal HUD */}
          <div className="lg:col-span-5 rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-zinc-500 mb-4">
                <span className="flex items-center gap-1.5 font-semibold text-zinc-700">
                  <Flame className="w-3.5 h-3.5 text-blue-600" />
                  FOCUS DAEMON
                </span>
                <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded">SPRINT IN PROGRESS</span>
              </div>
              
              <div className="text-center my-4">
                <div className="font-mono text-5xl sm:text-6xl font-extrabold tracking-tight text-zinc-950">
                  24:45
                </div>
                <div className="mt-2 font-mono text-xs text-zinc-500">
                  SESSION PROGRESS: [██████████░░░░░░] 62%
                </div>
              </div>

              <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-100 text-xs font-mono text-zinc-600 space-y-1">
                <div className="flex justify-between">
                  <span>Accrual Rate:</span>
                  <span className="font-bold text-zinc-900">+0.50 coins / min</span>
                </div>
                <div className="flex justify-between">
                  <span>Synthesizer Cues:</span>
                  <span className="text-blue-700 font-semibold">Web Audio Synth (Enabled)</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>HOTKEYS: [Space] Pause</span>
              <span>[Ctrl+C] Bank & Stop</span>
            </div>
          </div>

          {/* Right Pane: RPG Economy & Workstation context */}
          <div className="lg:col-span-3 rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-zinc-500 mb-3">
                <span className="font-semibold text-zinc-700">RPG ECONOMY</span>
                <span className="text-amber-600 font-bold">LVL 12</span>
              </div>

              <div className="rounded-lg bg-amber-50/70 border border-amber-200/80 p-3 mb-3">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-base">
                  <Coins className="w-5 h-5 text-amber-600" />
                  <span>142.5 COINS</span>
                </div>
                <p className="text-[11px] text-amber-800/80 mt-1 font-mono">
                  +12.5 coins banked this session
                </p>
              </div>

              <div className="space-y-1.5 mb-3">
                <div className="flex justify-between text-[11px] font-mono text-zinc-600">
                  <span>Rank: Practitioner</span>
                  <span className="font-bold">140 / 220 XP</span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full w-[64%]" />
                </div>
              </div>
            </div>

            {/* Subtle Workstation Photography Preview (Unsplash) */}
            <div className="relative rounded-lg overflow-hidden border border-zinc-200 mt-2">
              <img
                src="https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=600&q=80"
                alt="Productivity workspace setup"
                className="h-20 w-full object-cover opacity-80 hover:opacity-100 transition-opacity"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2">
                <span className="text-[10px] font-mono font-medium text-white">Local SQLite Engine • 0ms Lag</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
