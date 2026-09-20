import React from "react";
import { Check, Coins, Terminal, Globe, Rocket } from "lucide-react";

const HOSTED_FEATURES = [
  "Claim a handle and start in seconds",
  "Full RPG engine — XP, coins & rewards",
  "All 5 views: tasks, timeline, focus, shop, stats",
  "Live SSE sync across your devices",
  "Works in your phone's browser",
  "No credit card, no ads, no trackers",
];

const SELF_HOSTED_FEATURES = [
  "One command: bun server.ts",
  "Local-first SQLite (WAL mode)",
  "Your data never leaves your machine",
  "Full REST & SSE API",
  "CLI companion included",
  "Free forever, open source core",
];

const ROADMAP_ITEMS = [
  "Team workspaces",
  "Cloud sync & encrypted backups",
  "Mobile companion app",
  "Premium themes & reward packs",
];

export function PricingSection() {
  return (
    <section id="pricing" className="bg-white border-y border-zinc-200/80 py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-blue-50 px-3 py-1 text-xs font-mono font-medium text-blue-800 mb-4">
            <Coins className="w-3 h-3 text-blue-700" />
            <span>Pricing</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
            Simple pricing for serious focus
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-600 leading-relaxed">
            Every feature is free — forever. Pick how you want to run it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Hosted — Free */}
          <div className="relative flex flex-col rounded-2xl border-2 border-blue-600 bg-white p-8 shadow-md shadow-blue-600/10">
            <span className="absolute -top-3 left-8 rounded-full bg-blue-600 px-3 py-1 text-[10px] font-mono font-bold tracking-wider text-white">
              MOST POPULAR
            </span>
            <div className="flex items-baseline justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-950">
                <Globe className="h-4 w-4 text-blue-600" />
                Hosted
              </h3>
              <div className="text-right">
                <span className="text-4xl font-extrabold tracking-tight text-zinc-950">$0</span>
                <span className="ml-1 text-xs font-mono text-zinc-500">/ forever</span>
              </div>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              The complete engine, running at dtask.hoangkaothong.com.
            </p>
            <ul className="mt-6 space-y-3 flex-1">
              {HOSTED_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a
              href="/app"
              className="mt-8 flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500 transition-all"
            >
              Start Focusing Free
            </a>
          </div>

          {/* Self-Hosted — Free */}
          <div className="flex flex-col rounded-2xl border border-zinc-200/90 bg-white p-8 shadow-sm hover:border-zinc-300 transition-all">
            <div className="flex items-baseline justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-950">
                <Terminal className="h-4 w-4 text-zinc-700" />
                Self-Hosted
              </h3>
              <div className="text-right">
                <span className="text-4xl font-extrabold tracking-tight text-zinc-950">$0</span>
                <span className="ml-1 text-xs font-mono text-zinc-500">/ forever</span>
              </div>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              For builders who want their data on their own hardware.
            </p>
            <ul className="mt-6 space-y-3 flex-1">
              {SELF_HOSTED_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a
              href="https://github.com/caothongdev/dtask-web"
              target="_blank"
              rel="noreferrer"
              className="mt-8 flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 py-3.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 hover:border-zinc-400 transition-all"
            >
              Clone &amp; Run It
            </a>
          </div>

          {/* Roadmap — Coming Soon */}
          <div className="relative md:col-span-2 flex flex-col sm:flex-row sm:items-center gap-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 p-8">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-[10px] font-mono font-bold tracking-wider text-zinc-500 mb-3">
                <Rocket className="w-3 h-3" />
                <span>COMING SOON</span>
              </div>
              <h3 className="text-lg font-bold text-zinc-950">Pro add-ons for teams</h3>
              <p className="mt-2 text-sm text-zinc-600 leading-relaxed max-w-xl">
                The core stays free, forever. Optional paid add-ons for teams are on the
                roadmap —{" "}
                <a
                  href="https://github.com/caothongdev/dtask-web"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-700 hover:text-blue-600 underline decoration-blue-200 underline-offset-2"
                >
                  watch the repo
                </a>{" "}
                for updates.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:max-w-[300px] sm:justify-end">
              {ROADMAP_ITEMS.map((item) => (
                <span
                  key={item}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-mono text-zinc-600"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs font-mono text-zinc-400">
          Free forever · No credit card · Your data stays yours
        </p>
      </div>
    </section>
  );
}
