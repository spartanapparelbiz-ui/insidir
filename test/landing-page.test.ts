/* Source-level checks of the public pages: section order, copy rules, region rules. No DOM needed. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RISK_QUESTION } from "@/components/landing/model";
import { COMPETITOR_PRICE_LINE, LANDING_CTA } from "@/components/landing/model";
import { bannedPhrases } from "@/lib/copy";

const ROOT = join(__dirname, "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const FILES = [
  "app/page.tsx", "app/landing.css", "app/receipts/page.tsx", "app/pricing/page.tsx", "app/terms/page.tsx", "app/privacy/page.tsx",
  "app/manifest.ts", "app/opengraph-image.tsx",
  ...readdirSync(join(ROOT, "components/landing")).map(f => "components/landing/" + f),
];

/** The user-facing text in a source file: string literals and JSX text, comments removed. */
function literals(src: string): string {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
  const strings = [...noComments.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map(m => m[1] ?? m[2] ?? m[3] ?? "");
  const jsxText = [...noComments.matchAll(/>([^<>{}]+)</g)].map(m => m[1] ?? "");
  return [...strings, ...jsxText].join("\n").replace(/&apos;/g, "'");
}

/** Everything the landing page renders, except the FAQ (the one place jargon is allowed, explained). */
const LANDING_FILES = [
  "app/page.tsx", ...readdirSync(join(ROOT, "components/landing")).filter(f => f !== "Faq.tsx").map(f => "components/landing/" + f),
  "components/DealRow.tsx", "components/SafetyLight.tsx", "components/SiteHeader.tsx", "components/SiteFooter.tsx",
  ...readdirSync(join(ROOT, "components/simple")).filter(f => f.endsWith(".tsx")).map(f => "components/simple/" + f), "lib/simple.ts",
];

describe("landing page", () => {
  it("renders its sections in the required order", () => {
    const src = read("app/page.tsx");
    const markers = ["<Hero ", "<HowItWorks ", "<TodayDeal ", "<LiveStrip ", "<TerminalPreview ", 'data-section="receipts"', "<SafetySection ", "<Pricing ", "<Faq ", "<FinalCta ", "<Sticky "];
    const at = markers.map(m => src.indexOf(m));
    for (const [i, m] of markers.entries()) expect(at[i], m).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const [file, sec] of [["Hero", "hero"], ["HowItWorks", "how"], ["TodayDeal", "today"], ["LiveStrip", "live"], ["TerminalPreview", "preview"], ["Safety", "safety"],
      ["Pricing", "pricing"], ["Faq", "faq"], ["Cta", "final"]] as const) {
      expect(read(`components/landing/${file}.tsx`)).toContain(`data-section="${sec}"`);
    }
  });

  it("is dynamic and records landing_view with the A/B cookie", () => {
    const src = read("app/page.tsx");
    expect(src).toContain('export const dynamic = "force-dynamic"');
    expect(src).toMatch(/recordEvent\(\{ name: "landing_view"/);
    expect(src).toContain("AB_TESTS.hero[heroVariant(abRaw)]");
  });

  it("uses no banned phrases (the owner's FAQ question is answered with an explicit No)", () => {
    for (const f of FILES) {
      const text = literals(read(f)).split(RISK_QUESTION).join(" ");
      expect(bannedPhrases(text), f).toEqual([]);
    }
    expect(read("components/landing/Faq.tsx")).toContain("No, it is not risk-free.");
  });

  it("never says bankroll, VPN or Telegram, and never links the international Polymarket site", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, f).not.toMatch(/bankroll/i);
      expect(src, f).not.toMatch(/\bvpns?\b/i);
      expect(src, f).not.toMatch(/telegram/i);
      expect(src, f).not.toMatch(/polymarket\.com/i);
    }
  });

  it("keeps the competitor line in one place", () => {
    const hits = FILES.filter(f => read(f).includes("$200/mo"));
    expect(hits).toEqual(["components/landing/model.ts"]);
    expect(COMPETITOR_PRICE_LINE).toContain("$200/mo");
  });

  it("the manifest makes an installable app that opens the Terminal", async () => {
    const { default: manifest } = await import("@/app/manifest");
    const m = manifest();
    expect(m).toMatchObject({ name: "Insidir Terminal", short_name: "Insidir", start_url: "/terminal", display: "standalone", background_color: "#000000", theme_color: "#000000" });
    expect(m.icons?.map(i => i.src)).toEqual(expect.arrayContaining(["/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"]));
  });

  it("says \"arbitrage\" only inside the FAQ, where it's explained, and no other jargon outside it", () => {
    for (const f of LANDING_FILES) {
      const text = literals(read(f));
      expect(text, f).not.toMatch(/arbitrage/i);
      expect(text, f).not.toMatch(/\b(spread|liquidity|taker)\b/i);
    }
    expect(literals(read("components/landing/Faq.tsx"))).toMatch(/Traders call this arbitrage/);
  });

  it("has one goal: every landing CTA goes to the feed with the same words; checkout only on the pricing cards", () => {
    expect(LANDING_CTA).toBe("See today's live deals");
    for (const f of ["app/page.tsx", "components/landing/Hero.tsx", "components/landing/Cta.tsx", "components/landing/Sticky.tsx", "components/landing/TerminalPreview.tsx"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/Start for|\$39|data-checkout/);
    }
    const page = read("app/page.tsx");
    expect(page.match(/cta=\{LANDING_CTA\}/g)?.length).toBeGreaterThanOrEqual(3);
    expect(page).toContain('<Sticky label={LANDING_CTA} href="/terminal" />');
  });

  it("is monochrome: no colour in the styles except the three safety lights", () => {
    const PALETTE = new Set(["#000000", "#141414", "#262626", "#f5f5f5", "#8c9099", "#5a5f66", "#ffffff", "#30d158", "#ff9f0a", "#ff453a"]);
    const SAFETY = ["--green", "--amber", "--red"];
    for (const f of ["app/globals.css", "app/landing.css", "app/app.css", "components/deal-row.css", "components/app/ios.css", "components/simple/simple.css"]) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, " ");
      for (const hex of css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) expect(PALETTE.has(hex.toLowerCase()), `${f}: ${hex}`).toBe(true);
      expect(css, f).not.toMatch(/gold|ffc53d|rgba?\((?!0, 0, 0)/i);
      // The safety colours appear only as a dot's background, never as text, buttons or borders.
      for (const line of css.split("\n").filter(l => SAFETY.some(v => l.includes(`var(${v})`)))) {
        expect(line, `${f}: ${line}`).toMatch(/--dot: var\(--(green|amber|red)\)|::before[^{]*\{[^}]*background: var\(--(green|amber|red)\)|^\s*--(green|amber|red): #/);
      }
    }
  });

  it("only offers the refund when the log averages a green deal a day, and shows the objection lines", () => {
    const page = read("app/page.tsx");
    expect(page).toMatch(/greenPerDay\(mine, REFUND_WINDOW_DAYS, now\) >= REFUND_MIN_GREEN_PER_DAY/);
    const pricing = read("components/landing/Pricing.tsx");
    expect(pricing).toContain("{refund ? <p className=\"lp-refund\">{REFUND_LINE}</p> : null}");
    expect(pricing).toContain("OBJECTIONS.map");
  });
});
