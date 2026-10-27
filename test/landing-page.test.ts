/* Source-level checks of the V2 public pages (docs/INSIDIR-V2.md §4, §6, §10): section order, copy rules, location rules and
 * the design tokens. No DOM needed. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bannedPhrases, FOOTER, TRIAL_BAR, TRIAL_LINE, TRY_CTA } from "@/lib/copy";
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
  "components/SiteHeader.tsx", "components/SiteFooter.tsx", ...tree("components/v2"), "lib/moves/copy.ts",
];

describe("V2 landing page", () => {
  it("renders its sections in order: hero, tab strip, how it works, results, pricing, FAQ, the dark band", () => {
    const src = read("app/page.tsx");
    const markers = ['className="hero2"', 'className="wrap tabstrip"', 'id="how"', 'id="res-h"', "<PricingCards ", "<FaqV2 ", 'className="band2"'];
    const at = markers.map(m => src.indexOf(m));
    for (const [i, m] of markers.entries()) expect(at[i], m).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("says the brief's words", () => {
    const src = read("app/page.tsx");
    expect(src).toContain("Follow the big money.");
    expect(src).toContain("Insidir shows you the biggest bets on sports and prediction markets the second they happen. In plain English. With alerts.");
    expect(src).toContain("See the live feed");
    expect(src).toContain("The next big bet is happening right now.");
    expect(src).toContain("Real past moves. Not a promise.");
    expect(read("lib/copy.ts")).toContain("Try Insidir for $1 for 3 days. Cancel anytime.");
    expect(read("lib/copy.ts")).toContain("$1 for 3 days, then $39/mo. Cancel anytime.");
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
    for (const t of [FOOTER, TRIAL_BAR, TRY_CTA, TRIAL_LINE]) for (const b of BANNED_WORDS) expect(t).not.toMatch(b);
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
  it("defines every colour in app/tokens.css; other stylesheets use tokens only", () => {
    const tokens = read("app/tokens.css");
    for (const hex of ["#ffffff", "#f6f7fb", "#e6e8ef", "#0b0b12", "#5b6070", "#5b4bff", "#4a3af0", "#f1eeff", "#087a55", "#e8f8f1", "#c2410c", "#fff1e6", "#eaf4ff"]) {
      expect(tokens.toLowerCase(), hex).toContain(hex);
    }
    for (const f of tree("app").concat(tree("components")).filter(f => f.endsWith(".css") && f !== "app/tokens.css")) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, " ");
      expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], f).toEqual([]);
    }
  });

  it("uses Plus Jakarta Sans only: General Sans and JetBrains Mono are gone", () => {
    expect(read("app/layout.tsx")).toMatch(/Plus_Jakarta_Sans\(/);
    for (const f of [...tree("app"), ...tree("components"), ...tree("lib")]) {
      const src = read(f);
      expect(src, f).not.toMatch(/General Sans|fontshare|JetBrains|--font-mono/);
    }
  });

  it("the manifest opens the feed in the bright theme", async () => {
    const { default: manifest } = await import("@/app/manifest");
    expect(manifest()).toMatchObject({ name: "Insidir", start_url: "/feed", background_color: "#ffffff", theme_color: "#ffffff" });
  });
});
