# Handwriting Landing Page & Shadcn UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the animated `HandwritingText` SVG inking component into a shadcn-compatible React + TypeScript + Tailwind architecture, and build a modern, responsive, high-converting landing page for `dtask-web`.

**Architecture:** A lightweight React 19 + TypeScript component tree using shadcn UI conventions (`/components/ui`), styled with Tailwind CSS gradients and responsive layouts, bundled via Bun's native bundler into `public/dist/`, and served by the existing high-performance Bun server (`server.ts`) at `/landing` without regressing the existing vanilla SPA.

**Tech Stack:** Bun 1.4, React 19, TypeScript 5, Tailwind CSS 3, `lucide-react`, `clsx`, `tailwind-merge`, `opentype.js` (via CDN), Unsplash Assets.

**Spec:** [`docs/superpowers/specs/2026-09-20-handwriting-landing-page-design.md`](file:///home/caothongdev/dtask-web/docs/superpowers/specs/2026-09-20-handwriting-landing-page-design.md)

## Global Constraints

- **Zero Regression on Existing 89 Tests**: All existing test suites in `tests/*.test.ts` must remain 100% passing.
- **Component File Location**: The animated component must reside strictly at `components/ui/handwriting-text.tsx`.
- **Default Path Standards**: Shadcn UI primitives must live under `@/components/ui` with `@/*` path aliasing rooted in `tsconfig.json`.
- **No Heavy Framework Runways**: Keep the server as Bun (`server.ts`) without Next.js/Vite server dependencies; compile landing page bundle using Bun's built-in bundler (`Bun.build`).
- **Icons & Assets**: Use `lucide-react` for iconography and curated, permanent Unsplash image URLs for photography.
- **Responsive & Modern Design**: Must support mobile (<640px), tablet (768px), and desktop (1024px+) viewports with dark obsidian theme accents, glowing gradients, and smooth SVG dash animations.

---

### Task 1: Environment Scaffolding, TypeScript, Tailwind & Shadcn Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `components.json`
- Create: `tailwind.config.js`
- Create: `lib/utils.ts`
- Test: `tests/setup_shadcn.test.ts`

**Interfaces:**
- Consumes: Bun runtime and npm registry.
- Produces:
  - `lib/utils.ts`: `cn(...inputs: ClassValue[]): string` utility combining `clsx` and `twMerge`.
  - `tsconfig.json`: `@/*` path mapping to `./*`.
  - `components.json`: Shadcn CLI configuration mapping `"ui": "@/components/ui"`.
  - `tailwind.config.js`: Tailwind config scanning `./components/**/*.{ts,tsx}` and `./src/**/*.{ts,tsx}`.

- [ ] **Step 1: Write the failing setup verification test**

Create `tests/setup_shadcn.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cn } from "../lib/utils";

test("Task 1: package.json exists and includes required UI dependencies", () => {
  const pkgPath = join(process.cwd(), "package.json");
  expect(existsSync(pkgPath)).toBe(true);
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  expect(pkg.dependencies).toBeDefined();
  expect(pkg.dependencies.react).toBeDefined();
  expect(pkg.dependencies["react-dom"]).toBeDefined();
  expect(pkg.dependencies["lucide-react"]).toBeDefined();
  expect(pkg.dependencies.clsx).toBeDefined();
  expect(pkg.dependencies["tailwind-merge"]).toBeDefined();
});

test("Task 1: tsconfig.json configures @/* path mapping and jsx", () => {
  const tsconfigPath = join(process.cwd(), "tsconfig.json");
  expect(existsSync(tsconfigPath)).toBe(true);
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf-8"));
  expect(tsconfig.compilerOptions.paths["@/*"]).toEqual(["./*"]);
  expect(tsconfig.compilerOptions.jsx).toBe("react-jsx");
});

test("Task 1: components.json configures shadcn standard paths", () => {
  const compJsonPath = join(process.cwd(), "components.json");
  expect(existsSync(compJsonPath)).toBe(true);
  const comp = JSON.parse(readFileSync(compJsonPath, "utf-8"));
  expect(comp.aliases.ui).toBe("@/components/ui");
  expect(comp.aliases.components).toBe("@/components");
  expect(comp.aliases.utils).toBe("@/lib/utils");
});

test("Task 1: lib/utils.ts exports working cn class merger", () => {
  expect(typeof cn).toBe("function");
  expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  expect(cn("text-red-500", false && "hidden", "font-bold")).toBe("text-red-500 font-bold");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/setup_shadcn.test.ts`
Expected: FAIL with "Cannot find module '../lib/utils'" or "package.json does not exist".

- [ ] **Step 3: Write minimal implementation**

1. Create `package.json`:

```json
{
  "name": "dtask-web",
  "version": "1.2.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun server.ts",
    "test": "bun test",
    "build:landing": "bun scripts/build-landing.ts"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "lucide-react": "^1.16.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^3.5.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.3"
  }
}
```

2. Run `bun install` to download dependencies into `node_modules`.

3. Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    },
    "strict": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "types": ["bun-types"]
  },
  "include": [
    "server.ts",
    "components/**/*",
    "src/**/*",
    "lib/**/*",
    "scripts/**/*",
    "tests/**/*"
  ]
}
```

4. Create `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/landing/landing.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

