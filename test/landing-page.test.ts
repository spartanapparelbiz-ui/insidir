/* Source-level checks of the V2 public pages (docs/INSIDIR-V2.md §4, §6, §10): section order, copy rules, location rules and
 * the design tokens. No DOM needed. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bannedPhrases, CANCEL_LINE, FOOTER, GET_CTA, OFFER_BAR } from "@/lib/copy";
import { BANNED_WORDS } from "@/lib/moves/copy";

const ROOT = join(__dirname, "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const tree = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap(f => {
  const p = `${dir}/${f}`;
  return statSync(join(ROOT, p)).isDirectory() ? tree(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
});

/** The user-facing text in a source file: string literals and JSX text, comments removed. */
function literals(src: string): string {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
  const strings = [...noComments.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map(m => m[1] ?? m[2] ?? m[3] ?? "");
  const jsxText = [...noComments.matchAll(/>([^<>{}]+)</g)].map(m => m[1] ?? "");
  return [...strings, ...jsxText].join("\n").replace(/&apos;/g, "'");
}

/** Every V2 page and component a visitor or member sees. */
const V2_UI = [
  "app/page.tsx", "app/feed/page.tsx", "app/trader/[wallet]/page.tsx", "app/market/[id]/page.tsx", "app/results/page.tsx", "app/following/page.tsx",
  "app/pricing/page.tsx", "app/about/page.tsx", "app/terms/page.tsx", "app/privacy/page.tsx", "app/signin/page.tsx", "app/not-found.tsx", "app/error.tsx",
  "components/SiteHeader.tsx", "components/SiteFooter.tsx", "components/home/Hero.tsx", "components/WrongTrail.tsx", ...tree("components/v2"),
  "lib/moves/copy.ts", "lib/moves/ticker.ts",
];

describe("V2 landing page", () => {
  it("renders its sections in order: the cinematic hero, the scroll story (how it works), the feed preview, results, pricing, FAQ", () => {
    const src = read("app/page.tsx");
    const markers = ["<Hero ", "<Story ", "<PreviewSeen ", 'id="res-h"', "<PricingCards ", "<FaqV2 "];
    const at = markers.map(m => src.indexOf(m));
    for (const [i, m] of markers.entries()) expect(at[i], m).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("says the brief's words", () => {
    const src = read("app/page.tsx");
    const hero = read("components/home/Hero.tsx");
    expect(hero).toContain("LIVE · big money moves");
    expect(hero).toContain("Follow the big money.");
    expect(hero).toContain("Live tracker for sports bets, prediction markets and insider stock trades");
    expect(hero).toContain("Insidir shows you the biggest bets and stock trades the moment they happen: who made them, how much, and whether they usually win.");
    for (const p of ["Sports · Prediction markets · Stocks", "Real public data", "Alerts to your phone"]) expect(hero).toContain(p);
    const story = read("components/home/Story.tsx");
    expect(story).toContain('id="how"');
    for (const c of ["A big bet happens.", "Insidir catches it in seconds.", "See who it is and if they usually win.", "Get pinged next time they move."]) expect(story).toContain(c);
    expect(hero).toContain("Public data. Not financial advice.");
    expect(src).toContain("See the live feed");
    expect(src).toContain("Real past moves. Not a promise.");
    expect(read("lib/copy.ts")).toContain("Get Insidir · $39/mo");
    expect(read("lib/copy.ts")).toContain("Cancel anytime.");
    // One plan, no trial: no "$1" offer anywhere a visitor reads.
    for (const f of ["app/page.tsx", "app/pricing/page.tsx", "app/start/page.tsx", "components/v2/Pricing.tsx", "components/lock/Lock.tsx", "components/SiteHeader.tsx", "components/v2/Faq.tsx", "lib/copy.ts"]) expect(read(f), f).not.toMatch(/\$1 for|for \$1|Try it for|3 days|Pro\b/);
  });

  it("says what Insidir is in one plain sentence: the first FAQ answer, the title and the meta description", async () => {
    const { FAQ_V2 } = await import("@/components/v2/Faq");
    const { WHAT_IS, WHAT_IS_TITLE } = await import("@/lib/copy");
    expect(FAQ_V2[0]).toMatchObject({ q: "What is Insidir?", a: WHAT_IS });
    expect(WHAT_IS.split(/[.!?](\s|$)/).filter(x => x && x.trim()).length).toBe(1);
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/title: \{ default: WHAT_IS_TITLE/);
    expect(layout).toContain("description: WHAT_IS,");
  });

  it("is dynamic and records landing_view", () => {
    const src = read("app/page.tsx");
    expect(src).toContain('export const dynamic = "force-dynamic"');
    expect(src).toMatch(/recordEvent\(\{ name: "landing_view"/);
  });
});

describe("copy rules on every V2 page", () => {
  it("never uses the banned words or phrases", () => {
    for (const f of V2_UI) {
      const text = literals(read(f));
      for (const b of BANNED_WORDS) expect(text, `${f}: ${b}`).not.toMatch(b);
      expect(bannedPhrases(text), f).toEqual([]);
    }
    // lib/copy.ts also holds the Price gaps lines (Pro, coming soon); the V2 strings in it are checked one by one.
    for (const t of [FOOTER, OFFER_BAR, GET_CTA, CANCEL_LINE]) for (const b of BANNED_WORDS) expect(t).not.toMatch(b);
  });

  it("never says bankroll, VPN or Telegram, and never hard-codes an international Polymarket link", () => {
    for (const f of V2_UI) {
      const src = read(f);
      expect(src, f).not.toMatch(/bankroll/i);
      expect(src, f).not.toMatch(/\bvpns?\b/i);
      expect(src, f).not.toMatch(/telegram/i);
      expect(src, f).not.toMatch(/polymarket\.com/i);
    }
  });

  it("the support email is hello@aethric.llc everywhere", () => {
    for (const f of [...tree("app"), ...tree("components"), ...tree("lib")]) expect(read(f), f).not.toMatch(/support@insidir\.com/);
  });
});

describe("home hero ticker", () => {
  it("reads 'Someone · $48,000 on Lakers · 2m ago' from a feed item", async () => {
    const { tickerItem } = await import("@/lib/moves/ticker");
    const base = { id: "ks:1", source: "kalshi", tab: "sports", league: "NBA", sentence: "", payout: null, record: null, topTrader: false, amount: 48_000, at: 0,
      ago: "2m ago", eventTitle: "Lakers vs Celtics", marketTitle: "Lakers vs Celtics", outcome: "Lakers", marketId: "KX-LAL", wallet: null, walletLabel: null,
      link: null, result: null, note: null, ticker: null, who: { name: "Someone", href: null, badge: null }, why: null, sourceLink: null } as const;
    const t = tickerItem({ ...base });
    expect(`${t.amount} ${t.what} · ${t.ago}`).toBe("$48K on Lakers · 2m");
    expect(t.href).toBe("/market/KX-LAL");
    expect(tickerItem({ ...base, outcome: "Yes", tab: "markets", marketTitle: "Will the Fed cut in December?" }).what).toBe("on Yes · Fed cut in December");
    expect(tickerItem({ ...base, source: "sec", tab: "stocks", eventTitle: "NVIDIA CORP", company: "Nvidia (NVDA)" }).what).toBe("of Nvidia (NVDA)");
  });
});

describe("design system", () => {
  it("defines every colour in app/tokens.css, only black, white, greys, money green and the loss colour (plus the dark app's surfaces and lifted data colours); other stylesheets use tokens only", () => {
    const tokens = read("app/tokens.css").replace(/\/\*[\s\S]*?\*\//g, " ").toLowerCase();
    const palette = ["#0b0b12", "#ffffff", "#f2f2f4", "#e6e6ea", "#5b6070", "#087a55", "#c2410c",
      "#141418", "#1c1c22", "#26262c", "#a1a1aa", "#2bb07f", "#f0703a"];
    expect([...new Set(tokens.match(/#[0-9a-f]{3,8}\b/g))].sort()).toEqual([...palette].sort());
    for (const f of tree("app").concat(tree("components")).filter(f => f.endsWith(".css") && f !== "app/tokens.css")) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, " ");
      expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], f).toEqual([]);
    }
  });

  it("uses Rufina for headlines and Schibsted Grotesk for everything else; older fonts are gone", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/schibsted-grotesk-latin\.woff2/);
    expect(layout).toMatch(/Rufina\(/);
    for (const f of [...tree("app"), ...tree("components"), ...tree("lib")]) {
      const src = read(f);
      expect(src, f).not.toMatch(/General Sans|fontshare|JetBrains|--font-mono|Plus.Jakarta/);
    }
  });

  it("the manifest opens the feed, white page under the black bar", async () => {
    const { default: manifest } = await import("@/app/manifest");
    expect(manifest()).toMatchObject({ name: "Insidir", start_url: "/feed", background_color: "#ffffff", theme_color: "#0b0b12" });
  });
});
