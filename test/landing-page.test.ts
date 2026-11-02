/* Source-level checks of the V2 public pages (docs/INSIDIR-V2.md §4, §6, §10): section order, copy rules, location rules and
 * the design tokens. No DOM needed. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isIdentifier } from "./copy-text";
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
  const strings = [...noComments.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map(m => m[1] ?? m[2] ?? m[3] ?? "").filter(t => !isIdentifier(t));
  const jsxText = [...noComments.matchAll(/>([^<>{}]+)</g)].map(m => m[1] ?? "");
  return [...strings, ...jsxText].join("\n").replace(/&apos;/g, "'");
}

/** Every V2 page and component a visitor or member sees. */
const V2_UI = [
  "app/page.tsx", "app/feed/page.tsx", "app/trader/[wallet]/page.tsx", "app/market/[id]/page.tsx", "app/results/page.tsx", "app/following/page.tsx",
  "app/pricing/page.tsx", "app/about/page.tsx", "app/terms/page.tsx", "app/privacy/page.tsx", "app/signin/page.tsx", "app/not-found.tsx", "app/error.tsx",
  "components/SiteHeader.tsx", "components/SiteFooter.tsx", "components/copies/MyCopies.tsx", "components/copies/CopyPicker.tsx", "lib/copies/store.ts", "components/read/ReadBox.tsx", "components/read/ReadCard.tsx", "app/read/[id]/page.tsx", "lib/home/ref.ts", "components/home/HeroCta.tsx", ...tree("components/trackers"), "app/trackers/page.tsx", "app/trackers/[slug]/page.tsx", "lib/trackers.ts", "components/WrongTrail.tsx", ...tree("components/v2"),
  "lib/moves/copy.ts", "lib/moves/ticker.ts",
];

describe("V2 landing page", () => {
  it("is a scroll of stages: hero, the problem, the check, live, markets, proof, pricing, FAQ, final; members get their home", () => {
    const src = read("app/page.tsx"), landing = read("components/brand/landing/Landing.tsx");
    expect(src).toContain("<Landing d={d} />");
    expect(src).toContain("<Dashboard d={d}");
    const order = ["<Hero />", "<Problem />", "<Check d={d} />", "<Live d={d} />", "<Markets d={d} />", "<Proof d={d} />", "<Pricing />", "<FaqStage />", "<Final />"];
    const at = order.map(m => landing.indexOf(m));
    for (const [i, m] of order.entries()) expect(at[i], m).toBeGreaterThan(-1);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(read("components/brand/app/Dashboard.tsx")).toContain('data-testid="member-home"');
  });

  it("the hero's words, its two CTAs (Check my bet, Start for $1 → /go), and no stocks, crypto or Congress in the pitch", async () => {
    const copy = await import("@/lib/brand/copy");
    expect(copy.HERO.h1).toEqual(["Stop betting", "blind."]);
    expect(copy.STAGES.final).toEqual(["Bet with the", "millionaires."]);
    expect(copy.STAGES.pricing).toEqual(["Less than", "one bad bet."]);
    const landing = read("components/brand/landing/Landing.tsx");
    expect(landing).toContain('<Pill href="#check" delay={0.9} data-testid="hero-check">Check my bet</Pill>');
    expect(landing).toContain('<Pill href="/go" kind="ghost" delay={0.97} data-testid="hero-start" data-checkout="hero">Start for $1</Pill>');
    const pitch = [...copy.HERO.h1, ...copy.HERO.sub, ...copy.PROBLEM.rows.flat(), ...copy.FAQ.flatMap(f => [f.q, f.a])].join(" ");
    expect(pitch).not.toMatch(/\b(stocks?|crypto|SEC|CEO|Congress)\b/i);
    expect(bannedPhrases(pitch)).toEqual([]);
    expect(GET_CTA).toBe("Try 3 days for $1");
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
  it("older pages: every colour in app/tokens.css; the brand (app/brand.css): only the hero spec's tokens and the data colours", () => {
    const tokens = read("app/tokens.css").replace(/\/\*[\s\S]*?\*\//g, " ").toLowerCase();
    const palette = ["#0b0b12", "#ffffff", "#f7f7f8", "#ececf0", "#eaeaee", "#6b6b73", "#b4b4bb", "#2a2a33", "#0f7a45", "#c4321f"];
    expect([...new Set(tokens.match(/#[0-9a-f]{3,8}\b/g))].sort()).toEqual([...palette].sort());
    const spec = ["#ffffff", "#ededed", "#181818", "#fdfdfd", "#050505", "#a78bfa", "#3dd68c", "#ff6b6b", "#000", "#fff", "#e8e8e8", "#d9d9d9", "#f6f6f6", "#232323", "#5b5b5b", "#111", "#e6e6e6", "#f0f0f0", "#ffd6a8"];
    const brand = read("app/brand.css").replace(/\/\*[\s\S]*?\*\//g, " ").toLowerCase();
    for (const c of new Set(brand.match(/#[0-9a-f]{3,8}\b/g))) expect(spec, c).toContain(c);
    for (const f of tree("app").concat(tree("components")).filter(f => f.endsWith(".css") && f !== "app/tokens.css" && f !== "app/brand.css")) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, " ");
      expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], f).toEqual([]);
    }
  });

  it("two fonts: Schibsted Grotesk on older pages, Plus Jakarta Sans on the brand's (and nothing else)", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/schibsted-grotesk-latin\.woff2/);
    expect(read("lib/brand/fonts.ts")).toMatch(/Plus_Jakarta_Sans/);
    expect(read("app/tokens.css")).toMatch(/--serif: var\(--sans\)/);
    for (const f of [...tree("app"), ...tree("components"), ...tree("lib")]) {
      const src = read(f);
      expect(src, f).not.toMatch(/General Sans|fontshare|JetBrains|Satoshi|Geist_Mono|GeistMono|Instrument Serif|Instrument Sans|Instrument_S/);
    }
  });

  it("the manifest opens the app on Trackers, all white", async () => {
    const { default: manifest } = await import("@/app/manifest");
    expect(manifest()).toMatchObject({ name: "Insidir", start_url: "/", background_color: "#ffffff", theme_color: "#ffffff" });
  });
});
