import React from "react";
import { Star } from "lucide-react";

const TESTIMONIALS = [
  {
    quote: "dtask replaced three different apps for me. The 24-hour timeline and live coin rewards actually keep me locked in for 4-hour deep work stretches.",
    name: "Alex Rivera",
    role: "Senior Systems Architect",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80",
  },
  {
    quote: "The zero-build speed and CLI integration are unmatched. Being able to schedule slots and see XP meters tick in real time is genuinely addicting.",
    name: "Sarah Chen",
    role: "Fullstack Lead",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80",
  },
  {
    quote: "Handwriting inking on the hero pulled me in, but the distraction-free book reader and rewards shop made it my daily driver.",
    name: "Marcus Vance",
    role: "Indie Maker & Author",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80",
  },
];

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="mx-auto max-w-7xl px-6 py-20">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight">
          Built for craftsmen who demand flow state
        </h2>
        <p className="mt-3 text-sm sm:text-base text-zinc-600">
          Trusted by developers, systems designers, and authors who value tactile tools.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TESTIMONIALS.map((t, i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white p-7 shadow-xs hover:shadow-md hover:border-zinc-300 transition-all"
          >
            <div>
              <div className="flex items-center gap-1 text-amber-500 mb-4">
                {[...Array(5)].map((_, idx) => (
                  <Star key={idx} className="w-3.5 h-3.5 fill-current" />
                ))}
              </div>
              <p className="text-sm text-zinc-700 leading-relaxed italic">"{t.quote}"</p>
            </div>
            <div className="mt-6 flex items-center gap-3 pt-4 border-t border-zinc-100">
              <img
                src={t.avatar}
                alt={t.name}
                className="h-10 w-10 rounded-full object-cover border border-zinc-200"
              />
              <div>
                <h4 className="text-xs font-bold text-zinc-900">{t.name}</h4>
                <p className="text-[11px] text-zinc-500">{t.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
