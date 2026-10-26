/* One deal as one viewer may see it: the single paywall for a deal, shared by the deal page (app/deal/[id]) and the
 * detail sheet's JSON route (GET /api/deal/[id]) so the two can't drift.
 *
 * It reuses the feed's redaction (lib/feed.ts feedFor) with the viewer's plan and region, minus their own filters
 * (they asked for this deal). Free viewers get the delayed snapshot with size, cost, fees, sets and dollar profit
 * removed, no per-leg fills and no calculator; a deal too new for the delayed feed comes back as "too_new" with
 * nothing about it. Region always applies: a US viewer asking for an international Polymarket deal gets
 * "not_found". Rule texts are public venue data and are included whenever the deal itself is visible. */
import type { CalcLeg } from "./calculator";
import { feedFor, type FeedRow, type FeedViewer, type StoredOpp } from "./feed";
import { feeModelFor } from "./fees";
import { isPaid } from "./plans";
import { recentTicks } from "./live/queries";
import { marketsByKey, storedOpp } from "./queries";
import type { Opportunity, Plan, Region, VMarket, Venue } from "./types";
import { VENUE_NAME } from "./types";

export interface DealViewer { plan: Plan; region: Region | null }

/** A leg's fill at the stated size. Paid viewers only. */
export interface DealFill { contracts: number; worstPriceCents: number; cost: number; fee: number }

/** One market's rules as the venue publishes them. `title` is null when the market isn't stored. */
export interface DealRules {
  key: string;
  venue: Venue;
  venueName: string;
  /** The leg label, shown when the market itself isn't stored. */
  fallback: string;
  title: string | null;
  yesLabel: string | null;
  closeTime: number | null;
  resolutionSource: string | null;
  rules: string | null;
}

export interface DealCalc { legs: CalcLeg[]; payoutPerSet: number; maxSets: number }

/** The gap over the last 30 minutes, from real price ticks (live_events): for a two-leg lock, cents per $1 left
 *  after both prices (100 − the two prices), else the ROI in percent. Paid viewers, live locks only. */
export interface DealHistory { metric: "gap" | "roi"; points: Array<{ at: number; v: number }> }
export const HISTORY_MS = 30 * 60_000;

export interface DealOk {
  state: "ok";
  /** The feed row, already redacted for the viewer's plan. */
  row: FeedRow;
  paid: boolean;
  /** A paid viewer opened a deal that is no longer active. */
  gone: boolean;
  /** Per leg, in row.legs order; null for free viewers and for second opinions. */
  fills: Array<DealFill | null>;
  rules: DealRules[];
  /** Paid viewers, live locks only. */
  calc: DealCalc | null;
  /** Paid viewers, live locks only; null with fewer than 2 points. */
  history: DealHistory | null;
}

export type DealView = { state: "not_found" } | { state: "too_new" } | DealOk;

/** GET /api/deal/[id]. */
export interface DealResponse { now: number; view: DealView; unlockHref: string }

/** Region always applies; the viewer's own filters don't. */
const viewerFor = (v: DealViewer): FeedViewer => ({ plan: v.plan, region: v.region, minRoi: Number.NEGATIVE_INFINITY, minSizeUsd: 0, categories: [], venues: [],
  showYellow: true, showRed: true });

type Resolved = { state: "not_found" } | { state: "too_new" } | { state: "ok"; row: FeedRow; opp: Opportunity; gone: boolean };

function resolve(stored: StoredOpp | null, viewer: DealViewer, now: number): Resolved {
  if (!stored) return { state: "not_found" };
  const paid = isPaid(viewer.plan);
  const fv = viewerFor(viewer);
  const gone = paid && !stored.active;
  const row = feedFor([gone ? { ...stored, active: true } : stored], fv, now)[0];
  if (row) return { state: "ok", row, opp: paid ? stored.live : stored.snapshot, gone };
  // A free viewer asking for a deal a member could see right now: it's just too new for the delayed feed.
  if (!paid && feedFor([stored], { ...fv, plan: "pro" }, now).length) return { state: "too_new" };
  return { state: "not_found" };
}

const marketKeys = (o: Opportunity) => [...new Map(o.legs.map(l => [`${l.venue}:${l.marketId}`, { venue: l.venue, id: l.marketId, label: l.label }])).values()];

