import React, { useState } from "react";
import { ChevronDown, MessageCircleQuestion } from "lucide-react";

const FAQS = [
  {
    question: "Where is my data stored?",
    answer:
      "On the hosted instance, your tasks, focus minutes, and coins live in a SQLite database on the dtask server — with no third-party trackers and no analytics leaving the stack. Self-host it and the entire database is a single file on your own machine.",
  },
  {
    question: "Do I need an account to start?",
    answer:
      "No sign-up, no email, no credit card. Clone the repo, run one command, and the app is live at localhost. Your first focus session can start sixty seconds from now.",
  },
  {
    question: "How do coins and rewards work?",
    answer:
      "Every focused minute accrues coins at your configured rate. Bank the session and spend coins on rewards you define yourself — a coffee break, an anime episode, a gaming session. The game loop is yours to tune.",
  },
  {
    question: "Can I use dtask on my phone?",
    answer:
      "Yes. The interface is a responsive web app, so the timeline, focus daemon, and rewards shop all work from your phone's browser — on the same network as your instance.",
  },
  {
    question: "Is the free plan actually free?",
    answer:
      "Yes — dtask is free, full stop. There is no paid tier: claim a handle on the hosted instance, or clone the repo and run one command on your own hardware. Both give you the complete RPG engine with every feature enabled.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-white mx-auto max-w-3xl px-6 py-24">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-blue-50 px-3 py-1 text-xs font-mono font-medium text-blue-800 mb-4">
          <MessageCircleQuestion className="w-3 h-3 text-blue-700" />
          <span>FAQ</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
          Questions, answered.
        </h2>
        <p className="mt-4 text-sm sm:text-base text-zinc-600 leading-relaxed">
          Everything you need to know before your first deep work session.
        </p>
      </div>

      <div className="space-y-3">
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className={`rounded-2xl border bg-white transition-all ${
                isOpen
                  ? "border-blue-300 shadow-xs"
                  : "border-zinc-200/90 hover:border-zinc-300"
              }`}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
              >
                <span id={`faq-question-${i}`} className="text-sm font-bold text-zinc-950">{faq.question}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${
                    isOpen ? "rotate-180 text-blue-600" : ""
                  }`}
                />
              </button>
              {isOpen && (
                <p
                  id={`faq-panel-${i}`}
                  role="region"
                  aria-labelledby={`faq-question-${i}`}
                  className="px-6 pb-5 text-sm text-zinc-600 leading-relaxed"
                >
                  {faq.answer}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
