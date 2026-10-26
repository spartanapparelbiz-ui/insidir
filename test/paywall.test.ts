import { describe, expect, it } from "vitest";
import { feedFor, playText, type FeedViewer, type StoredOpp } from "@/lib/feed";
import { allowedVenues } from "@/lib/region";
import type { Leg, Opportunity, Venue } from "@/lib/types";

/* SYNTHETIC opportunities; no real market. */
const NOW = 1_800_000_000_000;
const leg = (venue: Venue, side: "yes" | "no", price: number): Leg => ({ venue, marketId: venue + "-m", side, label: side.toUpperCase() + " on " + venue,
  url: "https://example.invalid/" + venue, contracts: 100, avgPrice: price, worstPrice: price, cost: 100 * price, fee: 1 });
const opp = (id: string, o: Partial<Opportunity> = {}): Opportunity => ({
  id, kind: "cross_arb", title: "Example event " + id, legs: [leg("kalshi", "yes", 0.55), leg("polymarket_us", "no", 0.4)], sets: 100, cost: 95, fees: 2,
  payout: 100, profit: 3, roi: 3 / 97, days: 10, profitPerDay: 0.3, safety: "green", safetyNotes: [], categories: ["sports"], closeTime: NOW + 10 * 86_400_000,
  pairId: "p", gapCents: null, ...o,
});
const stored = (o: Opportunity, ageMin: number, active = true): StoredOpp => ({
  live: { ...o, profit: o.profit * 2 }, snapshot: o, firstSeenAt: NOW - ageMin * 60_000, lastSeenAt: NOW, active,
});
const viewer = (o: Partial<FeedViewer> = {}): FeedViewer => ({ plan: "free", region: "us", minRoi: 0, minSizeUsd: 0, categories: [], venues: ["kalshi", "polymarket", "polymarket_us"],
  showYellow: true, showRed: false, ...o });

describe("the feed paywall (server-side redaction)", () => {
  const opps = [
    stored(opp("fresh", { profitPerDay: 9 }), 5),              // found 5 minutes ago: not in the free feed yet
    ...[1, 2, 3, 4].map(i => stored(opp("old" + i, { profitPerDay: i }), 45)),
    stored(opp("intl", { legs: [leg("kalshi", "yes", 0.5), leg("polymarket", "no", 0.45)] }), 60),
    stored(opp("red", { safety: "red" }), 60),
  ];

  it("free: delayed 30 minutes, top 3 only, sizes and dollar profit never sent, snapshot prices", () => {
    const rows = feedFor(opps, viewer(), NOW);
    expect(rows.map(r => r.id)).toEqual(["old4", "old3", "old2"]);
    for (const r of rows) {
      expect(r.locked).toBe(true);
      expect([r.profit, r.cost, r.fees, r.sets, r.profitPerDay]).toEqual([null, null, null, null, null]);
    }
    const json = JSON.stringify(rows);
    expect(json).not.toMatch(/"profit":\d|"sets":\d|"cost":\d/);
  });

  it("paid: live state, every active row, sizes included, inactive dropped", () => {
    const rows = feedFor([...opps, stored(opp("gone"), 60, false)], viewer({ plan: "insidir" }), NOW);
    expect(rows[0]?.id).toBe("fresh");
    expect(rows.find(r => r.id === "old1")?.profit).toBe(6); // live state, not the snapshot
    expect(rows.some(r => r.id === "gone")).toBe(false);
    expect(rows.every(r => !r.locked && r.sets === 100)).toBe(true);
  });

  it("US viewers never see the international Polymarket site; anonymous visitors get the US set", () => {
    expect(feedFor(opps, viewer({ plan: "pro", region: "us" }), NOW).some(r => r.id === "intl")).toBe(false);
    expect(feedFor(opps, viewer({ plan: "pro", region: null }), NOW).some(r => r.id === "intl")).toBe(false);
    expect(feedFor(opps, viewer({ plan: "pro", region: "non_us", venues: [] }), NOW).some(r => r.id === "intl")).toBe(true);
    expect(allowedVenues("us", ["polymarket", "kalshi"])).toEqual(["kalshi"]);
    expect(allowedVenues("non_us")).not.toContain("polymarket_us");
  });

  it("red is hidden unless the user opts in; filters apply", () => {
    expect(feedFor(opps, viewer({ plan: "pro" }), NOW).some(r => r.id === "red")).toBe(false);
    expect(feedFor(opps, viewer({ plan: "pro", showRed: true }), NOW).some(r => r.id === "red")).toBe(true);
    expect(feedFor(opps, viewer({ plan: "pro", minSizeUsd: 1_000 }), NOW)).toEqual([]);
    expect(feedFor(opps, viewer({ plan: "pro", categories: ["politics"] }), NOW)).toEqual([]);
  });

  it("states the play in plain English without advice", () => {
    expect(playText(opp("x"))).toBe("Buy YES on Kalshi at 55¢ + NO on Polymarket US at 40¢");
    expect(playText(opp("x"))).not.toMatch(/should|guarantee|risk-free/i);
  });
});