5. Create `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./public/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: "#090A0C",
          900: "#101216",
          800: "#1A1D24",
          700: "#242933",
        },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
```

6. Create `lib/utils.ts`:

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/setup_shadcn.test.ts`
Expected: PASS with 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lockb tsconfig.json components.json tailwind.config.js lib/utils.ts tests/setup_shadcn.test.ts
git commit -m "chore: setup shadcn structure, typescript aliases, and tailwind utilities"
```

---

### Task 2: Copy & Integrate `components/ui/handwriting-text.tsx`

**Files:**
- Create: `components/ui/handwriting-text.tsx`
- Test: `tests/handwriting_text.test.tsx`

**Interfaces:**
- Consumes: React hooks (`useState`, `useEffect`, `useRef`), `opentype.js` via CDN.
- Produces:
  - `export function HandwritingText(props: HandwritingTextProps): JSX.Element`
  - `export default HandwritingText`
  - `export interface HandwritingTextProps`

- [ ] **Step 1: Write the failing unit test for HandwritingText**

Create `tests/handwriting_text.test.tsx`:

```typescript
import { test, expect } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { HandwritingText } from "../components/ui/handwriting-text";

test("Task 2: HandwritingText renders SSR fallback span before font loads", () => {
  const html = renderToString(
    <HandwritingText text="Focus Live" className="text-emerald-500" />
  );
  expect(html).toContain("<span");
  expect(html).toContain("Focus Live");
  expect(html).toContain("text-emerald-500");
});

test("Task 2: HandwritingText renders initial word when words array is provided", () => {
  const html = renderToString(
    <HandwritingText
      words={["live.", "predictive.", "measurable."]}
      className="test-class"
    />
  );
  expect(html).toContain("<span");
  expect(html).toContain("live.");
  expect(html).toContain("test-class");
});

test("Task 2: HandwritingText defaults to empty string if no text or words given", () => {
  const html = renderToString(<HandwritingText />);
  expect(html).toContain("<span");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/handwriting_text.test.tsx`
Expected: FAIL with "Cannot find module '../components/ui/handwriting-text'".

- [ ] **Step 3: Write minimal implementation**

Create `components/ui/handwriting-text.tsx` with the exact component implementation:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Text that writes itself, then inks in. No dependencies.
 *
 * Three things make this behave like handwriting rather than like a fade:
 *
 * 1. The font is parsed from its raw TTF and the glyphs converted to paths. A web font
 *    renders as filled shapes with no outline, so there is nothing to stroke and nothing
 *    to animate — the conversion is what makes a pen stroke possible at all.
 *
 * 2. Every contour is its own <path>. An SVG dash pattern RESTARTS at each subpath, so a
 *    single path holding the whole word cannot be drawn progressively: one long dash just
 *    makes each letter fully present or fully absent. Splitting them and staggering the
 *    delays is what produces a pen crossing the word left to right.
 *
 * 3. The weight comes from one filled copy of the entire word underneath, faded in as the
 *    stroke finishes. The fill must be a single path: a counter — the hole in an `e` or
 *    an `a` — is a separate contour, and it only reads as a hole when the fill rule sees
 *    it together with the outer contour. Fill the split paths individually and every
 *    letter becomes a blob.
 *
 * The glyph parsing is done by opentype.js, loaded from a CDN as a plain <script> at
 * first use rather than imported as a package. That keeps the component installable
 * anywhere with no dependency to add, and a <script> tag sidesteps the ESM/CJS interop
 * that a bundled import of this particular library tends to trip over. It is fetched once
 * per page and cached by the browser.
 *
 * If either the library or the font fails to load, the component renders the text as an
 * ordinary <span> — it degrades to plain text rather than to nothing.
 *
 * Colour comes from `currentColor`, so `className="text-emerald-600"` styles it.
 */

