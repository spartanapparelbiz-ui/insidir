/* The live pipe's rules: what each viewer may receive and when (delay, region, redaction), the stream cursors, the
 * worker's price ticks, and the numbers the live elements quote. */
import { describe, expect, it } from "vitest";
import type { FeedViewer } from "@/lib/feed";
import { MAX_PER_TICK, ViewerCursor } from "@/lib/live/hub";
import { dealClosed, dealFound, priceTick, TICK_MIN_MS, whale } from "@/lib/live/publish";
import { flaggedAtStake, median, medianGapMin } from "@/lib/live/stats";
import type { RawLiveEvent } from "@/lib/live/types";
import { delayFor, viewEvent } from "@/lib/live/view";
import type { Opportunity, WhaleTrade } from "@/lib/types";

const NOW = Date.UTC(2026, 9, 26, 12);
const MIN = 60_000;

function opp(id: string, venues: Array<"kalshi" | "polymarket" | "polymarket_us"> = ["kalshi", "polymarket_us"], over: Partial<Opportunity> = {}): Opportunity {
  return {
    id, kind: "cross_arb", title: `Deal ${id}`,
    legs: venues.map((v, i) => ({ venue: v, marketId: `${v}-${id}`, side: i ? "no" : "yes", label: "Yes", url: `https://example.test/${v}`, contracts: 100, avgPrice: i ? 0.4 : 0.55, worstPrice: i ? 0.4 : 0.55, cost: i ? 40 : 55, fee: 1 })),
    sets: 100, cost: 95, fees: 2.94, payout: 100, profit: 2.06, roi: 0.021, days: 10, profitPerDay: 0.206, safety: "green", safetyNotes: [],
    categories: ["sports"], closeTime: NOW + 10 * 86_400_000, pairId: null, gapCents: null, ...over,
  };
}
const viewer = (over: Partial<FeedViewer> = {}): FeedViewer => ({ plan: "free", region: "us", minRoi: 0, minSizeUsd: 0, categories: [], venues: ["kalshi", "polymarket", "polymarket_us"], showYellow: true, showRed: false, ...over });
let nextId = 1;
const raw = (r: { type: RawLiveEvent["type"]; oppId: string | null; venues: RawLiveEvent["venues"]; data: Record<string, unknown>; at: Date }): RawLiveEvent =>
  ({ id: nextId++, type: r.type, oppId: r.oppId, venues: r.venues, data: r.data as unknown as RawLiveEvent["data"], at: r.at.getTime() });

describe("who sees a live event, and when", () => {
  const found = raw(dealFound(opp("A"), new Date(NOW)));
  it("paid viewers get a new deal at once, with the numbers", () => {
    const e = viewEvent(found, viewer({ plan: "pro" }), NOW);
    expect(e?.type).toBe("deal_found");
    expect(e?.type === "deal_found" && e.data.row.profit).toBeCloseTo(2.06);
  });
  it("free viewers get it 30 minutes later, redacted like the feed", () => {
    expect(viewEvent(found, viewer(), NOW + 29 * MIN)).toBeNull();
    const e = viewEvent(found, viewer(), NOW + 30 * MIN);
    expect(e?.type === "deal_found" && [e.data.row.profit, e.data.row.cost, e.data.row.sets, e.data.row.locked]).toEqual([null, null, null, true]);
  });
  it("a US viewer never gets international Polymarket, a non-US viewer does", () => {
    const intl = raw(dealFound(opp("B", ["kalshi", "polymarket"]), new Date(NOW)));
    expect(viewEvent(intl, viewer({ plan: "pro", region: "us" }), NOW)).toBeNull();
    expect(viewEvent(intl, viewer({ plan: "pro", region: null }), NOW)).toBeNull();
    expect(viewEvent(intl, viewer({ plan: "pro", region: "non_us" }), NOW)).not.toBeNull();
  });
  it("a closed deal is history: everyone in the region sees it at once (the members-vs-you moment)", () => {
    const closed = raw(dealClosed(opp("C"), new Date(NOW - 12 * MIN), new Date(NOW - 2 * MIN), new Date(NOW)));
    const e = viewEvent(closed, viewer(), NOW);
    expect(e?.type === "deal_closed" && e.data.lifeMs).toBe(10 * MIN);
    expect(delayFor(closed, viewer())).toBe(0);
  });
  it("price ticks: free gets prices and ROI, never dollars", () => {
    const prev = opp("D");
    const next = opp("D", undefined, { legs: prev.legs.map((l, i) => ({ ...l, avgPrice: i ? 0.41 : 0.55 })), roi: 0.019 });
    const t = priceTick(prev, next, new Date(NOW - 40 * MIN), new Date(NOW), new Map());
    expect(t).not.toBeNull();
    const free = viewEvent(raw(t!), viewer(), NOW + 30 * MIN);
    expect(free?.type === "price_tick" && free.data).toMatchObject({ roi: 0.019, profit: null, cost: null, sets: null });
    expect(free?.type === "price_tick" && free.data.legs.map(l => l.priceCents)).toEqual([55, 41]);
  });
  it("big trades are Pro's in real time; others get them 30 minutes late, and US never (international Polymarket)", () => {
    const w: WhaleTrade = { venue: "polymarket", wallet: "0x1", name: null, marketId: "m", marketTitle: "Market", outcome: "Yes", side: "BUY", contracts: 20_000, price: 0.6, cash: 12_000, timestamp: NOW, txHash: "0xa", url: "https://example.test" };
    const e = raw(whale(w));
    expect(viewEvent(e, viewer({ plan: "pro", region: "non_us" }), NOW)).not.toBeNull();
    expect(viewEvent(e, viewer({ plan: "insidir", region: "non_us" }), NOW)).toBeNull();
    expect(viewEvent(e, viewer({ plan: "free", region: "non_us" }), NOW + 30 * MIN)).not.toBeNull();
    expect(viewEvent(e, viewer({ plan: "pro", region: "us" }), NOW)).toBeNull();
  });
});

