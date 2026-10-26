/* Copy rules over every source file that renders text: never "guaranteed"/"risk-free" (negations allowed),
 * never "bankroll", never a VPN mention, the footer disclaimer exists, and no fake-urgency patterns. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bannedPhrases, FOOTER } from "@/lib/copy";

const ROOT = join(__dirname, "..");
const DIRS = ["app", "components", "lib"];
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}
const SOURCES = DIRS.flatMap(d => files(join(ROOT, d))).filter(p => !p.endsWith(join("lib", "copy.ts")));
/** Code comments, which never render (block comments, JSX comments and whole-line // comments). */
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** String literals and JSX text, roughly: anything between quotes/backticks or between > and <. */
const texts = (src: string): string => [...stripComments(src).matchAll(/"([^"\n]{3,})"|'([^'\n]{3,})'|`([^`]{3,})`|>([^<>{}\n]{3,})</g)].map(m => m.slice(1).find(Boolean) ?? "").join("\n");

describe("copy compliance", () => {
  it("no page or alert promises a guaranteed or risk-free result", () => {
    const bad = SOURCES.flatMap(p => bannedPhrases(texts(readFileSync(p, "utf8"))).map(b => `${p.replace(ROOT, "")}: ${b}`));
    expect(bad).toEqual([]);
  });
  it("no bankroll, no VPN, no fake urgency", () => {
    for (const p of SOURCES) {
      const t = texts(readFileSync(p, "utf8"));
      expect(t, p).not.toMatch(/bankroll/i);
      expect(t, p).not.toMatch(/\bvpn\b/i);
      expect(t, p).not.toMatch(/spots? left|only \d+ left|hurry|offer ends|limited time/i);
    }
  });
  it("the footer disclaimer is on every page", () => {
    expect(FOOTER).toBe("This is information, not financial advice. We are not part of Polymarket or Kalshi. Prices move, and your buy may not go through. Check that these apps are open where you live.");
    expect(readFileSync(join(ROOT, "app", "layout.tsx"), "utf8")).toContain("<SiteFooter />");
    expect(readFileSync(join(ROOT, "components", "SiteFooter.tsx"), "utf8")).toContain("{FOOTER}");
  });
});

describe("offers", () => {
  it("are exactly Free, Insidir ($1 for 3 days, then $39/mo) and Pro ($99/mo)", async () => {
    const { PLANS, offerText, startText } = await import("@/lib/plans");
    expect(Object.keys(PLANS)).toEqual(["free", "insidir", "pro"]);
    expect([offerText("free"), offerText("insidir"), offerText("pro")]).toEqual(["Free", "$1 for 3 days, then $39/mo", "$99/mo"]);
    expect([startText("insidir"), startText("pro")]).toEqual(["Try 3 days for $1", "Start Pro for $99/mo"]);
  });
  it("no Founding plan, spots-left counter or countdown anywhere in the code", () => {
    for (const p of SOURCES) expect(readFileSync(p, "utf8"), p).not.toMatch(/founding|founder|spots?[ _-]?left|countdown/i);
  });
});