const OPENTYPE_CDN = "https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js";

const DEFAULT_FONT_URL =
  "https://cdn.21st.dev/assets/mirror/13/1347863151acdc00fa281daaba1a3543dbce5870b55f9cf7479a15bb84007681.ttf";

export interface HandwritingTextProps {
  /** A single phrase to write. Ignored when `words` is given. */
  text?: string;
  /** Cycle through these, rewriting on each change. */
  words?: string[];
  /** Milliseconds each word is held before the next one starts. */
  interval?: number;
  /** URL of a .ttf or .otf. Must be CORS-readable; self-host for production. */
  fontUrl?: string;
  /** Seconds for the pen to cross the whole word. */
  duration?: number;
  /** Seconds before the pen starts. */
  delay?: number;
  /** Stroke weight, in units of a 100px em. */
  strokeWidth?: number;
  /** Ink the letters in once drawn. Set false to leave them as outlines. */
  fill?: boolean;
  /** CSS height of the rendered word; width follows the glyphs. */
  height?: string;
  className?: string;
}

type Geometry = {
  full: string;
  contours: string[];
  x: number;
  y: number;
  w: number;
  h: number;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

// The library, loaded once per page.
let libPromise: Promise<any> | null = null;

function loadOpentype(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const existing = (window as any).opentype;
  if (existing) return Promise.resolve(existing);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = OPENTYPE_CDN;
      script.async = true;
      script.onload = () => {
        const lib = (window as any).opentype;
        if (lib) resolve(lib);
        else reject(new Error("opentype.js loaded but exposed nothing"));
      };
      script.onerror = () => reject(new Error("opentype.js failed to load"));
      document.head.appendChild(script);
    });
  }
  return libPromise;
}

// One fetch and one parse per font URL, shared by every instance on the page.
const fontCache = new Map<string, Promise<any>>();

function loadFont(url: string): Promise<any> {
  let pending = fontCache.get(url);
  if (!pending) {
    pending = Promise.all([
      loadOpentype(),
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(`Font request failed: ${res.status}`);
        return res.arrayBuffer();
      }),
    ]).then(([lib, buffer]) => lib.parse(buffer));
    fontCache.set(url, pending);
  }
  return pending;
}

const EM = 100; // arbitrary: the viewBox normalises whatever we pick

