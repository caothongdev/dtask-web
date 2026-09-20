# Design Specification: Handwriting Landing Page & Shadcn UI Integration

**Date:** 2026-09-20  
**Status:** Approved  
**Target Repository:** `/home/caothongdev/dtask-web`  
**Reference Component:** `HandwritingText` (`handwriting-text.tsx` with `opentype.js` SVG path parsing)

---

## 1. Executive Summary & Intent

This specification defines the architecture, project structure, component hierarchy, visual design system, and build pipeline required to integrate shadcn UI and build a high-performance, modern, and responsive landing page for `dtask-web`.

The landing page showcases the animated SVG inking component `HandwritingText` (cycling words dynamically: `"live."`, `"predictive."`, `"measurable."`, `"on every device."`) while highlighting `dtask-web`'s core value proposition: a minimalist, RPG-gamified task engine featuring 24-hour visual timeline slots, focus timers, an RPG coin economy, and distraction-free deep work.

---

## 2. Codebase Infrastructure & Setup Instructions

### 2.1 Current Architecture vs. Required Target
- **Current State:** Single Bun process (`server.ts`) serving an obsidian-themed vanilla JavaScript SPA (`public/`) and SQLite database (`bun:sqlite`), with Tailwind CSS loaded via CDN. No `package.json`, no `tsconfig.json`, no React runtime, and no shadcn UI structure.
- **Target State:** Maintain 100% backward compatibility with existing vanilla SPA views (`#tasks`, `#timeline`, `#focus`, `#shop`, `#stats`) and existing 89 tests, while introducing:
  1. A standard `package.json` with React 19, Lucide React, and Tailwind utilities.
  2. A standard `tsconfig.json` with `@/*` path mapping.
  3. A standard shadcn project configuration (`components.json`).
  4. The standard shadcn UI directory at `/components/ui`.
  5. A Bun-native build script (`scripts/build-landing.ts`) compiling the React landing page to `public/dist/landing.js` and `public/dist/landing.css`.
  6. Direct route handling in `server.ts` for `/landing` serving `public/landing.html`.

### 2.2 Setup Instructions (CLI & Tooling)
To set up a fresh environment or replicate this integration on any system:

```bash
# 1. Initialize package.json
bun init -y

# 2. Install React and UI primitives
bun add react react-dom lucide-react clsx tailwind-merge

# 3. Install devDependencies for TypeScript, React types, and Tailwind compiler
bun add -d typescript @types/react @types/react-dom @types/bun tailwindcss postcss autoprefixer

# 4. Generate shadcn-compliant components.json configuration
cat << 'EOF' > components.json
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
EOF
```

### 2.3 Component & Style Paths and the Importance of `/components/ui`
- **Default Path for Components:** `@/components` (maps to `./components` via `tsconfig.json`).
- **Default Path for UI Primitives:** `@/components/ui` (maps to `./components/ui`).
- **Default Path for Styles:** `./src/landing/landing.css` and `./public/style.css`.
- **Default Path for Utilities:** `@/lib/utils` (maps to `./lib/utils.ts` exporting `cn(...)`).

#### Why `/components/ui` is Important:
1. **Shadcn CLI Contract**: The official shadcn CLI (`bunx shadcn@latest add <component>`) targets `@/components/ui` by default. Adhering to this standard allows automated addition and upgrades of components without path collisions or manual refactoring.
2. **Separation of Concerns (Atoms vs. Composites)**:
   - `/components/ui` holds pure, domain-agnostic UI primitives (e.g. `button.tsx`, `dialog.tsx`, `handwriting-text.tsx`). They have no dependencies on business state, API calls, or domain models.
   - `/components/landing` or `/components/views` hold domain-specific features, layouts, and composite widgets.
3. **Consistent Path Aliasing**: Any part of the application can import design primitives via `@/components/ui/<name>` without fragile relative paths like `../../components/ui/button`.
4. **Clean Code Ownership**: In shadcn, components are copied directly into the project repository rather than installed into `node_modules`. Segregating them in `/components/ui` makes it clear which files are reusable atomic building blocks and which are bespoke application code.

---

## 3. Component Specification: `HandwritingText`

- **Location:** `components/ui/handwriting-text.tsx`
- **Props Interface:**
  ```typescript
  export interface HandwritingTextProps {
    text?: string;
    words?: string[];
    interval?: number;
    fontUrl?: string;
    duration?: number;
    delay?: number;
    strokeWidth?: number;
    fill?: boolean;
    height?: string;
    className?: string;
  }
  ```
- **Mechanism:**
  - Loads `opentype.js` on demand via CDN script injection (`https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js`).
  - Fetches the raw TTF font (`DEFAULT_FONT_URL`) as an `ArrayBuffer` and parses glyph paths.
  - Decomposes glyph outlines into individual SVG path contours (splitting on `M`).
  - Calculates contour path lengths via `getTotalLength()` and animates `stroke-dashoffset` sequentially from left to right.
  - Fills in the full glyph path underneath as the stroke finishes.
  - Gracefully falls back to plain `<span>{current}</span>` if font parsing fails or before font loads (SSR-safe).

---

## 4. Landing Page Design & Sections

