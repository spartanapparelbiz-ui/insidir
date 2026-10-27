import { describe, expect, it } from "vitest";
import { dealViewFrom } from "@/lib/deal-view";
import type { StoredOpp } from "@/lib/feed";
import type { Leg, Opportunity, VMarket, Venue } from "@/lib/types";

/* SYNTHETIC opportunities and markets; no real market. */
const NOW = 1_800_000_000_000;
const leg = (venue: Venue, side: "yes" | "no", price: number): Leg => ({ venue, marketId: venue + "-m", side, label: side.toUpperCase() + " on " + venue,
  url: "https://example.invalid/" + venue, contracts: 123, avgPrice: price, worstPrice: price + 0.01, cost: 123 * price, fee: 1.37 });
const opp = (id: string, o: Partial<Opportunity> = {}): Opportunity => ({
  id, kind: "cross_arb", title: "Example event " + id, legs: [leg("kalshi", "yes", 0.55), leg("polymarket_us", "no", 0.4)], sets: 123, cost: 116.85, fees: 2.74,
  payout: 123, profit: 3.41, roi: 3.41 / 119.59, days: 10, profitPerDay: 0.341, safety: "green", safetyNotes: [], categories: ["sports"], closeTime: NOW + 10 * 86_400_000,
  pairId: "p", gapCents: null, ...o,
});
const stored = (o: Opportunity, ageMin: number, active = true): StoredOpp => ({ live: o, snapshot: o, firstSeenAt: NOW - ageMin * 60_000, lastSeenAt: NOW, active });
const market = (venue: Venue): VMarket => ({
  venue, id: venue + "-m", eventId: "e", seriesId: null, title: "Example market on " + venue, eventTitle: null, yesLabel: "Yes", noLabel: "No",
  rules: "Example rules for " + venue, resolutionSource: null, closeTime: NOW + 10 * 86_400_000, category: "sports",
  fee: venue === "kalshi" ? { venue: "kalshi", multiplier: 1 } : { venue, rate: 0.05 }, url: "https://example.invalid/" + venue, yesTokenId: null, noTokenId: null,
  strike: null, active: true, result: null, volume24h: null,
});
const markets = new Map((["kalshi", "polymarket", "polymarket_us"] as const).map(v => [`${v}:${v}-m`, market(v)]));

describe("the deal paywall (lib/deal-view.ts, shared by the deal page and /api/deal/[id])", () => {
  it("free viewer, delayed deal: no paid field, no fills, no calculator; rules and legs are there", () => {
    const v = dealViewFrom(stored(opp("old"), 45), markets, { plan: "free", region: "us" }, NOW);
    expect(v.state).toBe("ok");
    if (v.state !== "ok") return;
    expect(v.paid).toBe(false);
    expect(v.row.locked).toBe(true);
    expect([v.row.profit, v.row.cost, v.row.fees, v.row.sets, v.row.profitPerDay]).toEqual([null, null, null, null, null]);
    expect(v.fills).toEqual([null, null]);
    expect(v.calc).toBeNull();
    expect(v.rules.map(r => r.rules)).toEqual(["Example rules for kalshi", "Example rules for polymarket_us"]);
    const json = JSON.stringify(v);
    // None of the paid numbers appear anywhere in what would be sent.
    for (const n of ["3.41", "116.85", "2.74", "1.37", "123", "0.341"]) expect(json, n).not.toContain(n);
  });

  it("free viewer, deal under 30 minutes old: 'too_new' and nothing about the deal", () => {
    const v = dealViewFrom(stored(opp("fresh"), 5), markets, { plan: "free", region: "us" }, NOW);
    expect(v).toEqual({ state: "too_new" });
  });

  it("US viewers can't open an international Polymarket deal, on any plan", () => {
    const intl = stored(opp("intl", { legs: [leg("kalshi", "yes", 0.5), leg("polymarket", "no", 0.45)] }), 45);
    for (const plan of ["free", "insidir"] as const) {
      expect(dealViewFrom(intl, markets, { plan, region: "us" }, NOW)).toEqual({ state: "not_found" });
      expect(dealViewFrom(intl, markets, { plan, region: null }, NOW)).toEqual({ state: "not_found" });
    }
    expect(dealViewFrom(intl, markets, { plan: "insidir", region: "non_us" }, NOW).state).toBe("ok");
  });

  it("paid viewer: live numbers, fills and the calculator; a closed deal keeps its numbers but no calculator", () => {
    const v = dealViewFrom(stored(opp("live"), 5), markets, { plan: "insidir", region: "us" }, NOW);
    if (v.state !== "ok") throw new Error(v.state);
    expect(v.row.profit).toBe(3.41);
    expect(v.fills[0]).toEqual({ contracts: 123, worstPriceCents: 56, cost: 123 * 0.55, fee: 1.37 });
    expect(v.calc?.maxSets).toBe(123);
    expect(v.calc?.legs[0]?.fee).toEqual({ venue: "kalshi", multiplier: 1 });
    const gone = dealViewFrom(stored(opp("gone"), 60, false), markets, { plan: "insidir", region: "us" }, NOW);
    if (gone.state !== "ok") throw new Error(gone.state);
    expect(gone.gone).toBe(true);
    expect(gone.calc).toBeNull();
  });

  it("unknown deal: not_found", () => {
    expect(dealViewFrom(null, markets, { plan: "insidir", region: "us" }, NOW)).toEqual({ state: "not_found" });
  });
});
