/* The landing hero is never empty: a live deal, else the last real deal (receipts, 7 days), else the closest matched
 * market (not a deal, labelled so). And the stat block: today's count, else this week's, else hidden. */
import { describe, expect, it } from "vitest";
import { dealCount, heroSplit, heroView, lastDeal, nearestMarket } from "@/components/landing/model";
import { findNearMisses } from "@/lib/engines/near-miss";
import type { ArbInput } from "@/lib/engines/arb";
import type { NearMiss } from "@/lib/engines/near-miss";
import type { StoredOpp } from "@/lib/feed";
import type { Book, MarketPair, Opportunity, VMarket, Venue } from "@/lib/types";

const NOW = Date.UTC(2026, 9, 26, 12);
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

function opp(id: string, venues: [Venue, Venue] = ["kalshi", "polymarket_us"], over: Partial<Opportunity> = {}): Opportunity {
  return {
    id, kind: "cross_arb", title: `Deal ${id}`,
    legs: venues.map((v, i) => ({ venue: v, marketId: `${v}-${id}`, side: i ? "no" : "yes", label: "Yes", url: "https://example.test", contracts: 100, avgPrice: i ? 0.4 : 0.55, worstPrice: i ? 0.4 : 0.55, cost: i ? 40 : 55, fee: 1 })),
    sets: 100, cost: 95, fees: 2.94, payout: 100, profit: 2.06, roi: 0.021, days: 10, profitPerDay: 0.206, safety: "green", safetyNotes: [],
    categories: ["sports"], closeTime: NOW + 10 * DAY, pairId: null, gapCents: null, ...over,
  };
}
const stored = (o: Opportunity, firstSeenAt: number, lastSeenAt: number, active: boolean): StoredOpp => ({ live: o, snapshot: o, firstSeenAt, lastSeenAt, active });

describe("hero (a): a live deal", () => {
  it("only a deal still open on the viewer's clock", () => {
    const open = stored(opp("A"), NOW - 2 * HOUR, NOW, true);
    const gone = stored(opp("B"), NOW - HOUR, NOW - 50 * MIN, false);
    expect(heroSplit([gone, open], "us", 0, NOW)?.oppId).toBe("A");
    expect(heroSplit([gone], "us", 0, NOW)).toBeNull();
    // Free: B was still being found 30 minutes ago (on their clock), so it is live for them.
    expect(heroSplit([gone], "us", 30 * MIN, NOW + 10 * MIN)?.oppId).toBeUndefined();
    expect(heroSplit([stored(opp("C"), NOW - 2 * HOUR, NOW - 20 * MIN, false)], "us", 30 * MIN, NOW)?.oppId).toBe("C");
  });
});

describe("hero (b): the last real deal", () => {
  const row = (id: string, detectedAt: number, closedAt: number, over: Partial<Opportunity> = {}) => ({ snapshot: opp(id, undefined, over), detectedAt, closedAt });
  it("the most recently closed green two-venue deal in 7 days, on the viewer's clock and region", () => {
    const rows = [row("old", NOW - 3 * DAY, NOW - 3 * DAY + HOUR), row("new", NOW - 5 * HOUR, NOW - 2 * HOUR), row("yellow", NOW - HOUR, NOW - 30 * MIN, { safety: "yellow" })];
    const s = lastDeal(rows, "us", 0, NOW);
    expect([s?.oppId, s?.closedAt]).toEqual(["new", NOW - 2 * HOUR]);
    expect(lastDeal([row("week", NOW - 8 * DAY, NOW - 7 * DAY)], "us", 0, NOW)).toBeNull();
    // Free viewers never hear of a deal before the feed would show it.
    expect(lastDeal([row("fresh", NOW - 20 * MIN, NOW - 10 * MIN)], "us", 30 * MIN, NOW)).toBeNull();
    // US viewers never see international Polymarket.
    expect(lastDeal([{ snapshot: opp("intl", ["kalshi", "polymarket"]), detectedAt: NOW - HOUR, closedAt: NOW - 50 * MIN }], "us", 0, NOW)).toBeNull();
  });
});

describe("hero (c): the closest matched market", () => {
  const book = (yes: number, no: number): Book => ({ yesAsks: [{ price: yes, size: 100 }], noAsks: [{ price: no, size: 100 }], yesBids: [], noBids: [], fetchedAt: NOW, hash: null });
  const market = (venue: Venue, id: string): VMarket => ({
    venue, id, eventId: id, seriesId: null, title: "Will the Jets win?", eventTitle: null, yesLabel: "Yes", noLabel: "No", rules: "", resolutionSource: null,
    closeTime: NOW + DAY, category: "sports", fee: venue === "kalshi" ? { venue: "kalshi", multiplier: 0.07 } : { venue, rate: 0 } as VMarket["fee"], url: "https://example.test",
    yesTokenId: null, noTokenId: null, strike: null, active: true, result: null, volume24h: null,
  });
  const pair = (a: VMarket, b: VMarket, safety: MarketPair["safety"] = "green"): MarketPair =>
    ({ id: `${a.venue}:${a.id}|${b.venue}:${b.id}`, a: { venue: a.venue, id: a.id }, b: { venue: b.venue, id: b.id }, inverted: false, method: "deterministic", confidence: 1, safety, safetyNotes: [], blocked: false });
  it("keeps the cheapest both-sides cost per venue pair, green pairs only", () => {
    const k = market("kalshi", "K1"), u = market("polymarket_us", "U1"), k2 = market("kalshi", "K2"), u2 = market("polymarket_us", "U2");
    const inputs: ArbInput[] = [
      { pair: pair(k, u), a: k, b: u, bookA: book(0.52, 0.5), bookB: book(0.55, 0.49) },
      { pair: pair(k2, u2, "yellow"), a: k2, b: u2, bookA: book(0.3, 0.3), bookB: book(0.3, 0.3) },
    ];
    const [n] = findNearMisses(inputs);
    expect(n?.totalCents).toBe(101);
    expect(n?.legs.map(l => [l.venue, l.side, l.priceCents])).toEqual([["kalshi", "yes", 52], ["polymarket_us", "no", 49]]);
  });
  it("picks the closest one the viewer's region can trade", () => {
    const nm = (venues: [Venue, Venue], total: number): NearMiss => ({ venues, pairId: venues.join("|"), title: "T", legs: venues.map(v => ({ venue: v, marketId: "m", side: "yes", label: "", priceCents: total / 2 })), totalCents: total, at: NOW });
    const list = [nm(["kalshi", "polymarket"], 100.5), nm(["kalshi", "polymarket_us"], 101)];
    expect(nearestMarket(list, "us")?.totalCents).toBe(101);
    expect(nearestMarket(list, "non_us")?.totalCents).toBe(100.5);
  });
});

describe("hero order and the stat block", () => {
  it("live, else last, else near; null only with no data at all", () => {
    const s = heroSplit([stored(opp("A"), NOW - HOUR, NOW, true)], "us", 0, NOW)!;
    const near = { title: "T", legs: s.legs, totalCents: 101, at: NOW };
    expect(heroView(s, s, near)?.mode).toBe("live");
    expect(heroView(null, s, near)?.mode).toBe("last");
    expect(heroView(null, null, near)?.mode).toBe("near");
    expect(heroView(null, null, null)).toBeNull();
  });
  it("today's count, else this week's, else hidden", () => {
    expect(dealCount(3, 9)).toEqual({ label: "Deals found today", n: 3, period: "today" });
    expect(dealCount(0, 9)).toEqual({ label: "Deals this week", n: 9, period: "week" });
    expect(dealCount(0, 0)).toBeNull();
  });
});
