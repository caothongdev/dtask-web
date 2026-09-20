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

// 2. Compile Tailwind CSS (v4 CLI)
console.log("🎨 [build-landing] Compiling Tailwind CSS...");
const cssProc = Bun.spawnSync([
  "bunx",
  "@tailwindcss/cli",
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
