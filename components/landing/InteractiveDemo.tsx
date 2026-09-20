import React, { useState } from "react";
import { HandwritingText } from "@/components/ui/handwriting-text";
import { Play, Sparkles } from "lucide-react";

const PRESET_WORDS = ["live.", "predictive.", "measurable.", "disciplined.", "flow state."];

export function InteractiveDemo() {
  const [selectedWord, setSelectedWord] = useState(PRESET_WORDS[0]);
  const [customWord, setCustomWord] = useState("");

  const activeText = customWord.trim() || selectedWord;

  return (
    <section id="playground" className="mx-auto max-w-4xl px-6 py-20">
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-8 sm:p-12 text-center shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-mono font-medium text-emerald-800 mb-4">
          <Play className="w-3 h-3 fill-emerald-800 text-emerald-800" />
          <span>Interactive Component Demo</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight">
          Try The Animation
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-zinc-600 max-w-lg mx-auto">
          Select a preset or type below to trigger SVG vector contour decomposition and watch pen ink flow in real-time.
        </p>

        {/* Tactile Drawing Canvas */}
        <div className="my-8 flex min-h-[160px] items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/60 p-8 shadow-inner bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]">
          <h3 className="text-3xl sm:text-5xl font-extrabold text-zinc-950 tracking-tight">
            Work that is{" "}
            <HandwritingText
              key={activeText}
              text={activeText}
              className="text-emerald-700 font-serif italic"
              height="1.2em"
            />
          </h3>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {PRESET_WORDS.map((w) => (
            <button
              key={w}
              onClick={() => {
                setCustomWord("");
                setSelectedWord(w);
              }}
              className={`rounded-lg px-4 py-2 text-xs font-mono transition-all ${
                activeText === w && !customWord
                  ? "bg-zinc-950 text-white font-bold shadow-sm"
                  : "bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 border border-zinc-200"
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Custom Input */}
        <div className="max-w-xs mx-auto flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 focus-within:border-zinc-400 focus-within:bg-white transition-all">
          <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Type your own phrase..."
            value={customWord}
            onChange={(e) => setCustomWord(e.target.value)}
            className="w-full bg-transparent text-xs font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </div>
      </div>
    </section>
  );
}
