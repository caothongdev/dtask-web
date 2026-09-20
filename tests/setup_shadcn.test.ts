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
