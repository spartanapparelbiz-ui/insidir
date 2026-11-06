/* Filings stays research software (docs/RESEARCH-DESK.md §2): no advice or hype words in any Filings source, the
 * disclaimer text exactly as written and under every view, calculators that start empty, sorts that are never a
 * score, and no inline colours. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvCalculator } from "@/components/filings/EvCalculator";
import { ResearchFoot } from "@/components/filings/Bits";
import { RESEARCH_DISCLAIMER, researchBanned } from "@/lib/copy";
import { isIdentifier } from "./copy-text";

const ROOT = join(__dirname, "..");
const DIRS = ["components/filings", "lib/filings", "app/filings", "app/api/filings", "app/api/cron/filings"];
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) ? [p] : []; });
const FILES = DIRS.flatMap(d => walk(join(ROOT, d)));
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const texts = (src: string) => [...stripComments(src).matchAll(/"([^"\n]{3,})"|'([^'\n]{3,})'|`([^`]{3,})`|>([^<>{}\n]{3,})</g)].map(m => m.slice(1).find(Boolean) ?? "").filter(t => !isIdentifier(t)).join("\n");

describe("Filings compliance", () => {
  it("scans every Filings source", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });
  it("no advice, hype or prediction words in any copy (and the check catches them)", () => {
    for (const t of ["A buy signal.", "Insider alpha.", "Price target $50.", "Strong buy.", "High conviction.", "Bullish setup.", "You should buy.", "Smart money is in."]) expect(researchBanned(t), t).not.toEqual([]);
    const bad = FILES.flatMap(p => researchBanned(texts(readFileSync(p, "utf8"))).map(b => `${p.replace(ROOT, "")}: ${b}`));
    expect(bad).toEqual([]);
  });
  it("the disclaimer is word for word, and every view renders it", () => {
    expect(RESEARCH_DISCLAIMER).toBe("Insidir is research software made by Aethric LLC. It is not a broker, dealer, or registered investment adviser. All figures are sourced from public SEC records. Not investment advice.");
    expect(renderToStaticMarkup(createElement(ResearchFoot))).toContain(RESEARCH_DISCLAIMER);
    const app = readFileSync(join(ROOT, "components/filings/FilingsApp.tsx"), "utf8");
    // Loading, error, first-visit notice and the desk itself: four returns, four footers.
    expect(app.match(/<ResearchFoot \/>/g)?.length).toBe(4);
    for (const page of ["app/filings/page.tsx", "app/filings/[ticker]/page.tsx"]) {
      const src = readFileSync(join(ROOT, page), "utf8");
      expect(src).toContain("<FilingsApp");
      expect(src).toContain("<Frame member"); // the site's own header and logo stay on top
    }
  });
  it("the calculator starts empty: no default value, no suggested probability", () => {
    const html = renderToStaticMarkup(createElement(EvCalculator));
    const inputs = [...html.matchAll(/<input[^>]*>/g)].map(m => m[0]);
    expect(inputs).toHaveLength(4);
    for (const i of inputs) expect(i).toMatch(/value=""/);
    expect(html).toContain("Fill in all four fields");
    expect(html).toContain("Insidir does not estimate it");
  });
  it("the Stream sorts only by time, dollars or ticker", () => {
    const src = readFileSync(join(ROOT, "components/filings/StreamView.tsx"), "utf8");
    expect([...src.matchAll(/<option value="(\w+)"/g)].map(m => m[1])).toEqual(["detected", "value", "ticker"]);
    expect(texts(src)).not.toMatch(/\bscore\b/i);
  });
  it("no inline styles; colours are brand tokens (app/brand.css), not literals", () => {
    for (const p of FILES.filter(f => f.endsWith(".tsx"))) expect(readFileSync(p, "utf8"), p).not.toMatch(/style=\{\{/);
    const css = readFileSync(join(ROOT, "components/filings/filings.css"), "utf8");
    expect(css).not.toMatch(/font-weight:\s*(700|800|900|bold)/);
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    const brand = readFileSync(join(ROOT, "app/brand.css"), "utf8");
    expect(brand).toContain("--obsidian: #0a0a0a; --obsidian-2: #121212; --obsidian-line: #262626; --emerald-muted: #4fa883;");
    for (const v of ["var(--obsidian)", "var(--obsidian-2)", "var(--obsidian-line)", "var(--emerald-muted)"]) expect(css).toContain(v);
  });
});