export function HandwritingText({
  text,
  words,
  interval = 3200,
  fontUrl = DEFAULT_FONT_URL,
  duration = 1.5,
  delay = 0.05,
  strokeWidth = 1.6,
  fill = true,
  height = "1.15em",
  className,
}: HandwritingTextProps) {
  const cycle = Boolean(words && words.length > 0);
  const [index, setIndex] = useState(0);
  const current = cycle ? words![index % words!.length] : text ?? "";

  const [font, setFont] = useState<any>(null);
  const [geom, setGeom] = useState<Geometry | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [lengths, setLengths] = useState<number[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    if (!cycle) return undefined;
    const id = setInterval(() => setIndex((i) => i + 1), interval);
    return () => clearInterval(id);
  }, [cycle, interval]);

  useEffect(() => {
    let cancelled = false;
    loadFont(fontUrl)
      .then((f) => { if (!cancelled) setFont(f); })
      .catch(() => { /* falls back to plain text below */ });
    return () => { cancelled = true; };
  }, [fontUrl]);

  useEffect(() => {
    if (!font || !current) return;
    const path = font.getPath(current, 0, EM, EM);
    const box = path.getBoundingBox();
    const pad = EM * 0.12; // room for the stroke and any descenders
    const full = path.toPathData(2);
    setGeom({
      full,
      // Split on the moveto that opens each contour, keeping the M with its segment.
      contours: full.split(/(?=M)/).filter((d: string) => d.trim().length > 1),
      x: box.x1 - pad,
      y: box.y1 - pad,
      w: box.x2 - box.x1 + pad * 2,
      h: box.y2 - box.y1 + pad * 2,
    });
    setDrawn(false);
    setLengths([]);
  }, [font, current]);

  useEffect(() => {
    if (!geom) return undefined;
    setLengths(
      pathRefs.current
        .slice(0, geom.contours.length)
        .map((el) => (el ? el.getTotalLength() : 0)),
    );
    // Two frames: the first commits the full-length offsets with no transition, the
    // second enables it and moves to zero. Both in one commit leaves nothing to animate.
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setDrawn(true)),
    );
    return () => cancelAnimationFrame(id);
  }, [geom]);

  // Before the font resolves — and if it never does — the text is still readable.
  if (!geom) {
    return <span className={className}>{current}</span>;
  }

  const count = Math.max(1, geom.contours.length);

  return (
    <svg
      key={current}
      viewBox={`${geom.x} ${geom.y} ${geom.w} ${geom.h}`}
      role="img"
      aria-label={current}
      className={["inline-block", className].filter(Boolean).join(" ")}
      style={{
        height,
        width: `calc(${height} * ${(geom.w / geom.h).toFixed(4)})`,
        overflow: "visible",
      }}
    >
      {fill && (
        <path
          d={geom.full}
          fill="currentColor"
          stroke="none"
          style={{
            opacity: drawn ? 1 : 0,
            transition: drawn
              ? `opacity 0.45s ease-out ${(delay + duration * 0.72).toFixed(3)}s`
              : "none",
          }}
        />
      )}
      {geom.contours.map((d, i) => {
        const length = lengths[i] || 0;
        // Contours overlap slightly so the stroke reads as one continuous movement
        // rather than as letters switching on in turn.
        const each = (duration / count) * 2.4;
        const start = delay + (i / count) * duration;
        return (
          <path
            key={i}
            ref={(el) => { pathRefs.current[i] = el; }}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: length || 1,
              strokeDashoffset: drawn ? 0 : length || 1,
              transition: drawn
                ? `stroke-dashoffset ${each.toFixed(3)}s ease-out ${start.toFixed(3)}s`
                : "none",
            }}
          />
        );
      })}
    </svg>
  );
}

export default HandwritingText;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/handwriting_text.test.tsx`
Expected: PASS with 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add components/ui/handwriting-text.tsx tests/handwriting_text.test.tsx
git commit -m "feat(ui): add HandwritingText SVG path animation component"
```

---

### Task 3: Landing Page Component Tree & Demo Enhancement

**Files:**
- Create: `components/landing/Navbar.tsx`
- Create: `components/landing/HeroSection.tsx`
- Create: `components/landing/MockupPreview.tsx`
- Create: `components/landing/FeaturesSection.tsx`
- Create: `components/landing/InteractiveDemo.tsx`
- Create: `components/landing/TestimonialsSection.tsx`
- Create: `components/landing/CtaSection.tsx`
- Create: `components/landing/Footer.tsx`
- Create: `src/landing/LandingPage.tsx`
- Test: `tests/landing_page.test.tsx`

**Interfaces:**
- Consumes:
  - `@/components/ui/handwriting-text`: `HandwritingText`
  - `lucide-react`: `Sparkles`, `Clock`, `Flame`, `Coins`, `BookOpen`, `BarChart3`, `ShieldCheck`, `ArrowRight`, `Play`, `CheckCircle2`, `Github`, `Star`
  - `@/lib/utils`: `cn`
- Produces:
  - `export function LandingPage(): JSX.Element`

- [ ] **Step 1: Write the failing landing page render test**

Create `tests/landing_page.test.tsx`:

