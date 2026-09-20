import { test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the Tailwind v4 migration: every static utility class referenced by
 * the landing components must exist in the compiled stylesheet. Classes with
 * parens/#/commas (arbitrary gradient/mask values) are skipped — they use
 * selector escaping this check doesn't model, and are few.
 */

function addTokens(fragment: string, out: Set<string>) {
  for (const token of fragment.split(/\s+/)) {
    if (!token) continue;
    if (/[$?{}]/.test(token)) continue; // JS-expression debris
    out.add(token);
  }
}

function collectClassTokens(dir: string, out: Set<string>) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".tsx")) continue;
    const src = readFileSync(join(dir, name), "utf-8");

    // className="static list"
    for (const m of src.matchAll(/className="([^"]+)"/g)) addTokens(m[1], out);
    // className={"static list"}
    for (const m of src.matchAll(/className=\{"([^"]+)"\}/g)) addTokens(m[1], out);
    // className={`... ${cond ? "a" : "b"} ...`} — keep static text and every
    // quoted branch string, drop the JS expressions themselves
    for (const m of src.matchAll(/className=\{`([^`]+)`/g)) {
      const tpl = m[1];
      addTokens(tpl.replace(/\$\{[^}]*\}/g, " "), out);
      for (const q of tpl.matchAll(/"([^"]+)"/g)) addTokens(q[1], out);
    }
  }
}

const root = join(import.meta.dir, "..");
const classes = new Set<string>();
collectClassTokens(join(root, "components/landing"), classes);
collectClassTokens(join(root, "components/ui"), classes);
collectClassTokens(join(root, "src/landing"), classes);

test("landing sources reference a sane number of utility classes", () => {
  expect(classes.size).toBeGreaterThan(80);
});

test("every referenced utility class exists in the compiled landing CSS", () => {
  const cssPath = join(root, "public/dist/landing.css");
  const css = readFileSync(cssPath, "utf-8");

  const skipped: string[] = [];
  const missing: string[] = [];

  for (const cls of classes) {
    // arbitrary values with parens/# use deeper selector escaping — skip those
    if (/[()#,]/.test(cls)) {
      skipped.push(cls);
      continue;
    }
    const escaped = cls.replace(/([:./[\]%])/g, "\\$1");
    if (!css.includes(escaped)) missing.push(cls);
  }

  expect(skipped.length).toBeLessThan(10); // only the known gradient/mask values
  expect(missing).toEqual([]);
});
