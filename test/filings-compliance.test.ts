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
const DIRS = ["components/filings", "lib/filings", "app/filings", "app/api/filings", "app/api/cron/filings", "app/edgar", "app/api/edgar"];
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
    expect(RESEARCH_DISCLAIMER).toBe("Insidir is independent research software. Not a registered investment adviser or broker. Data sourced directly from public SEC EDGAR filings.");
    expect(renderToStaticMarkup(createElement(ResearchFoot))).toContain(RESEARCH_DISCLAIMER);
    const term = readFileSync(join(ROOT, "components/filings/Terminal.tsx"), "utf8");
    // One status bar, rendered on every view and state (outside every conditional), carrying the disclaimer.
    expect(term.match(/<ResearchFoot \/>/g)?.length).toBe(1);
    expect(term).toMatch(/<footer className="fl-status">\s*<ResearchFoot \/>/);
    // The site's own logo, untouched, in the terminal header; the site footer below the terminal.
    expect(term).toMatch(/import \{ Logo \} from "@\/components\/brand\/Bits"/);
    expect(term).toContain("<Logo />");
    const page = readFileSync(join(ROOT, "components/filings/TerminalPage.tsx"), "utf8");
    expect(page).toContain("<Terminal {...props} />");
    expect(page).toContain("<BrandFoot inline />");
    for (const p of ["app/filings/page.tsx", "app/filings/[ticker]/page.tsx"]) expect(readFileSync(join(ROOT, p), "utf8")).toContain("<TerminalPage");
  });
  it("the calculator starts empty: no default value, no suggested probability", () => {
    const html = renderToStaticMarkup(createElement(EvCalculator));
    const inputs = [...html.matchAll(/<input[^>]*>/g)].map(m => m[0]);
    expect(inputs).toHaveLength(4);
    for (const i of inputs) expect(i).toMatch(/value=""/);
    expect(html).toContain("Fill in all four fields");
    expect(html).toContain("estimate it");
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
    expect(brand).toContain("--term-void: #050505; --term-slate: #0a0a0a; --term-line: #1c1c1e; --term-line-2: #2c2c2e;");
    expect(brand).toContain("--term-p: #10b981; --term-s: #e5484d; --term-8k: #22b8cf;");
    for (const v of ["var(--term-void)", "var(--term-slate)", "var(--term-line)", "var(--term-line-2)", "var(--term-p)", "var(--term-s)", "var(--term-8k)"]) expect(css).toContain(v);
  });
  it("gains and losses are never coloured: P&L and EV use the neutral number style", () => {
    for (const f of ["components/filings/PositionsDesk.tsx", "components/filings/EvCalculator.tsx"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src, f).not.toMatch(/pnl[^\n]*fl-(p|s)\b|signedUsd[^\n]*fl-(p|s)\b/);
    }
  });
  it("the /edgar landing: disclaimer pinned to the viewport, real checkout, the site's nav, no per-visitor database read", () => {
    const land = readFileSync(join(ROOT, "components/filings/EdgarLanding.tsx"), "utf8");
    expect(land).toContain('<p className="el-bar" role="note" data-testid="el-disclaimer">{RESEARCH_DISCLAIMER}</p>');
    expect(readFileSync(join(ROOT, "components/filings/filings.css"), "utf8")).toMatch(/\.el-bar \{ position: fixed;[^}]*bottom: 0;/);
    expect(land).toContain('const CHECKOUT = "/go?step=checkout&from=edgar"');
    expect(land).toContain("<Paywall ");
    const page = readFileSync(join(ROOT, "app/edgar/page.tsx"), "utf8");
    // Data from the shared 30-second preview cache only: no per-visitor query, no cookies read by the page itself.
    expect(page).toMatch(/await previewFor\(getDb\(\), now\)/);
    expect(page).not.toMatch(/cookies\(|headers\(|getViewer|select\(/);
    expect(readFileSync(join(ROOT, "lib/filings/preview.ts"), "utf8")).toMatch(/memo\("filings:preview", PREVIEW_MS/);
    expect(page).toContain("<BrandNav fixed />");
    expect(readFileSync(join(ROOT, "app/api/edgar/preview/route.ts"), "utf8")).toMatch(/public, max-age=15, s-maxage=30/);
  });
});