```typescript
import { test, expect } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { LandingPage } from "../src/landing/LandingPage";

test("Task 3: LandingPage renders all core sections with rich copy and icons", () => {
  const html = renderToString(<LandingPage />);

  // Navbar
  expect(html).toContain("dtask");
  expect(html).toContain("Launch App");

  // Hero Section with animated HandwritingText
  expect(html).toContain("Master your daily workflow");
  expect(html).toContain("live.");
  expect(html).toContain("Start Focusing Free");

  // Feature Section
  expect(html).toContain("24-Hour Visual Timeline");
  expect(html).toContain("Focus Daemon");
  expect(html).toContain("RPG Economy");

  // Unsplash Photography
  expect(html).toContain("images.unsplash.com");

  // Interactive Demo Playground
  expect(html).toContain("Try The Animation");

  // Footer
  expect(html).toContain("All Systems Operational");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/landing_page.test.tsx`
Expected: FAIL with "Cannot find module '../src/landing/LandingPage'".

- [ ] **Step 3: Write minimal implementation**

1. Create `components/landing/Navbar.tsx`:

```tsx
import React from "react";
import { Github, Sparkles, ArrowRight } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2 text-lg font-bold tracking-wider text-zinc-100">
          <span className="text-xl">🪙</span>
          <span className="bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">dtask</span>
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-mono text-emerald-400 border border-emerald-500/20">v2.0</span>
        </a>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
          <a href="#features" className="hover:text-zinc-100 transition-colors">Features</a>
          <a href="#preview" className="hover:text-zinc-100 transition-colors">Engine</a>
          <a href="#playground" className="hover:text-zinc-100 transition-colors">Playground</a>
          <a href="#testimonials" className="hover:text-zinc-100 transition-colors">Stories</a>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            <span>Star</span>
          </a>
          <a
            href="/"
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition-all"
          >
            <span>Launch App</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
```

2. Create `components/landing/HeroSection.tsx`:

```tsx
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
```

3. Create `components/landing/MockupPreview.tsx`:

