/* Source-level checks of the V2 public pages (docs/INSIDIR-V2.md §4, §6, §10): section order, copy rules, location rules and
 * the design tokens. No DOM needed. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
  "components/SiteHeader.tsx", "components/SiteFooter.tsx", "components/home/Laptops.tsx", "components/home/HeroCta.tsx", ...tree("components/trackers"), "app/trackers/page.tsx", "app/trackers/[slug]/page.tsx", "lib/trackers.ts", "components/WrongTrail.tsx", ...tree("components/v2"),
  "lib/moves/copy.ts", "lib/moves/ticker.ts",
];

describe("V2 landing page", () => {
  it("renders its sections in order: hero, three laptops, Open now, Leaderboard, How Insidir works, the proof strip, track record, pricing, FAQ", () => {
    const src = read("app/page.tsx");
    const markers = ['className="hero3"', "<ResearchBar ", "<Laptops ", "<OpenSection ", "<AnalyzedSection ", "<BoardAndPortfolio ", 'id="steps-h"', "<ProofSection ", "<RecordSection ", "<PricingTable ", "<FaqV2 />"];
    const at = markers.map(m => src.indexOf(m));
    for (const [i, m] of markers.entries()) expect(at[i], m).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("says the brief's words", () => {
    const src = read("app/page.tsx");
    expect(src).toContain("Follow the big money.");
    expect(src).toContain("<HeroCta trialHref={trial} />");
    // The hero's one black button starts the trial; the trackers are a text link next to it. No position check on home.
    expect(read("components/home/HeroCta.tsx")).toMatch(/btn btn--primary[^"]*" href=\{trialHref\} data-cta="hero"/);
    expect(read("components/home/HeroCta.tsx")).toContain("Start your 7-day trial");
    expect(read("components/home/HeroCta.tsx")).toContain('href="/trackers">Explore trackers <span');
    for (const f of ["app/page.tsx", "components/home/HeroCta.tsx"]) expect(read(f), f).not.toMatch(/\/check|Check your bet|Position check/);
    for (const h of ['title="Open now from winning trackers"', 'title="Every position, analyzed."', 'title="Leaderboard"', 'title="How Insidir works"', 'title="Track record"', 'title="Pricing"']) expect(src).toContain(h);
    expect(src).toContain("Insidir analyzes every large position on Polymarket, Kalshi and SEC filings: who placed it, their verified record, and what it means. Within minutes.");
    // The old scroll story and photo band are gone for good (scripts/check-design.ts rejects their classes).
    for (const f of ["components/home/Story.tsx", "components/PageBand.tsx"]) expect(existsSync(join(process.cwd(), f)), f).toBe(false);
    // One offer everywhere: 7 days for $1, then $39/mo. No old price lines, no 3-day trial, no Pro.
    expect(read("lib/copy.ts")).toContain('GET_CTA = "Try 7 days for $1"');
    expect(read("lib/copy.ts")).toContain('THEN_LINE = "then $39/mo, cancel anytime"');
    for (const f of ["app/page.tsx", "app/pricing/page.tsx", "app/start/page.tsx", "components/v2/Pricing.tsx", "components/lock/Lock.tsx", "components/SiteHeader.tsx", "components/v2/Faq.tsx", "components/paywall/PayModal.tsx", "components/auth/StartCheckout.tsx", "lib/copy.ts"]) {
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
      link: null, result: null, note: null, ticker: null, who: { name: "Anonymous · Kalshi", href: null, badge: null }, face: { src: null, mono: "AN" }, why: null, sourceLink: null,
      headline: "$48K says Lakers win", subline: "Lakers vs Celtics", inAt: "45%", avgPrice: 0.45, outcomeSide: "yes", nowPrice: null, pnl: null, low: null } as const;
    const t = tickerItem({ ...base });
    expect(`${t.amount} ${t.what} · ${t.ago}`).toBe("$48K on Lakers · 2m");
    expect(t.href).toBe("/market/KX-LAL");
    expect(tickerItem({ ...base, outcome: "Yes", tab: "markets", marketTitle: "Will the Fed cut in December?" }).what).toBe("on Yes · Will the Fed cut in December?");
    expect(tickerItem({ ...base, source: "sec", tab: "stocks", eventTitle: "NVIDIA CORP", company: "Nvidia (NVDA)" }).what).toBe("of Nvidia (NVDA)");
  });
});

describe("design system", () => {
  it("defines every colour in app/tokens.css, only black, white, greys, the gain green and the loss red (each with a darker shade for small text) (tracker covers are photos now); other stylesheets use tokens only", () => {
    const tokens = read("app/tokens.css").replace(/\/\*[\s\S]*?\*\//g, " ").toLowerCase();
    const palette = ["#0b0b12", "#ffffff", "#f7f7f8", "#ececf0", "#eaeaee", "#6b6b73", "#b4b4bb", "#2a2a33", "#0f7a45", "#c4321f"];
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

  it("the manifest opens the app on Trackers, all white", async () => {
    const { default: manifest } = await import("@/app/manifest");
    expect(manifest()).toMatchObject({ name: "Insidir", start_url: "/", background_color: "#ffffff", theme_color: "#ffffff" });
  });
});
