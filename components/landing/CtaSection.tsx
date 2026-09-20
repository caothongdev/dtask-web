import React from "react";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-900 bg-zinc-950 p-10 sm:p-16 text-center shadow-2xl">
        {/* Subtle Ambient Radial Glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -z-0 h-72 w-96 -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="relative z-10">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Stop tracking tasks.
            <br />
            Start leveling up.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm sm:text-base text-zinc-400 leading-relaxed">
            Join builders mastering deep work with 24-hour visual timeline slots, focus daemons, and RPG coin rewards.
          </p>
          <div className="mt-8 flex justify-center">
            <a
              href="/app"
              className="flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-sm font-bold text-zinc-950 shadow-lg hover:bg-zinc-100 transition-all hover:scale-[1.02]"
            >
              <span>Start Focusing Free</span>
              <ArrowRight className="w-4 h-4 text-zinc-950" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
