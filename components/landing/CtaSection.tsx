import React from "react";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/40 to-zinc-950 p-10 sm:p-16 text-center shadow-2xl">
        <h2 className="text-3xl sm:text-5xl font-extrabold text-zinc-100 tracking-tight">
          Stop tracking tasks.
          <br />
          Start leveling up.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm sm:text-base text-zinc-400">
          Join builders mastering deep work with timeline slots, focus daemons, and RPG rewards.
        </p>
        <div className="mt-8 flex justify-center">
          <a
            href="/"
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-4 text-sm font-semibold text-white shadow-xl shadow-emerald-600/30 hover:bg-emerald-500 transition-all"
          >
            <span>Start Focusing Free</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
