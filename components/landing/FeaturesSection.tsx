import React from "react";
import { Clock, Flame, Coins, BookOpen, BarChart3, ShieldCheck } from "lucide-react";

const FEATURES = [
  {
    icon: Clock,
    title: "24-Hour Visual Timeline",
    description: "Chronological schedule grid with live ► NOW indicator, category quotas, and interactive rescheduling.",
  },
  {
    icon: Flame,
    title: "Focus Daemon & Sprinters",
    description: "Segmented btop ASCII meters, synth audio cues, auto-break relax cooldowns, and full keyboard navigation.",
  },
  {
    icon: Coins,
    title: "RPG Economy & Rewards",
    description: "Earn 🪙 coins for every focused minute. Spend on custom rewards like coffee breaks, anime, or gaming sessions.",
  },
  {
    icon: BookOpen,
    title: "Hybrid Book Reader",
    description: "Dedicated reader overlay with page stepper, reading sprint timers, and automatic progress persistence.",
  },
  {
    icon: BarChart3,
    title: "Telemetry & 7-Day Velocity",
    description: "Level up through ranks from Apprentice to Grandmaster with zero-filled activity histograms and XP buffer gauges.",
  },
  {
    icon: ShieldCheck,
    title: "Local-First SQLite Speed",
    description: "Single-binary Bun server with WAL-mode SQLite storage, instant offline-ready response times, and full REST/SSE APIs.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="bg-white border-y border-zinc-200/80 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
            Engineered for engineers who value ruthless focus
          </h2>
          <p className="mt-4 text-zinc-600 text-sm sm:text-base leading-relaxed">
            No bloated social feeds, no complex Gantt charts. Just pure execution, timeline clarity, and game loop incentives.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className="group rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 border border-blue-200/70 mb-5 group-hover:scale-105 transition-transform">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm text-zinc-600 leading-relaxed">{f.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