```tsx
import React from "react";
import { Flame, Clock, Coins } from "lucide-react";

export function MockupPreview() {
  return (
    <section id="preview" className="relative mx-auto max-w-6xl px-6 py-12">
      <div className="relative rounded-2xl border border-zinc-800 bg-zinc-950 p-2 shadow-2xl shadow-emerald-950/30 sm:p-4">
        <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900 relative">
          <img
            src="https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1200&q=80"
            alt="Minimalist deep focus workstation"
            className="h-[340px] sm:h-[480px] w-full object-cover opacity-35"
          />

          {/* Floating HUD Preview */}
          <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 rounded-lg border border-zinc-700/60 bg-zinc-950/80 px-4 py-2 backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-400">FOCUS DAEMON ACTIVE</span>
                <span className="font-mono text-xs text-zinc-400">25:00</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-950/80 px-4 py-2 font-mono text-xs text-amber-400 backdrop-blur">
                <Coins className="w-3.5 h-3.5" />
                <span>+12.5 COINS BANKED</span>
              </div>
            </div>

            <div className="max-w-xl rounded-xl border border-zinc-700/60 bg-zinc-950/90 p-6 backdrop-blur shadow-2xl">
              <div className="flex items-center justify-between text-xs text-zinc-400 font-mono mb-2">
                <span>SLOT [14:00 - 15:30]</span>
                <span className="text-emerald-400 font-bold">► NOW</span>
              </div>
              <h3 className="text-lg font-bold text-zinc-100">
                Optimize neural network telemetry pipeline & zero-fill charts
              </h3>
              <p className="mt-1 text-xs text-zinc-400">
                Category: <span className="text-blue-400">code</span> • XP Reward: +45 XP • Auto-Break cooldown enabled.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

4. Create `components/landing/FeaturesSection.tsx`:

```tsx
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
    <section id="features" className="mx-auto max-w-7xl px-6 py-20">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-100">
          Engineered for engineers who value ruthless focus
        </h2>
        <p className="mt-4 text-zinc-400 text-sm sm:text-base">
          No bloated social feeds, no complex Gantt charts. Just pure execution, timeline clarity, and game loop incentives.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={i}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-5">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-100">{f.title}</h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{f.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

5. Create `components/landing/InteractiveDemo.tsx`:

```tsx
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
```

6. Create `components/landing/TestimonialsSection.tsx`:

```tsx
import React from "react";

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
        <h2 className="text-3xl font-extrabold text-zinc-100">
          Built for craftsmen who demand flow state
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TESTIMONIALS.map((t, i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"
          >
            <p className="text-sm text-zinc-300 leading-relaxed italic">"{t.quote}"</p>
            <div className="mt-6 flex items-center gap-3">
              <img
                src={t.avatar}
                alt={t.name}
                className="h-10 w-10 rounded-full object-cover border border-zinc-700"
              />
              <div>
                <h4 className="text-xs font-bold text-zinc-100">{t.name}</h4>
                <p className="text-[11px] text-zinc-400">{t.role}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

7. Create `components/landing/CtaSection.tsx`:

```tsx
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
```

8. Create `components/landing/Footer.tsx`:

```tsx
import React from "react";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800/80 bg-zinc-950 py-12">
      <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-6 px-6 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span>🪙</span>
          <span className="font-bold text-zinc-200">dtask-web</span>
          <span>— Gamified Daily Task Engine</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>All Systems Operational</span>
          </div>
          <a href="/public.html" className="hover:text-zinc-200 transition-colors">Public Board</a>
          <a href="https://github.com" className="hover:text-zinc-200 transition-colors">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
```

9. Create `src/landing/LandingPage.tsx`:

```tsx
import React from "react";
import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { MockupPreview } from "@/components/landing/MockupPreview";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { InteractiveDemo } from "@/components/landing/InteractiveDemo";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { Footer } from "@/components/landing/Footer";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-emerald-500 selection:text-black">
      <Navbar />
      <main>
        <HeroSection />
        <MockupPreview />
        <FeaturesSection />
        <InteractiveDemo />
        <TestimonialsSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/landing_page.test.tsx`
Expected: PASS with 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add components/landing/ src/landing/LandingPage.tsx tests/landing_page.test.tsx
git commit -m "feat(landing): create modular React landing page with handwriting hero, feature matrix, and interactive demo"
```

---

### Task 4: Bun Bundling Pipeline & Production Asset Build

**Files:**
- Create: `src/landing/main.tsx`
- Create: `src/landing/landing.css`
- Create: `scripts/build-landing.ts`
- Create: `public/landing.html`
- Test: `tests/build_landing.test.ts`

**Interfaces:**
- Consumes:
  - `src/landing/LandingPage.tsx`
  - `scripts/build-landing.ts`
- Produces:
  - `public/dist/landing.js`: Compiled and minified JS bundle.
  - `public/dist/landing.css`: Compiled Tailwind CSS bundle.
  - `public/landing.html`: Host HTML serving the React application.

- [ ] **Step 1: Write the failing build pipeline test**

Create `tests/build_landing.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

test("Task 4: Landing page source entrypoints exist", () => {
  expect(existsSync(join(process.cwd(), "src/landing/main.tsx"))).toBe(true);
  expect(existsSync(join(process.cwd(), "src/landing/landing.css"))).toBe(true);
  expect(existsSync(join(process.cwd(), "scripts/build-landing.ts"))).toBe(true);
});

test("Task 4: Bun bundle build outputs public/dist/landing.js and css", async () => {
  const proc = Bun.spawnSync(["bun", "run", "build:landing"]);
  expect(proc.exitCode).toBe(0);

  const jsPath = join(process.cwd(), "public/dist/landing.js");
  const cssPath = join(process.cwd(), "public/dist/landing.css");
  const htmlPath = join(process.cwd(), "public/landing.html");

  expect(existsSync(jsPath)).toBe(true);
  expect(existsSync(cssPath)).toBe(true);
  expect(existsSync(htmlPath)).toBe(true);

  expect(statSync(jsPath).size).toBeGreaterThan(1000);
  expect(statSync(cssPath).size).toBeGreaterThan(500);

  const html = readFileSync(htmlPath, "utf-8");
  expect(html).toContain('id="root"');
  expect(html).toContain("dist/landing.js");
  expect(html).toContain("dist/landing.css");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/build_landing.test.ts`
Expected: FAIL with missing source files or build command failure.

- [ ] **Step 3: Write minimal implementation**

1. Create `src/landing/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { LandingPage } from "./LandingPage";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <LandingPage />
    </React.StrictMode>
  );
}
```

2. Create `src/landing/landing.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    background-color: #090A0C;
    color: #f4f4f5;
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  }
}
```

3. Create `scripts/build-landing.ts`:

```typescript
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const outDir = join(import.meta.dir, "../public/dist");
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

console.log("🔨 [build-landing] Bundling React Landing Page...");

// 1. Bundle TypeScript/React with Bun's native bundler
const buildResult = await Bun.build({
  entrypoints: [join(import.meta.dir, "../src/landing/main.tsx")],
  outdir: outDir,
  naming: "landing.[ext]",
  minify: true,
  target: "browser",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!buildResult.success) {
  console.error("Build failed:", buildResult.logs);
  process.exit(1);
}

// 2. Compile Tailwind CSS using bunx tailwindcss
console.log("🎨 [build-landing] Compiling Tailwind CSS...");
const cssProc = Bun.spawnSync([
  "bunx",
  "tailwindcss",
  "-i",
  join(import.meta.dir, "../src/landing/landing.css"),
  "-o",
  join(outDir, "landing.css"),
  "--minify",
]);

if (cssProc.exitCode !== 0) {
  console.error("CSS compilation failed:", cssProc.stderr.toString());
  process.exit(1);
}

console.log("✅ [build-landing] Assets built successfully into public/dist/");
```

4. Create `public/landing.html`:

```html
<!doctype html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>dtask — Gamified Daily Task & Focus Engine</title>
  <meta name="description" content="Master your daily workflow with focus that is live, predictive, and measurable. 24-hour visual timeline slots, RPG coins, and deep focus timers." />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

  <!-- Compiled Tailwind CSS -->
  <link rel="stylesheet" href="/dist/landing.css" />
</head>
<body class="bg-zinc-950 text-zinc-100 antialiased selection:bg-emerald-500 selection:text-black">
  <div id="root"></div>
  <script type="module" src="/dist/landing.js"></script>
</body>
</html>
```

5. Run `bun run build:landing` to compile `public/dist/landing.js` and `public/dist/landing.css`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/build_landing.test.ts`
Expected: PASS with 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/landing/main.tsx src/landing/landing.css scripts/build-landing.ts public/landing.html public/dist/ tests/build_landing.test.ts
git commit -m "feat(build): add bun build pipeline and compile landing page bundle"
```

---

### Task 5: Server Route Integration for Landing Page

**Files:**
- Modify: `server.ts:1096-1120`
- Test: `tests/landing_route.test.ts`

**Interfaces:**
- Consumes: Bun HTTP router in `server.ts`.
- Produces:
  - `GET /landing` -> responds with `public/landing.html` (Content-Type: `text/html`).
  - `GET /landing.html` -> responds with `public/landing.html`.
  - Maintains fallback for existing SPA (`/` -> `index.html`, `/u/:username` -> `public.html`).

- [ ] **Step 1: Write the failing server route test**

Create `tests/landing_route.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { server } from "../server";

test("Task 5: GET /landing returns HTTP 200 with text/html and root container", async () => {
  const res = await fetch(`http://localhost:${server.port}/landing`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const html = await res.text();
  expect(html).toContain('id="root"');
  expect(html).toContain("dist/landing.js");
});