describe("the worker's price ticks", () => {
  it("only when a price moved, at most once per deal per TICK_MIN_MS", () => {
    const a = opp("E");
    expect(priceTick(a, a, new Date(NOW), new Date(NOW), new Map())).toBeNull();
    const b = opp("E", undefined, { legs: a.legs.map(l => ({ ...l, avgPrice: l.avgPrice + 0.01 })) });
    expect(priceTick(a, b, new Date(NOW), new Date(NOW), new Map([["E", NOW - TICK_MIN_MS + 1]]))).toBeNull();
    expect(priceTick(a, b, new Date(NOW), new Date(NOW), new Map([["E", NOW - TICK_MIN_MS]]))).not.toBeNull();
  });
});

describe("a stream's cursor", () => {
  it("a free viewer's backlog holds only what's already due; later events arrive when due, in order", () => {
    const old = raw(dealFound(opp("F"), new Date(NOW - 40 * MIN)));
    const recent = raw(dealFound(opp("G"), new Date(NOW - 5 * MIN)));
    const c = new ViewerCursor(viewer());
    expect(c.backlog([old, recent], NOW).map(e => e.oppId)).toEqual(["F"]);
    expect(c.next([old, recent], NOW)).toEqual([]);
    expect(c.next([old, recent], NOW + 25 * MIN).map(e => e.oppId)).toEqual(["G"]);
    expect(c.next([old, recent], NOW + 26 * MIN)).toEqual([]);
  });
  it("coalesces price ticks to the latest per deal and caps a burst", () => {
    const base = opp("H");
    const ticks = [1, 2, 3].map(i => raw(priceTick(base, opp("H", undefined, { legs: base.legs.map(l => ({ ...l, avgPrice: l.avgPrice + i / 100 })) }), new Date(NOW), new Date(NOW + i), new Map())!));
    const c = new ViewerCursor(viewer({ plan: "pro" }));
    const out = c.next(ticks, NOW + 10);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(ticks[2]!.id);
    const burst = Array.from({ length: 30 }, (_, i) => raw(dealFound(opp(`B${i}`), new Date(NOW + i))));
    expect(new ViewerCursor(viewer({ plan: "pro" })).next(burst, NOW + 100)).toHaveLength(MAX_PER_TICK);
  });
});

describe("live numbers", () => {
  it("median and median gap between finds", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(medianGapMin([0, MIN])).toBeNull();
    expect(medianGapMin([0, 4 * MIN, 6 * MIN, 16 * MIN])).toBe(4);
  });
  it("profit flagged at $500: scaled to what $500 buys, capped at what was fillable", () => {
    expect(flaggedAtStake({ profit: 2.06, cost: 95, fees: 2.94 })).toBeCloseTo(2.06); // only $97.94 fillable
    expect(flaggedAtStake({ profit: 20.6, cost: 950, fees: 29.4 })).toBeCloseTo(20.6 * 500 / 979.4);
    expect(flaggedAtStake({ profit: -1, cost: 95, fees: 2 })).toBe(0);
  });
});
