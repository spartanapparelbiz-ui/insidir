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
const tree = (dir: string): string[] => !existsSync(join(ROOT, dir)) ? [] : readdirSync(join(ROOT, dir)).flatMap(f => {
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
].filter(f => existsSync(join(ROOT, f)));

describe("V2 landing page", () => {
  it("is the terminal in five blocks: hero, board, what you get, record, access + FAQ; members get their home", () => {
    const src = read("app/page.tsx"), landing = read("components/brand/landing/Landing.tsx");
    expect(src).toContain("<Landing d={d} />");
    expect(src).toContain("<HomePage d={d}");
    // The terminal chrome first (no nav Start button on the landing), then the five blocks in order.
    expect(landing).toContain("<TerminalChrome start={false}");
    const order = ["<Hero d={d} />", "<Board d={d} />", "<WhatYouGet />", "<Record d={d} />", "<Access />", "<Faqs />"];
    const at = order.map(m => landing.indexOf(m));
    for (const [i, m] of order.entries()) expect(at[i], m).toBeGreaterThan(-1);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    // Gone from the landing: the globe, photo stages, How it works, the recordings.
    expect(landing).not.toMatch(/<Stage\b|globe|<HowStage|<WatchStage|<WhyStage|Demo/);
    expect(read("components/home/Home.tsx")).toContain('testid="member-home"');
  });

  it("the hero's words, exactly two Start for $1 buttons (hero and pricing, plus the phones' sticky bar), and no stocks, crypto or Congress in the pitch", async () => {
    const copy = await import("@/lib/brand/copy");
    expect(copy.LANDING.h1).toBe("See what the $1M+ wallets bet, before the game.");
    expect(copy.LANDING.sub).toBe("Every Polymarket bet of $5K+ from wallets up $1M+, with what it needs to win.");
    expect(copy.LANDING.price).toBe("$1 FOR 3 DAYS · THEN $39/MO · CANCEL ANYTIME");
    const landing = read("components/brand/landing/Landing.tsx");
    expect(landing.match(/data-checkout="/g)).toHaveLength(2);
    expect(landing).toContain('href="/go" data-checkout="hero" data-cta="hero" data-testid="hero-start"');
    expect(landing).toContain('href="/go" data-checkout="pricing" data-cta="pricing" data-testid="pricing-cta"');
    expect(read("components/brand/landing/StickyStart.tsx")).toContain('data-checkout="sticky" data-cta="sticky"');
    // The board's side is locked for visitors: the column never prints a side.
    expect(landing).toContain('<span className="t-lock" data-locked="side">MEMBERS</span>');
    expect(landing).not.toMatch(/b\.side|b\.outcome/);
    const pitch = [copy.LANDING.h1, copy.LANDING.sub, ...copy.LANDING.three.map(x => x.t), ...copy.HERO.h1, ...copy.PROBLEM.rows.flat(), ...copy.MEMBERS.map(x => x.t), ...copy.FAQ.flatMap(f => [f.q, f.a])].join(" ");
    expect(pitch).not.toMatch(/\b(stocks?|crypto|SEC|CEO|Congress)\b/i);
    expect(bannedPhrases(pitch)).toEqual([]);
    expect(GET_CTA).toBe("Try 3 days for $1");
  });

  it("says what Insidir is in one plain sentence: the first FAQ answer, the title and the meta description", async () => {
    const { FAQ_ALL } = await import("@/lib/brand/copy");
    const { WHAT_IS, WHAT_IS_TITLE } = await import("@/lib/copy");
    expect(FAQ_ALL[0]!.q).toBe("What is Insidir?");
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


describe("design system", () => {
  it("the terminal palette lives in app/tokens.css only: Shillingston Navy, Custodious Blue, a touch of Slime Orange, green and red", () => {
    const tokens = read("app/tokens.css").replace(/\/\*[\s\S]*?\*\//g, " ").toLowerCase();
    const palette = ["#0b1220", "#101a2b", "#15233a", "#22324b", "#182539", "#e8ecf3", "#8e9ab0", "#1f5bff", "#6e96ff", "#132b5c", "#ff6b1a", "#ff7f38", "#19d27a", "#ff4d6a"];
    expect([...new Set(tokens.match(/#[0-9a-f]{3,8}\b/g))].sort()).toEqual([...palette].sort());
    // No yellow, gold or amber anywhere: every other stylesheet uses the tokens, never a literal colour.
    for (const f of tree("app").concat(tree("components")).filter(f => f.endsWith(".css") && f !== "app/tokens.css")) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, " ");
      expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], f).toEqual([]);
      expect(css.match(/rgba?\(\s*(245|242|200|176|150)\s*,?\s*(196|195|149|124|86)\b/g) ?? [], `${f}: gold`).toEqual([]);
    }
    // Orange is only the Start for $1 button.
    const term = read("app/terminal.css");
    const ctaUses = [...term.matchAll(/([^{}]+)\{[^}]*var\(--t-cta(?:-hover)?\)[^}]*\}/g)].map(m => m[1]!.trim());
    for (const sel of ctaUses) expect(sel, sel).toMatch(/data-checkout|b-m-start|t-cta/);
  });

  it("two typefaces, self-hosted: IBM Plex Mono for numbers and labels, IBM Plex Sans Condensed for headlines", () => {
    const fonts = read("lib/brand/fonts.ts");
    expect(fonts).toMatch(/ibm-plex-mono-latin-400-normal\.woff2/);
    expect(fonts).toMatch(/ibm-plex-sans-condensed-latin-600-normal\.woff2/);
    expect(existsSync(join(ROOT, "app/fonts/OFL-IBM-Plex.txt"))).toBe(true);
    expect(read("app/tokens.css")).toMatch(/--t-mono: var\(--font-plex-mono\)/);
    expect(read("app/tokens.css")).toMatch(/--t-sans: var\(--font-plex-cond\)/);
    for (const f of [...tree("app"), ...tree("components"), ...tree("lib")]) {
      const src = read(f);
      expect(src, f).not.toMatch(/General Sans|fontshare|JetBrains|Satoshi|Geist_Mono|GeistMono|Instrument Serif|Instrument Sans|Instrument_S/);
    }
  });

  it("the manifest opens the app on its home, Shillingston Navy like the terminal, with the brackets-mark icons", async () => {
    const { default: manifest } = await import("@/app/manifest");
    expect(manifest()).toMatchObject({ name: "Insidir", start_url: "/", background_color: "#0b1220", theme_color: "#0b1220" });
  });
});