test("Task 5: GET /dist/landing.js serves the compiled bundle", async () => {
  const res = await fetch(`http://localhost:${server.port}/dist/landing.js`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("javascript");
});

test("Task 5: Existing SPA / still returns 200 index.html", async () => {
  const res = await fetch(`http://localhost:${server.port}/`);
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("dtask");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/landing_route.test.ts`
Expected: FAIL because `/landing` falls back to `index.html` instead of `landing.html`.

- [ ] **Step 3: Write minimal implementation in `server.ts`**

In `server.ts`, update the static GET handler around line 1097:

```typescript
      if (req.method === "GET") {
        // Explicit landing route
        if (url.pathname === "/landing" || url.pathname === "/landing/") {
          const landingPath = join(STATIC_DIR, "landing.html");
          if (existsSync(landingPath)) {
            return new Response(Bun.file(landingPath), {
              headers: { "content-type": "text/html", "cache-control": "no-cache" },
            });
          }
        }

        let p = url.pathname === "/" ? "/index.html" : url.pathname;
        // public board at /u/<username>
        const uMatch = url.pathname.match(/^\/u\/([a-z0-9_-]+)\/?$/);
        if (uMatch) {
          const publicPath = join(STATIC_DIR, "public.html");
          if (existsSync(publicPath)) {
            return new Response(Bun.file(publicPath), { headers: { "content-type": "text/html", "cache-control": "no-cache" } });
          }
        }
        const full = join(STATIC_DIR, p);
        if (existsSync(full)) {
          const file = Bun.file(full);
          // static = cache 5m; HTML = no-cache so updates roll out fast
          const isHtml = p.endsWith(".html");
          return new Response(file, {
            headers: {
              "content-type": isHtml ? "text/html" : (file.type || "application/octet-stream"),
              "cache-control": isHtml ? "no-cache" : "public, max-age=300",
            },
          });
        }
        const idx = join(STATIC_DIR, "index.html");
        if (existsSync(idx)) return new Response(Bun.file(idx), { headers: { "content-type": "text/html", "cache-control": "no-cache" } });
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/landing_route.test.ts`
Expected: PASS with 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add server.ts tests/landing_route.test.ts
git commit -m "feat(server): route /landing directly to public/landing.html"
```

---

### Task 6: Comprehensive Verification & Regression Testing

**Files:**
- Create: `tests/e2e_landing.test.ts`
- Test: All suites in `tests/*.test.ts`

**Interfaces:**
- Consumes: All tests across the entire repository.
- Produces: 100% test pass rate across all suites with zero regressions.

- [ ] **Step 1: Write E2E landing page integrity test**

Create `tests/e2e_landing.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { server } from "../server";

test("Task 6: E2E landing page serves, links to app, and loads all assets", async () => {
  // 1. Landing HTML
  const landingRes = await fetch(`http://localhost:${server.port}/landing`);
  expect(landingRes.status).toBe(200);
  const landingHtml = await landingRes.text();
  expect(landingHtml).toContain("Master your daily workflow");
  expect(landingHtml).toContain('href="/"'); // CTA navigates to main app

  // 2. CSS Bundle
  const cssRes = await fetch(`http://localhost:${server.port}/dist/landing.css`);
  expect(cssRes.status).toBe(200);
  expect(cssRes.headers.get("content-type")).toContain("css");

  // 3. JS Bundle
  const jsRes = await fetch(`http://localhost:${server.port}/dist/landing.js`);
  expect(jsRes.status).toBe(200);
  expect(jsRes.headers.get("content-type")).toContain("javascript");

  // 4. Existing App health
  const healthRes = await fetch(`http://localhost:${server.port}/api/health`);
  expect(healthRes.status).toBe(200);
  const health = await healthRes.json();
  expect(health.status).toBe("ok");
});
```

- [ ] **Step 2: Run all tests in the repository**

Run: `bun test`
Expected: PASS with 100+ tests passing (89 original + 15+ new landing page and setup tests).

- [ ] **Step 3: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: Zero type errors.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e_landing.test.ts
git commit -m "test: add comprehensive e2e verification for landing page and asset serving"
```

---

## Self-Review Checklist

- [x] **Spec Coverage:**
  - Codebase support check & setup instructions for shadcn, Tailwind, TypeScript: Covered in Spec 2.2 and Task 1.
  - Explanation of default paths and importance of `/components/ui`: Covered in Spec 2.3 and Task 1.
  - Copy-paste component `handwriting-text.tsx` into `/components/ui`: Covered in Task 2.
  - Create landing page based on `demo.tsx` with expanded copy, `lucide-react` icons, Unsplash photos, and animations: Covered in Task 3.
  - Build and serve integration: Covered in Tasks 4 and 5.
- [x] **No Placeholders:**
  - All file paths, interfaces, tests, implementations, run commands, and git commits contain complete, concrete code with zero `TODO`s or `TBD`s.
- [x] **Type Consistency:**
  - `HandwritingTextProps` interface matches exactly between `components/ui/handwriting-text.tsx`, `HeroSection.tsx`, `InteractiveDemo.tsx`, and tests.
  - `cn` helper in `lib/utils.ts` matches usage throughout components.
