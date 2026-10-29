import { describe, expect, it } from "vitest";
import {
  byWeek, followLine, landingReceipts, outsideDelay, perDollar, planCards, planFeatures, publicFeedViewer, realCrossArb, startOfTodayUTC, tally,
  visibleReceipts, weekStartUTC,
} from "@/components/landing/model";
import { exampleMath } from "@/components/landing/HowItWorks";
import { feedFor, type StoredOpp } from "@/lib/feed";
import { entitlements, PLANS } from "@/lib/plans";
import type { ReceiptRow } from "@/lib/queries";
import type { Leg, Opportunity, Venue } from "@/lib/types";

/* SYNTHETIC rows for the pure helpers; no real market. */
const NOW = Date.UTC(2026, 9, 25, 15, 0); // Sunday 2026-10-25 15:00 UTC
const leg = (venue: Venue, side: "yes" | "no", price: number): Leg => ({ venue, marketId: venue + "-m", side, label: side, url: "https://example.invalid/" + venue,
  contracts: 100, avgPrice: price, worstPrice: price, cost: 100 * price, fee: 1 });
const opp = (o: Partial<Opportunity> = {}): Opportunity => ({
  id: "x", kind: "cross_arb", title: "Example", legs: [leg("kalshi", "yes", 0.55), leg("polymarket_us", "no", 0.4)], sets: 100, cost: 95, fees: 2, payout: 100,
  profit: 3, roi: 3 / 97, days: 3, profitPerDay: 1, safety: "green", safetyNotes: [], categories: [], closeTime: null, pairId: "p", gapCents: null, ...o,
});
let nextId = 1;
const rcpt = (o: Partial<Opportunity>, ageMin: number, settled?: { sameWay: boolean; profit: number; ageMin?: number }): ReceiptRow => ({
  id: nextId++, snapshot: opp(o), detectedAt: NOW - ageMin * 60_000,
  settledAt: settled ? NOW - (settled.ageMin ?? 0) * 60_000 : null, sameWay: settled ? settled.sameWay : null, realizedProfit: settled ? settled.profit : null,
});

describe("receipts helpers", () => {
  it("follow line: settled green locks only, capped at the fillable outlay, fees included; null without any", () => {
    const rows = [
      rcpt({ cost: 950, fees: 50 }, 600, { sameWay: true, profit: 30 }),   // outlay $1000 → $500 used → +15
      rcpt({ cost: 190, fees: 10 }, 500, { sameWay: true, profit: 6 }),     // outlay $200 → all used → +6
      rcpt({ safety: "yellow" }, 400, { sameWay: true, profit: 100 }),      // not green: ignored
      rcpt({ cost: 95, fees: 5 }, 300, { sameWay: false, profit: -40 }),    // settled differently: real result counted
      rcpt({}, 200),                                                        // open: not counted
    ];
    const res = followLine(rows);
    expect(res).not.toBeNull();
    expect(res?.count).toBe(3);
    expect(res?.staked).toBeCloseTo(800);
    expect(res?.realizedProfit).toBeCloseTo(15 + 6 - 40);
    expect(res?.broken).toBe(1);
    expect(res?.pending).toBe(1);
    expect(followLine([rcpt({}, 10)])).toBeNull();
    expect(followLine([rcpt({ safety: "yellow" }, 10, { sameWay: true, profit: 5 })])).toBeNull();
  });

  it("tally and landing order: settled (newest settlement first, wins and misses alike), then open", () => {
    const a = rcpt({}, 900, { sameWay: true, profit: 3, ageMin: 100 });
    const b = rcpt({}, 800, { sameWay: false, profit: -2, ageMin: 10 });
    const c = rcpt({}, 5);
    expect(landingReceipts([a, b, c]).map(r => r.id)).toEqual([b.id, a.id, c.id]);
    expect(tally([a, b, c])).toEqual({ total: 3, settled: 2, sameWay: 1, differently: 1, open: 1 });
  });

  it("US and unknown regions never see international Polymarket receipts; price gaps are not listed", () => {
    const intl = rcpt({ legs: [leg("kalshi", "yes", 0.5), leg("polymarket", "no", 0.45)] }, 60);
    const us = rcpt({}, 60);
    const gap = rcpt({ kind: "second_opinion" }, 60);
    expect(visibleReceipts([intl, us, gap], "us").map(r => r.id)).toEqual([us.id]);
    expect(visibleReceipts([intl, us, gap], null).map(r => r.id)).toEqual([us.id]);
    expect(visibleReceipts([intl, us, gap], "non_us").map(r => r.id)).toEqual([intl.id]);
  });

  it("free viewers don't see deals younger than the feed delay in the public log", () => {
    const fresh = rcpt({}, 5), old = rcpt({}, 45);
    expect(outsideDelay([fresh, old], entitlements("free"), NOW).map(r => r.id)).toEqual([old.id]);
    expect(outsideDelay([fresh, old], entitlements("insidir"), NOW)).toHaveLength(2);
  });

  it("UTC day and Monday week boundaries", () => {
    expect(startOfTodayUTC(NOW)).toBe(Date.UTC(2026, 9, 25));
    expect(weekStartUTC(NOW)).toBe(Date.UTC(2026, 9, 19)); // Sunday belongs to the week starting Monday the 19th
    expect(weekStartUTC(Date.UTC(2026, 9, 19, 0, 0, 1))).toBe(Date.UTC(2026, 9, 19));
    const weeks = byWeek([rcpt({}, 60), rcpt({}, 60 * 24 * 8)]);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]!.start).toBeGreaterThan(weeks[1]!.start);
  });
});

