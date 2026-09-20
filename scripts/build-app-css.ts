/**
 * Compiles the SPA Tailwind v4 stylesheets:
 *   public/css/app.css    -> public/dist/app.css     (/app dashboard)
 *   public/css/public.css -> public/dist/public.css  (/u/:username profile)
 * Run: bun scripts/build-app-css.ts   (also via `bun run build:app`)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(import.meta.dir, "../public/dist");
mkdirSync(outDir, { recursive: true });

const targets = [
  { input: "app.css", label: "SPA dashboard" },
  { input: "public.css", label: "public profile" },
];

for (const { input, label } of targets) {
  console.log(`🎨 [build-app-css] Compiling ${label} Tailwind v4 stylesheet...`);
  const proc = Bun.spawnSync([
    "bunx",
    "@tailwindcss/cli",
    "-i",
    join(import.meta.dir, "../public/css", input),
    "-o",
    join(outDir, input),
    "--minify",
  ]);

  if (proc.exitCode !== 0) {
    console.error(`${input} compilation failed:`, proc.stderr.toString());
    process.exit(1);
  }
  console.log(`✅ [build-app-css] Wrote public/dist/${input}`);
}
