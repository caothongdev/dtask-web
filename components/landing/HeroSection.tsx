import React from "react";
import { Sparkles, ArrowRight, Play, CheckCircle2 } from "lucide-react";
import { HandwritingText } from "@/components/ui/handwriting-text";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-16 pb-16 md:pt-24 md:pb-24">
      {/* Subtle Architectural Dot Pattern Background */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_20%,#000_70%,transparent_100%)] opacity-70" />

      <div className="mx-auto max-w-5xl px-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3.5 py-1 text-xs font-semibold text-emerald-800 mb-8 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>The Minimalist RPG Productivity Engine</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-zinc-950 leading-[1.12]">
          Master your daily workflow
          <br />
          with focus that is{" "}
          <HandwritingText
            words={["live.", "predictive.", "measurable.", "on every phone."]}
            className="text-emerald-700 font-serif italic"
            height="1.15em"
          />
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-zinc-600 leading-relaxed">
          The blueprint-crisp task tracker that turns deep work into an RPG game.
          Schedule 24h timeline slots, bank focus minutes, earn coins, and unlock real-world rewards.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3.5">
          <a
            href="/app"
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-zinc-950 px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/10 hover:bg-zinc-800 transition-all ring-1 ring-zinc-950/10"
          >
            <span>Start Focusing Free</span>
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="#playground"
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-zinc-200/90 bg-white px-7 py-3.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm"
          >
            <Play className="w-4 h-4 fill-zinc-800 text-zinc-800" />
            <span>Try The Animation</span>
          </a>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-xs font-medium text-zinc-500">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>10,000+ Tasks Logged</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>99.4% Deep Work Accuracy</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Zero Cloud Trackers</span>
          </div>
        </div>
      </div>
    </section>
  );
}
