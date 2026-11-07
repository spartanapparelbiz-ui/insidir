/* V3 copy and data rules (docs/INSIDIR-V3.md §1, §7) over every V3 page:
 *   - No AI: nothing a V3 page imports, however indirectly, comes from lib/research or lib/analyst (the model-backed
 *     Research ask and analyst notes). The import graph is walked from each page.
 *   - No prices from outside SEC filings: no V3 page reaches lib/stocks/prices.ts (Stooq, Yahoo) until there is a
 *     licensed price vendor (§1.2); the price chart is Coming soon.
 *   - No signals or price targets in what the pages say.
 *   - Every SEC row links to its filing on sec.gov. */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
/** The V3 pages. Add each new V3 page here. */
export const V3_PAGES = ["app/filings/page.tsx", "app/insiders/page.tsx"];
const NO_AI = ["lib/research/", "lib/analyst/"];
const NO_PRICES = ["lib/stocks/prices.ts"];

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const p of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(p) && statSync(p).isFile()) return p;
  return null;
}

/** Every project file `entry` loads at run time, directly or not. Type-only imports (`import type`, `import("…").T` in a
 *  type position) are left out: TypeScript erases them, so no code from them runs. */
function graph(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue: Array<[string, string[]]> = [[resolve(ROOT, entry), [entry]]];
  while (queue.length) {
    const [file, path] = queue.shift()!;
    if (seen.has(file) || !/\.(tsx?)$/.test(file)) continue;
    seen.set(file, path);
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(/(?:import|export)\s+(?!type\s)[^'"]*?from\s*["']([^"']+)["']|(?<![<|,:]\s*)import\(\s*["']([^"']+)["']\s*\)(?!\s*\.)|^\s*import\s*["']([^"']+)["']/gm)) {
      const next = resolveImport(file, m[1] ?? m[2] ?? m[3]!);
      if (next) queue.push([next, [...path, relative(ROOT, next)]]);
    }
  }
  return seen;
}

describe("V3 pages", () => {
  for (const page of V3_PAGES) {
    const files = graph(page);
    it(`${page}: nothing from lib/research or lib/analyst (no AI)`, () => {
      const bad = [...files].filter(([f]) => NO_AI.some(p => relative(ROOT, f).startsWith(p))).map(([, path]) => path.join(" → "));
      expect(bad).toEqual([]);
    });
    it(`${page}: no prices from outside SEC filings`, () => {
      const bad = [...files].filter(([f]) => NO_PRICES.includes(relative(ROOT, f))).map(([, path]) => path.join(" → "));
      expect(bad).toEqual([]);
    });
  }

  it("the walker finds what a page really imports (so a pass means something)", () => {
    const files = [...graph("app/insiders/page.tsx").keys()].map(f => relative(ROOT, f));
    expect(files).toEqual(expect.arrayContaining(["components/sec/Sec.tsx", "lib/stocks/filings.ts", "lib/stocks/history.ts", "lib/stocks/form4.ts", "lib/features.ts"]));
    // And it would catch an AI import: lib/accuracy/check.ts pulls in lib/profiles, which is where an indirect one would hide.
    expect([...graph("app/methodology/page.tsx").keys()].some(f => relative(ROOT, f).startsWith("lib/analyst/"))).toBe(true);
  });

  it("no buy or sell signals, ratings or price targets in what the pages and their components say", () => {
    const BANNED = /\b(price target|target price|buy signal|sell signal|strong buy|strong sell|should (buy|sell)|buy now|sell now|undervalued|overvalued|outperform|underperform|upside|downside|bullish|bearish|insider info|guaranteed|risk-free)\b/i;
    const bad: string[] = [];
    for (const f of [...V3_PAGES, "components/sec/Sec.tsx"]) {
      const src = readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      const text = [...src.matchAll(/>([^<>{}]+)</g), ...src.matchAll(/["'`]([^"'`]*\s[^"'`]*)["'`]/g)].map(m => m[1]!);
      for (const t of text) if (BANNED.test(t)) bad.push(`${f}: ${t.trim()}`);
    }
    expect(bad).toEqual([]);
  });

  it("every table row links to its filing on sec.gov, and the pages are members-only behind the Coming soon rule", () => {
    const sec = readFileSync(join(ROOT, "components/sec/Sec.tsx"), "utf8");
    expect(sec.match(/<FilingLink /g)?.length).toBe(2);
    expect(sec).toMatch(/target="_blank" rel="noopener noreferrer"/);
    for (const p of V3_PAGES) {
      const src = readFileSync(join(ROOT, p), "utf8");
      expect(src).toMatch(/if \(!isReady\("filings"\)\)/);
      expect(src).toMatch(/if \(!paid\) redirect\("\/go"\)/);
      expect(src.indexOf('isReady("filings")')).toBeLessThan(src.indexOf("searchParams;"));
    }
  });
});
