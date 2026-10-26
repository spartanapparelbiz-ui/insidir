/* The Simple view: the deal as a sentence, the "Show me how" math, when it pays out, and the words it may use. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FeedRow } from "@/lib/feed";
import { HELP, howTo, money, paysOutLocal, paysOutRough, perSet, simpleDeal, startAmount } from "@/lib/simple";

const NOW = Date.UTC(2026, 9, 26, 15, 0);
/** YES 55¢ on Kalshi + NO 40¢ on Polymarket, paying $1 a set, keeping $2.06 on $97.94 (the hand-checked example). */
function row(over: Partial<FeedRow> = {}): FeedRow {
  return {
    id: "d1", kind: "cross_arb", title: "Will the Hawks win on Nov 4?", play: "",
    legs: [
      { venue: "kalshi", venueName: "Kalshi", side: "yes", label: "YES on Kalshi", priceCents: 55, url: "https://kalshi.com/m/1" },
      { venue: "polymarket_us", venueName: "Polymarket US", side: "no", label: "NO on Polymarket US", priceCents: 40, url: "https://polymarket.us/m/1" },
    ],
    roi: 2.06 / 97.94, safety: "green", safetyNotes: [], categories: ["sports"], foundAt: NOW - 60_000, closeTime: NOW + 10 * 86_400_000, days: 10,
    profit: 2.06, cost: 95, fees: 2.94, sets: 100, profitPerDay: 0.206, gapCents: null, payoutPerSet: 1, locked: false, lastSeenAt: NOW, stale: false,
    ...over,
  };
}

describe("the deal as a sentence", () => {
  it("reads like the spec: buy both sides, put in, get $100 back, keep after fees", () => {
    const d = simpleDeal(row());
    expect(d.buy).toBe("Buy YES on Kalshi (55¢) + NO on Polymarket US (40¢).");
    expect(d).toMatchObject({ lock: true, putIn: 95, back: 100, keep: 2.06, upTo: 95, sameRules: "Yes" });
  });

  it("free rows read the same, from prices and the return alone; their size stays locked", () => {
    const d = simpleDeal(row({ locked: true, profit: null, cost: null, fees: null, sets: null, profitPerDay: null }));
    expect(d).toMatchObject({ putIn: 95, back: 100, keep: 2.06, upTo: null });
  });

  it("an all-NO set that pays $2 a set scales to $100 back", () => {
    const legs = ["A", "B", "C"].map(x => ({ venue: "kalshi" as const, venueName: "Kalshi", side: "no" as const, label: `NO: ${x}`, priceCents: 62, url: "" }));
    // 3 × 62¢ = $1.86 a set, paying $2: kept $0.10 a set after $0.04 of fees.
    const d = simpleDeal(row({ kind: "multi_no", legs, payoutPerSet: 2, roi: 0.1 / 1.9 }));
    expect(d.buy).toBe("Buy NO on all 3 choices on Kalshi (186¢ in all).");
    expect(d.putIn).toBe(93);
    expect(d.keep).toBeCloseTo(5, 2);
  });

  it("a price gap that isn't a lock says so", () => {
    const d = simpleDeal(row({ kind: "second_opinion", legs: [row().legs[0]!], gapCents: 6 }));
    expect(d.lock).toBe(false);
    expect(d.buy).toBe("Kalshi sells YES for 55¢. The other app asks 61¢.");
  });

  it("per set: the fee is what the return leaves over the share prices", () => {
    const s = perSet(row());
    expect(s.cost).toBeCloseTo(0.95, 9);
    expect(s.fee).toBeCloseTo(0.0294, 9);
    expect(s.keep).toBeCloseTo(0.0206, 9);
  });

  it("money drops the cents on whole dollars", () => {
    expect([money(95), money(4.6), money(1280), money(0.4)]).toEqual(["$95", "$4.60", "$1,280", "$0.40"]);
  });
});

describe("Show me how", () => {
  it("starts at the card's amount and splits it into the same shares on both apps", () => {
    const r = howTo(row(), startAmount(row()));
    expect(r.reason).toBe("ok");
    expect(r.steps.map(s => [s.venueName, s.side, s.shares, s.spend])).toEqual([["Kalshi", "YES", 100, 55], ["Polymarket US", "NO", 100, 40]]);
    expect(r).toMatchObject({ spend: 95, back: 100, keep: 2.06, fees: 2.94, capped: false });
  });

  it("updates with the amount typed, in whole shares", () => {
    const r = howTo(row(), 50);
    expect(r.steps.map(s => s.shares)).toEqual([52, 52]);
    expect(r.spend).toBe(49.4);
    expect(r.back).toBe(52);
  });

  it("caps at what the deal can take when the viewer knows its size", () => {
    expect(howTo(row(), 10_000)).toMatchObject({ capped: true, spend: 95, back: 100 });
    // Free rows carry no size, so nothing to cap at.
    expect(howTo(row({ sets: null }), 1_900)).toMatchObject({ capped: false, spend: 1_900, back: 2_000 });
  });

  it("says so when the amount buys nothing", () => {
    expect(howTo(row(), 0.5).reason).toBe("too_small");
    expect(howTo(row(), Number.NaN).reason).toBe("empty");
  });
});

describe("when it pays out", () => {
  it("rough: the same everywhere", () => {
    expect(paysOutRough(NOW + 3.2 * 86_400_000, NOW)).toBe("in 3 days");
    expect(paysOutRough(NOW + 20 * 3_600_000, NOW)).toBe("within a day");
    expect(paysOutRough(null, NOW)).toBe("when it ends");
  });
  it("local: a day name and part of day this week", () => {
    const now = new Date(2026, 9, 26, 10, 0).getTime(); // a Monday morning, local time
    expect(paysOutLocal(new Date(2026, 9, 26, 22, 0).getTime(), now)).toBe("tonight");
    expect(paysOutLocal(new Date(2026, 9, 27, 9, 0).getTime(), now)).toBe("tomorrow morning");
    expect(paysOutLocal(new Date(2026, 10, 1, 22, 30).getTime(), now)).toBe("Sunday night");
    expect(paysOutLocal(new Date(2026, 10, 20, 12, 0).getTime(), now)).toBe("Nov 20 (in 25 days)");
  });
});

describe("Simple-view words", () => {
  const ROOT = join(__dirname, "..");
  const files = [...readdirSync(join(ROOT, "components/simple")).filter(f => f.endsWith(".tsx")).map(f => "components/simple/" + f), "lib/simple.ts", "components/Help.tsx"];
  /** User-facing text only: string literals and JSX text, comments removed. */
  const literals = (src: string) => {
    const s = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    return [...s.matchAll(/"([^"\n]*)"|`([^`]*)`|>([^<>{}]+)</g)].map(m => m[1] ?? m[2] ?? m[3] ?? "").join("\n");
  };
  it("never shows fill, order book, taker fee, ROI or arbitrage", () => {
    for (const f of files) {
      const text = literals(readFileSync(join(ROOT, f), "utf8"));
      expect(text, f).not.toMatch(/\b(fills?|order ?books?|taker|arbitrage|liquidity|spread|contracts?|venues?)\b/i);
      expect(text, f).not.toMatch(/\bROI\b/);
    }
  });
  it("every \"?\" is one or two short sentences", () => {
    for (const [k, t] of Object.entries(HELP)) {
      expect(t.split(/[.!?](\s|$)/).filter(x => x.trim()).length, k).toBeLessThanOrEqual(2);
      expect(t.length, k).toBeLessThan(120);
    }
  });
});
