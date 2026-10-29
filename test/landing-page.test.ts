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
  "components/SiteHeader.tsx", "components/SiteFooter.tsx", "components/home/Phones.tsx", "components/home/HeroCta.tsx", ...tree("components/trackers"), "app/trackers/page.tsx", "app/trackers/[slug]/page.tsx", "lib/trackers.ts", "components/WrongTrail.tsx", ...tree("components/v2"),
  "lib/moves/copy.ts", "lib/moves/ticker.ts",
];

describe("V2 landing page", () => {
  it("renders its sections in order: the centred hero with the phones, Featured, Top performers and Popular, pricing, FAQ", () => {
    const src = read("app/page.tsx");
    const markers = ['className="hero3"', "<Phones ", 'id="feat-h"', "<PeriodTabs ", "Popular</h2>", "<PricingCards ", "<FaqV2 "];
    const at = markers.map(m => src.indexOf(m));
    for (const [i, m] of markers.entries()) expect(at[i], m).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("says the brief's words", () => {
    const src = read("app/page.tsx");
    expect(src).toContain("Follow the big money.");
    expect(src).toContain("Pick a tracker. See every big move. That&apos;s it.");
    expect(src).toContain("<HeroCta />");
    expect(read("components/home/HeroCta.tsx")).toMatch(/href="\/trackers" data-cta="hero"/);
    expect(read("components/home/HeroCta.tsx")).toContain("Explore trackers <span");
    for (const h of [">Featured</h2>", ">Top performers</h2>", ">Popular</h2>"]) expect(src).toContain(h);
    const story = read("components/home/Story.tsx");
    expect(story).toContain('id="how"');
    for (const c of ["A big bet happens.", "Insidir catches it in seconds.", "See who it is and if they usually win.", "Get pinged next time they move."]) expect(story).toContain(c);
    // One offer everywhere: 7 days for $1, then $39/mo. No old price lines, no 3-day trial, no Pro.
    expect(read("lib/copy.ts")).toContain('GET_CTA = "Try 7 days for $1"');
    expect(read("lib/copy.ts")).toContain('THEN_LINE = "then $39/mo, cancel anytime"');
    for (const f of ["app/page.tsx", "app/pricing/page.tsx", "app/start/page.tsx", "components/v2/Pricing.tsx", "components/lock/Lock.tsx", "components/SiteHeader.tsx", "components/v2/Faq.tsx", "components/home/ScrollOffer.tsx", "components/auth/StartCheckout.tsx", "lib/copy.ts"]) {
      expect(read(f), f).not.toMatch(/Get Insidir · \$39|\$39\/month · Cancel|Try it for|3 days|Pro\b/);
    }
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
      link: null, result: null, note: null, ticker: null, who: { name: "Someone", href: null, badge: null }, face: { src: null, mono: "SO" }, why: null, sourceLink: null } as const;
    const t = tickerItem({ ...base });
    expect(`${t.amount} ${t.what} · ${t.ago}`).toBe("$48K on Lakers · 2m");
    expect(t.href).toBe("/market/KX-LAL");
    expect(tickerItem({ ...base, outcome: "Yes", tab: "markets", marketTitle: "Will the Fed cut in December?" }).what).toBe("on Yes · Will the Fed cut in December?");
    expect(tickerItem({ ...base, source: "sec", tab: "stocks", eventTitle: "NVIDIA CORP", company: "Nvidia (NVDA)" }).what).toBe("of Nvidia (NVDA)");
  });
});

describe("design system", () => {
  it("defines every colour in app/tokens.css, only black, white, greys, the gain green and the loss red (each with a darker shade for small text); other stylesheets use tokens only", () => {
    const tokens = read("app/tokens.css").replace(/\/\*[\s\S]*?\*\//g, " ").toLowerCase();
    const palette = ["#0b0b12", "#ffffff", "#f5f5f7", "#ececf0", "#e8e8ed", "#6e6e73", "#2a2a33", "#1a9e5c", "#137a47", "#d93a2b", "#c0321f"];
    expect([...new Set(tokens.match(/#[0-9a-f]{3,8}\b/g))].sort()).toEqual([...palette].sort());
    for (const f of tree("app").concat(tree("components")).filter(f => f.endsWith(".css") && f !== "app/tokens.css")) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, " ");
      expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], f).toEqual([]);
    }
  });

  it("uses one font, Schibsted Grotesk; the serif and older fonts are gone", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/schibsted-grotesk-latin\.woff2/);
    expect(layout).not.toMatch(/Rufina/);
    expect(read("app/tokens.css")).toMatch(/--serif: var\(--sans\)/);
    for (const f of [...tree("app"), ...tree("components"), ...tree("lib")]) {
      const src = read(f);
      expect(src, f).not.toMatch(/General Sans|fontshare|JetBrains|--font-mono|Plus.Jakarta/);
    }
  });

  it("the manifest opens the feed, all white", async () => {
    const { default: manifest } = await import("@/app/manifest");
    expect(manifest()).toMatchObject({ name: "Insidir", start_url: "/feed", background_color: "#ffffff", theme_color: "#ffffff" });
  });
});