### 4.1 Visual Theme & Color System
- **Background:** Deep Obsidian (`#090A0C`, `#0e1014`) with subtle emerald and indigo radial gradients.
- **Accents:** Emerald (`#10b981`, `#34d399`) for handwriting pen strokes and success highlights; Silicon Blue (`#2563eb`, `#3b82f6`) for primary interactive buttons; Amber (`#f59e0b`) for RPG coin icons.
- **Surfaces:** Translucent cards with backdrop blur (`backdrop-blur-md bg-zinc-900/60 border border-zinc-800/80 shadow-2xl`).
- **Typography:** Modern grotesque sans-serif (`Plus Jakarta Sans` / `Inter`) paired with `JetBrains Mono` for telemetry badges and metrics.

### 4.2 Section Hierarchy
1. **Sticky Navigation Bar (`components/landing/Navbar.tsx`)**:
   - Brand logo with coin icon: `🪙 dtask`.
   - Links: *Features*, *Engine*, *Economy*, *Playground*, *Docs*.
   - Action buttons: GitHub Star counter badge and `"Launch App"` button navigating to `/`.
2. **Hero Section (`components/landing/HeroSection.tsx`)**:
   - Eyebrow pill: `✨ Introducing dtask v2.0 • RPG Gamified Productivity Engine`.
   - Dynamic Animated Headline:
     ```tsx
     <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-zinc-100 max-w-4xl mx-auto leading-tight">
       Master your daily workflow with focus that is{" "}
       <HandwritingText
         words={["live.", "predictive.", "measurable.", "on every device."]}
         className="text-emerald-400 font-serif italic"
         height="1.15em"
       />
     </h1>
     ```
   - Subtitle: "The blueprint-crisp task tracker that turns deep work into an RPG game. Schedule 24h timeline slots, bank focus minutes, earn coins, and unlock real-world rewards."
   - Dual CTAs: Primary `"Start Focusing Free"` and Secondary `"Explore Interactive Demo"`.
   - Key Metric Badges: `"10,000+ Tasks Logged"`, `"99.4% Deep Work Accuracy"`, `"Level 50 Grandmasters"`.
3. **Mockup Showcase (`components/landing/MockupPreview.tsx`)**:
   - High-fidelity terminal HUD preview container.
   - Workstation hero imagery from Unsplash: `https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1200&q=80`.
   - Floating interactive overlays showing real-time XP accrual, active slot indicator (`► NOW`), and coin counter.
4. **Core Capabilities Grid (`components/landing/FeaturesSection.tsx`)**:
   - 6 feature cards with `lucide-react` icons:
     - `Clock`: **24-Hour Visual Timeline** (interactive schedule grid, category quotas, auto-rollover).
     - `Flame`: **Focus Daemon & Pomodoro Sprint** (segmented btop ASCII meters, Web Audio synth cues, auto-break cooldowns).
     - `Coins`: **RPG Economy & Rewards Shop** (earn coins for every minute focused, spend on custom rewards).
     - `BookOpen`: **Hybrid Book Reader** (page stepper, reading session timers, distraction-free reader).
     - `BarChart3`: **Telemetry & 7-Day Velocity** (progression curve $100 + (L-1) \times 20$, XP buffer gauges).
     - `ShieldCheck`: **Local-First & Multi-User** (zero telemetry, SQLite WAL speed, CLI API tokens).
5. **Interactive Handwriting Playground (`components/landing/InteractiveDemo.tsx`)**:
   - Allows prospective users to type any word or click presets to see `HandwritingText` parse glyphs and stroke the letters live in real-time.
6. **Social Proof & Testimonials (`components/landing/TestimonialsSection.tsx`)**:
   - Testimonial cards featuring authentic developer reviews and Unsplash avatars:
     - Alex Rivera: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80`
     - Sarah Chen: `https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80`
     - Marcus Vance: `https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80`
7. **Call-To-Action (CTA) Banner (`components/landing/CtaSection.tsx`)**:
   - Full-width obsidian banner with gradient glow.
   - Headline: *"Stop tracking tasks. Start leveling up."*
   - Launch button linking to application.
8. **Footer (`components/landing/Footer.tsx`)**:
   - Navigation links, system status pill (`🟢 All Systems Operational`), GitHub repo link, and license.

---

## 5. Build, Bundling & Deployment Strategy

1. **Bun Native Bundling**:
   `bun build src/landing/main.tsx --outfile public/dist/landing.js --minify`
2. **Tailwind CSS Compilation**:
   `bunx tailwindcss -i src/landing/landing.css -o public/dist/landing.css --minify`
3. **HTML Host Page**:
   `public/landing.html` references `/dist/landing.css` and `/dist/landing.js`.
4. **Server Integration (`server.ts`)**:
   `GET /landing` routes directly to `public/landing.html`, maintaining compatibility with `STATIC_DIR` static asset serving.

---

## 6. Verification & Quality Gates

- **Unit Tests**:
  - `tests/setup_shadcn.test.ts`: Validates `package.json`, `tsconfig.json`, `components.json`, and `lib/utils.ts`.
  - `tests/handwriting_text.test.tsx`: Validates `HandwritingText` rendering, props handling, and fallback behavior.
  - `tests/landing_page.test.tsx`: Validates React component tree, sections, icons, and image links.
  - `tests/build_landing.test.ts`: Validates bundle outputs in `public/dist/`.
  - `tests/landing_route.test.ts`: Validates HTTP 200 response and HTML delivery from `server.ts`.
- **Regression Safety**: All existing 89 tests in `dtask-web` must remain 100% passing.
