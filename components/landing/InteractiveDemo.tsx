import React, { useState } from "react";
import { HandwritingText } from "@/components/ui/handwriting-text";
import { Play } from "lucide-react";

const PRESET_WORDS = ["live.", "predictive.", "measurable.", "disciplined.", "unstoppable."];

export function InteractiveDemo() {
  const [selectedWord, setSelectedWord] = useState(PRESET_WORDS[0]);

  return (
    <section id="playground" className="mx-auto max-w-4xl px-6 py-16">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center shadow-xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-mono text-emerald-400 mb-4">
          <Play className="w-3 h-3 fill-current" />
          <span>Interactive Component Demo</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-zinc-100">
          Try The Animation
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-zinc-400">
          Select a preset to trigger SVG vector extraction and watch the pen stroke and ink in.
        </p>

        <div className="my-10 flex min-h-[140px] items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-6">
          <h3 className="text-3xl sm:text-5xl font-bold text-zinc-100">
            Work that is{" "}
            <HandwritingText
              key={selectedWord}
              text={selectedWord}
              className="text-emerald-400 font-serif italic"
              height="1.2em"
            />
          </h3>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {PRESET_WORDS.map((w) => (
            <button
              key={w}
              onClick={() => setSelectedWord(w)}
              className={`rounded-lg px-4 py-2 text-xs font-mono transition-all ${
                selectedWord === w
                  ? "bg-emerald-600 text-white font-bold"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