describe("pricing cards come from PLANS", () => {
  it("prices, names and taglines match", () => {
    const cards = planCards();
    expect(cards.map(c => c.plan)).toEqual(["free", "insidir"]);
    for (const c of cards) {
      expect(c.price).toBe(PLANS[c.plan].price);
      expect(c.name).toBe(PLANS[c.plan].name);
      expect(c.tagline).toBe(PLANS[c.plan].tagline);
    }
    expect(cards.map(c => c.price)).toEqual([0, 39]);
  });

  it("features follow the entitlements", () => {
    const free = planFeatures(PLANS.free.entitlements);
    expect(free).toEqual(expect.arrayContaining(["Feed delayed 30 min", "Top 3 deals", "Sizes and dollar net P&L hidden", "Daily email digest"]));
    const ins = planFeatures(PLANS.insidir.entitlements);
    expect(ins).toEqual(expect.arrayContaining(["Full live feed", "Instant push alerts, in seconds", "Calculator", "Whale tracker", "Full receipts history"]));
  });
});

describe("hero widget and how-it-works data", () => {
  it("the public viewer is free (delayed, sizes withheld) and region-scoped", () => {
    const s = (o: Opportunity, ageMin: number): StoredOpp => ({ live: o, snapshot: o, firstSeenAt: NOW - ageMin * 60_000, lastSeenAt: NOW, active: true });
    const rows = feedFor([s(opp({ id: "new", profitPerDay: 9 }), 5), s(opp({ id: "old" }), 40),
      s(opp({ id: "intl", profitPerDay: 8, legs: [leg("kalshi", "yes", 0.5), leg("polymarket", "no", 0.4)] }), 40)], publicFeedViewer(null), NOW);
    expect(rows.map(r => r.id)).toEqual(["old"]);
    expect(rows[0]?.profit).toBeNull();
    expect(realCrossArb(rows)?.id).toBe("old");
    expect(realCrossArb(rows.map(r => ({ ...r, safety: "yellow" as const })))).toBeNull();
  });

  it("the labelled example's fees are computed with the real fee functions", () => {
    const m = exampleMath();
    expect(m.cost).toBeCloseTo(95);
    expect(m.fees).toBeCloseTo(1.74 + 1.2); // Kalshi rounds up to the cent; Polymarket sports 5%
    expect(m.profit).toBeCloseTo(2.06);
    expect(m.profit).toBeGreaterThan(0);
  });

  it("hero per-$1 math: prices, what you pay, fees per set and what's left of the $1; no dollar size", () => {
    const m = perDollar(opp({ sets: 100, fees: 2.9, payout: 100 }));
    expect(m).toEqual({ aCents: 55, bCents: 40, inCents: 95, feeCents: 2.9, profitCents: 2.1, roi: 3 / 97 });
    expect(perDollar(opp({ legs: [leg("kalshi", "yes", 0.5)] }))).toBeNull();
    expect(Object.keys(m ?? {})).not.toContain("profit");
  });
});
