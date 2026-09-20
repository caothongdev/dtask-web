import React from "react";
import { Flame, Clock, Coins } from "lucide-react";

export function MockupPreview() {
  return (
    <section id="preview" className="relative mx-auto max-w-6xl px-6 py-12">
      <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-2xl shadow-emerald-950/30 sm:p-4">
        <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900 relative">
          <img
            src="https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1200&q=80"
            alt="Minimalist deep focus workstation"
            className="h-[340px] sm:h-[480px] w-full object-cover opacity-35"
          />

          {/* Floating HUD Preview */}
          <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 rounded-lg border border-zinc-700/60 bg-zinc-950/80 px-4 py-2 backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-400">FOCUS DAEMON ACTIVE</span>
                <span className="font-mono text-xs text-zinc-400">25:00</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-950/80 px-4 py-2 font-mono text-xs text-amber-400 backdrop-blur">
                <Coins className="w-3.5 h-3.5" />
                <span>+12.5 COINS BANKED</span>
              </div>
            </div>

            <div className="max-w-xl rounded-xl border border-zinc-700/60 bg-zinc-950/90 p-6 backdrop-blur shadow-2xl">
              <div className="flex items-center justify-between text-xs text-zinc-400 font-mono mb-2">
                <span>SLOT [14:00 - 15:30]</span>
                <span className="text-emerald-400 font-bold">► NOW</span>
              </div>
              <h3 className="text-lg font-bold text-zinc-100">
                Optimize neural network telemetry pipeline & zero-fill charts
              </h3>
              <p className="mt-1 text-xs text-zinc-400">
                Category: <span className="text-blue-400">code</span> • XP Reward: +45 XP • Auto-Break cooldown enabled.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