/** Pure: the view of a stored deal for this viewer, given the stored markets (keyed "venue:id"). */
/** Pure: the history series from a deal's snapshot, its price ticks (oldest first) and its live state. */
export function historyFrom(stored: StoredOpp, ticks: ReadonlyArray<{ at: number; legs: Array<{ avgPrice: number }>; roi: number }>, now: number): DealHistory | null {
  const o = stored.live;
  const metric: DealHistory["metric"] = o.kind === "cross_arb" && o.legs.length === 2 ? "gap" : "roi";
  const v = (legs: ReadonlyArray<{ avgPrice: number }>, roi: number) =>
    metric === "gap" ? Math.round((100 - legs.reduce((s, l) => s + l.avgPrice * 100, 0)) * 10) / 10 : Math.round(roi * 10_000) / 100;
  const since = now - HISTORY_MS;
  const points: DealHistory["points"] = [];
  if (stored.firstSeenAt >= since) points.push({ at: stored.firstSeenAt, v: v(stored.snapshot.legs, stored.snapshot.roi) });
  for (const t of ticks) if (t.at >= since && t.at <= now) points.push({ at: t.at, v: v(t.legs, t.roi) });
  points.push({ at: Math.min(now, Math.max(stored.lastSeenAt, points[points.length - 1]?.at ?? 0)), v: v(o.legs, o.roi) });
  return points.length >= 2 ? { metric, points } : null;
}

export function dealViewFrom(stored: StoredOpp | null, markets: ReadonlyMap<string, VMarket>, viewer: DealViewer, now: number,
  ticks: ReadonlyArray<{ at: number; legs: Array<{ avgPrice: number }>; roi: number }> = []): DealView {
  const r = resolve(stored, viewer, now);
  if (r.state !== "ok") return { state: r.state };
  const { row, opp, gone } = r;
  const paid = isPaid(viewer.plan) && !row.locked;
  const lock = opp.kind !== "second_opinion";
  const market = (venue: Venue, id: string): VMarket | null => markets.get(`${venue}:${id}`) ?? null;
  const rules: DealRules[] = marketKeys(opp).map(k => {
    const m = market(k.venue, k.id);
    return { key: `${k.venue}:${k.id}`, venue: k.venue, venueName: VENUE_NAME[k.venue], fallback: k.label, title: m?.title ?? null, yesLabel: m?.yesLabel ?? null,
      closeTime: m?.closeTime ?? null, resolutionSource: m?.resolutionSource ?? null, rules: m ? m.rules : null };
  });
  const fills = row.legs.map((_, i): DealFill | null => {
    const l = paid && lock ? opp.legs[i] : undefined;
    return l ? { contracts: Math.floor(l.contracts), worstPriceCents: Math.round(l.worstPrice * 1000) / 10, cost: l.cost, fee: l.fee } : null;
  });
  const calc: DealCalc | null = paid && lock && !gone ? {
    legs: opp.legs.map(l => ({ label: l.label, venue: l.venue, side: l.side, avgPrice: l.avgPrice,
      fee: market(l.venue, l.marketId)?.fee ?? feeModelFor(l.venue, opp.categories[0] ?? "other") })),
    payoutPerSet: opp.sets > 0 ? opp.payout / opp.sets : 0,
    maxSets: opp.sets,
  } : null;
  const history = paid && lock && !gone && stored ? historyFrom(stored, ticks, now) : null;
  return { state: "ok", row, paid, gone, fills, rules, calc, history };
}

/** Loads a deal by id and returns what this viewer may see of it. */
export async function dealView(id: string, viewer: DealViewer, now = Date.now()): Promise<DealView> {
  if (!id || id.length > 200) return { state: "not_found" };
  const stored = await storedOpp(id);
  const r = resolve(stored, viewer, now);
  const markets = r.state === "ok" ? await marketsByKey(marketKeys(r.opp)) : new Map<string, VMarket>();
  const ticks = r.state === "ok" && isPaid(viewer.plan) && !r.row.locked ? await recentTicks(id, now - HISTORY_MS) : [];
  return dealViewFrom(stored, markets, viewer, now, ticks);
}
