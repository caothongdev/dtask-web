import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the SPA's Tailwind v4 migration: every static utility class
 * referenced by index.html or the view modules must exist in the compiled
 * /dist/app.css. The old Play CDN JIT compiled whatever the DOM contained
 * at runtime; compiled v4 only ships what static extraction sees. This test
 * fails if a utility class drifts out of the build (renamed, removed, or
 * used only from a dynamic string the extractor can't see).
 */

const classes = new Set<string>();

function addTokens(fragment: string, out: Set<string>) {
  for (const token of fragment.split(/\s+/)) {
    if (!token) continue;
    if (/[$?{}]/.test(token)) continue; // stray JS debris
    out.add(token);
  }
}

/**
 * Extracts the contents of every `class="..."` attribute, correctly handling
 * `${...}` template expressions (which may themselves contain double quotes).
 * Returns the static text and the expression text separately so quoted
 * branches like ${cond ? "bg-red-500" : ""} are collected from class
 * attributes only — never from unrelated expressions elsewhere in the file.
 */
function extractClassAttrs(src: string) {
  const staticText: string[] = [];
  const exprText: string[] = [];

  for (let i = src.indexOf('class="'); i !== -1; i = src.indexOf('class="', i + 1)) {
    let j = i + 6; // past class=
    let depth = 0; // ${ nesting depth
    let stat = "";
    let expr = "";
    while (j < src.length) {
      const ch = src[j];
      if (depth === 0 && ch === '"') break; // closing quote of the attribute
      if (ch === "$" && src[j + 1] === "{") {
        depth++;
        j += 2;
        continue;
      }
      if (depth > 0 && ch === "}") {
        depth--;
        j++;
        continue;
      }
      (depth === 0 ? stat : expr);
      if (depth === 0) stat += ch;
      else expr += ch;
      j++;
    }
    staticText.push(stat);
    exprText.push(expr);
  }

  return { staticText, exprText };
}

/** Quoted strings inside class-attribute expressions (cond branches, etc.)
 *  — both double- and single-quoted (views mix styles). */
function addExprBranches(expr: string, out: Set<string>) {
  for (const q of expr.matchAll(/"([^"]+)"/g)) addTokens(q[1], out);
  for (const q of expr.matchAll(/'([^']+)'/g)) addTokens(q[1], out);
}

/** True if `cls` is a real class selector in the compiled CSS.
 *  Requires a `.` or `:` boundary before the escaped token and a
 *  non-word/escape char after, so `mt-1` can't match inside `.mt-1\.5`. */
function isCompiled(cls: string, css: string): boolean {
  const needle = cls.replace(/([:./[\]%])/g, "\\$1"); // CSS escapes these
  const tailBlocked = (ch: string | undefined) =>
    ch === undefined ? false : /[\w-]/.test(ch) || ch === "\\";
  for (let i = css.indexOf(needle); i !== -1; i = css.indexOf(needle, i + 1)) {
    const prev = css[i - 1];
    const next = css[i + needle.length];
    if (prev !== "." && prev !== ":") continue;
    if (!tailBlocked(next)) return true;
  }
  return false;
}

const root = join(import.meta.dir, "..");

// ── index.html ──────────────────────────────────────────────────────────
const html = readFileSync(join(root, "public/index.html"), "utf-8");
const htmlAttrs = extractClassAttrs(html);
for (const s of htmlAttrs.staticText) addTokens(s, classes);
for (const e of htmlAttrs.exprText) addExprBranches(e, classes);

// ── SPA modules ─────────────────────────────────────────────────────────
const MODULES = [
  "app.js", "api.js", "store.js", "audio.js", "icons.js",
  "views/books.js", "views/focus.js", "views/level.js", "views/profile.js",
  "views/reader.js", "views/shop.js", "views/tasks.js", "views/telemetry.js",
  "views/timeline.js", "views/wallet.js",
] as const;

for (const name of MODULES) {
  const src = readFileSync(join(root, "public/js", name), "utf-8");
  const { staticText, exprText } = extractClassAttrs(src);
  for (const s of staticText) addTokens(s, classes);
  for (const e of exprText) addExprBranches(e, classes);
  // JS side-assignments: el.className = "..."
  for (const m of src.matchAll(/className\s*=\s*"([^"]+)"/g)) addTokens(m[1], classes);
}

// Not Tailwind utilities and not defined in app.css — JS query-selector
// hooks (toggle state, event binding). Styling for cat-pill comes from the
// sibling utility classes in the same attribute.
const JS_HOOK_CLASSES = new Set(["cat-pill", "filter-status-chip", "filter-cat-chip"]);

// `shadow-card` was already dead under the Play CDN (public.html's config
// defined no boxShadow tokens) — kept in markup for stability, not styled.
const PUBLIC_DEAD_CLASSES = new Set(["shadow-card"]);

test("SPA sources reference a sane number of utility classes", () => {
  expect(classes.size).toBeGreaterThan(60);
});

test("every referenced utility class exists in the compiled SPA CSS", () => {
  const css = readFileSync(join(root, "public/dist/app.css"), "utf-8");
  const skipped: string[] = [];
  const missing: string[] = [];

  for (const cls of classes) {
    if (JS_HOOK_CLASSES.has(cls)) continue;
    // arbitrary values with parens/# use deeper selector escaping — skip those
    if (/[()#,]/.test(cls)) {
      skipped.push(cls);
      continue;
    }
    if (!isCompiled(cls, css)) missing.push(cls);
  }

  expect(skipped.length).toBeLessThan(20);
  expect(missing).toEqual([]);
});

test("public profile page classes exist in the compiled public CSS", () => {
  const html = readFileSync(join(root, "public/public.html"), "utf-8");
  const pub = new Set<string>();

  const { staticText, exprText } = extractClassAttrs(html);
  for (const s of staticText) addTokens(s, pub);
  for (const e of exprText) addExprBranches(e, pub);
  // className assignments in the inline script (statement-level, so both the
  // static prefix and ternary branches are collected)
  for (const m of html.matchAll(/className\s*=\s*([^;]+);/g)) {
    for (const q of m[1].matchAll(/"([^"]+)"/g)) addTokens(q[1], pub);
    for (const q of m[1].matchAll(/'([^']+)'/g)) addTokens(q[1], pub);
  }

  const css = readFileSync(join(root, "public/dist/public.css"), "utf-8");
  const missing: string[] = [];
  for (const cls of pub) {
    if (PUBLIC_DEAD_CLASSES.has(cls)) continue;
    if (/[()#,]/.test(cls)) continue;
    if (!isCompiled(cls, css)) missing.push(cls);
  }

  expect(missing).toEqual([]);
});
