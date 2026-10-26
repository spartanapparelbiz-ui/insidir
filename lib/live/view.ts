/* What one viewer may receive from a raw live event, and when. Pure: the stream (lib/live/hub.ts) calls it.
 *
 *   - Region: an event about a venue the viewer can't use is never sent (US never sees international Polymarket).
 *   - Free plan: deals, price ticks and big trades arrive on the same 30-minute-delayed clock as the free feed, with
 *     the same redaction (no sizes or dollar profit). A deal that has CLOSED is history, so its closing is sent at
 *     once to everyone in the region: that is the "members got it at…" moment, and it can't be traded any more.
 *   - Paid plans: everything as it happens. Big trades (whales) are a Pro feature: other plans get them delayed. */
import { feedFor, type FeedViewer } from "@/lib/feed";
import { entitlements } from "@/lib/plans";
import { allowedVenues } from "@/lib/region";
import type { LiveEvent, RawDealClosed, RawDealFound, RawLiveEvent, RawPriceTick, RawWhale } from "./types";

/** Milliseconds after the event that this viewer may see it. */
export function delayFor(e: Pick<RawLiveEvent, "type">, viewer: Pick<FeedViewer, "plan">): number {
  if (e.type === "deal_closed") return 0;
  const ent = entitlements(viewer.plan);
  if (e.type === "whale") return ent.whales ? 0 : Math.max(ent.feedDelayMinutes, 30) * 60_000;
  return ent.feedDelayMinutes * 60_000;
}

/** The viewer's version of the event, or null when they may not see it. Call only once `now >= at + delayFor`. */
export function viewEvent(e: RawLiveEvent, viewer: FeedViewer, now: number): LiveEvent | null {
  const venues = allowedVenues(viewer.region, viewer.venues);
  if (!e.venues.every(v => venues.includes(v))) return null;
  if (now < e.at + delayFor(e, viewer)) return null;
  const sizesHidden = entitlements(viewer.plan).sizesHidden;
  switch (e.type) {
    case "deal_found": {
      const d = e.data as RawDealFound;
      // The same rules as the feed (delay, region, the viewer's filters, redaction), on just this deal.
      const row = feedFor([{ live: d.opp, snapshot: d.opp, firstSeenAt: d.firstSeenAt, lastSeenAt: d.firstSeenAt, active: true }], viewer, now)[0];
      return row ? { id: e.id, type: "deal_found", at: e.at, oppId: d.opp.id, data: { row } } : null;
    }
    case "deal_closed": {
      const d = e.data as RawDealClosed;
      if (d.safety === "red" && !viewer.showRed) return null;
      return { id: e.id, type: "deal_closed", at: e.at, oppId: e.oppId ?? "", data: { title: d.title, safety: d.safety, roi: d.roi, firstSeenAt: d.firstSeenAt, closedAt: d.closedAt, lifeMs: d.lifeMs } };
    }
    case "price_tick": {
      const d = e.data as RawPriceTick;
      return {
        id: e.id, type: "price_tick", at: e.at, oppId: e.oppId ?? "",
        data: {
          legs: d.legs.map(l => ({ venue: l.venue, side: l.side, priceCents: Math.round(l.avgPrice * 1000) / 10 })), roi: d.roi,
          profit: sizesHidden ? null : d.profit, profitPerDay: sizesHidden ? null : d.profitPerDay,
          cost: sizesHidden ? null : d.cost, fees: sizesHidden ? null : d.fees, sets: sizesHidden ? null : d.sets,
        },
      };
    }
    case "whale": {
      const d = e.data as RawWhale;
      return { id: e.id, type: "whale", at: e.at, oppId: null, data: { side: d.side, outcome: d.outcome, marketTitle: d.marketTitle, cash: d.cash, url: d.url } };
    }
  }
}
