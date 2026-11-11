/* Copy rules over every source file that renders text: never "guaranteed"/"risk-free" (negations allowed),
 * the bankroll only as the member's own number for sizing (it was banned until the copy-sizing rebuild of 2026-11-11), never a VPN mention, the footer disclaimer exists, and no fake-urgency patterns. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bannedPhrases, FOOTER } from "@/lib/copy";
import { isIdentifier } from "./copy-text";

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
/** A string that is a code name, not words anyone reads: an import path, a class list, a test id, a key. */
const texts = (src: string): string => [...stripComments(src).matchAll(/"([^"\n]{3,})"|'([^'\n]{3,})'|`([^`]{3,})`|>([^<>{}\n]{3,})</g)].map(m => m.slice(1).find(Boolean) ?? "").filter(t => !isIdentifier(t)).join("\n");

describe("copy compliance", () => {
  it("never says guaranteed, risk-free, easy money, lock or sure thing, in any copy (and catches each one)", () => {
    for (const t of ["A guaranteed win.", "Risk-free bets.", "Easy money tonight.", "It's a lock.", "Two locks today.", "A sure thing."]) expect(bannedPhrases(t), t).not.toEqual([]);
    for (const t of ["Unlock every Read.", "Locked for visitors.", "Blocked wallets.", "Not risk-free: a price gap."]) expect(bannedPhrases(t), t).toEqual([]);
    expect(isIdentifier("@/components/lock/Lock")).toBe(true);
    expect(isIdentifier("sheet__panel lock")).toBe(true);
    expect(isIdentifier("read-lock")).toBe(true);
    expect(isIdentifier("Not a lock")).toBe(false);
    expect(isIdentifier("prices that lock in a net P&L")).toBe(false);
    const bad = SOURCES.flatMap(p => bannedPhrases(texts(readFileSync(p, "utf8"))).map(b => `${p.replace(ROOT, "")}: ${b}`));
    expect(bad).toEqual([]);
  });
  it("no VPN, no fake urgency, no countdowns; a bankroll only as the member's own number for sizing", () => {
    for (const p of SOURCES) {
      const t = texts(readFileSync(p, "utf8"));
      expect(t, p).not.toMatch(/bankroll (boost|builder|management system)|grow your bankroll|double your bankroll/i);
      expect(t, p).not.toMatch(/\bcountdown\b|ends in \d|\d+ (people|users|members) (joined|signed up|are watching)/i);
      expect(t, p).not.toMatch(/\bvpn\b/i);
      expect(t, p).not.toMatch(/spots? left|only \d+ left|hurry|offer ends|limited time/i);
    }
  });
  it("the footer disclaimer is on every page", () => {
    expect(FOOTER).toBe("Information, not financial advice. Past results don't predict future results. Not a broker or exchange. Not affiliated with Kalshi or Polymarket.");
    // Every visitor page is framed by components/brand/app/Frame.tsx (or carries the footer itself), and the footer says it.
    expect(readFileSync(join(ROOT, "components", "brand", "app", "Frame.tsx"), "utf8")).toContain("<BrandFoot");
    expect(readFileSync(join(ROOT, "components", "brand", "Nav.tsx"), "utf8")).toContain("{FOOTER}");
  });
});
