import React from "react";
import { Sparkles, ArrowRight, Play, CheckCircle2 } from "lucide-react";
import { HandwritingText } from "@/components/ui/handwriting-text";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
      {/* Background Radial Glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-600/10 blur-[120px]" />

      <div className="mx-auto max-w-5xl px-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-400 mb-8">
          <Sparkles className="w-3.5 h-3.5" />
          <span>The Minimalist RPG Productivity Engine</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-zinc-100 leading-tight">
          Master your daily workflow
          <br />
          with focus that is{" "}
          <HandwritingText
            words={["live.", "predictive.", "measurable.", "on every phone."]}
            className="text-emerald-400 font-serif italic"
            height="1.15em"
          />
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-zinc-400 leading-relaxed">
          The blueprint-crisp task tracker that turns deep work into an RPG game.
          Schedule 24h timeline slots, bank focus minutes, earn coins, and unlock real-world rewards.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/"
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-emerald-600 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-emerald-600/25 hover:bg-emerald-500 transition-all"
          >
            <span>Start Focusing Free</span>
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="#playground"
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-7 py-3.5 text-sm font-semibold text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Try The Animation</span>
          </a>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-xs font-medium text-zinc-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>10,000+ Tasks Logged</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>99.4% Deep Work Accuracy</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Zero Cloud Trackers</span>
          </div>
        </div>
      </div>
    </section>
  );
}
