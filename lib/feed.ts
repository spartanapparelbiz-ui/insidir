/* The feed as one viewer may see it. Everything is decided here on the server: a free viewer's rows are built from
 * the snapshot taken when a deal was first found at least 30 minutes ago, cut to the top 3, with fillable size and
 * dollar profit removed (not hidden in the browser: never sent). Paid viewers get the live state. Region and the
 * viewer's own filters apply to everyone. */
import { entitlements } from "./plans";
import { allowedVenues, venuesOk } from "./region";
import type { Opportunity, Plan, Region, Safety, Venue } from "./types";
import { VENUE_NAME } from "./types";

export interface FeedViewer {
  plan: Plan;
  region: Region | null;
  minRoi: number;
  minSizeUsd: number;
  categories: readonly string[];
  venues: readonly Venue[];
  showYellow: boolean;
  showRed: boolean;
}

/** A stored opportunity: its live state, and its snapshot from first detection (the receipt). */
export interface StoredOpp {
  live: Opportunity;
  snapshot: Opportunity;
  firstSeenAt: number;
  lastSeenAt: number;
  active: boolean;
}

export interface FeedLeg { venue: Venue; venueName: string; side: "yes" | "no"; label: string; priceCents: number; url: string }

export interface FeedRow {
  id: string;
  kind: Opportunity["kind"];
  title: string;
  /** The play in plain English. */
  play: string;
  legs: FeedLeg[];
  roi: number;
  safety: Safety;
  safetyNotes: string[];
  categories: string[];
  foundAt: number;
  closeTime: number | null;
  days: number;
  /** null when the viewer's plan withholds it. */
  profit: number | null;
  cost: number | null;
  fees: number | null;
  sets: number | null;
  profitPerDay: number | null;
  gapCents: number | null;
  /** True when the viewer sees a delayed, size-less row. */
  locked: boolean;
}

const cents = (p: number): string => {
  const c = p * 100;
  return (c < 10 && c % 1 !== 0 ? c.toFixed(1) : String(Math.round(c))) + "¢";
};
const dollars = (v: number): string => (v >= 100 ? "$" + Math.round(v).toLocaleString("en-US") : "$" + v.toFixed(2));

/** "Buy YES on Kalshi at 55¢ + NO on Polymarket at 40¢" and the like. */
export function playText(o: Pick<Opportunity, "kind" | "legs" | "gapCents">): string {
  const legs = o.legs;
  const venue = legs[0] ? VENUE_NAME[legs[0].venue] : "";
  switch (o.kind) {
    case "cross_arb":
      return legs.map((l, i) => `${i ? "" : "Buy "}${l.side.toUpperCase()} on ${VENUE_NAME[l.venue]} at ${cents(l.avgPrice)}`).join(" + ");
    case "multi_yes":
    case "multi_no": {
      const side = o.kind === "multi_yes" ? "YES" : "NO";
      const total = legs.reduce((a, l) => a + l.avgPrice, 0);
      return `Buy ${side} on all ${legs.length} outcomes on ${venue} for ${total < 1 ? cents(total) : dollars(total)} a set`;
    }
    case "ladder":
    case "implication":
      return legs.map((l, i) => `${i ? "" : "Buy "}${l.side.toUpperCase()} “${l.label}” at ${cents(l.avgPrice)}`).join(" + ") + ` on ${venue}`;
    case "second_opinion": {
      const l = legs[0];
      return l ? `${VENUE_NAME[l.venue]} prices YES at ${cents(l.avgPrice)}, ${o.gapCents ?? 0}¢ below the other venue (not a lock)` : "Price gap";
    }
  }
}

function toRow(o: Opportunity, foundAt: number, locked: boolean): FeedRow {
  return {
    id: o.id, kind: o.kind, title: o.title, play: playText(o),
    legs: o.legs.map(l => ({ venue: l.venue, venueName: VENUE_NAME[l.venue], side: l.side, label: l.label, priceCents: Math.round(l.avgPrice * 1000) / 10, url: l.url })),
    roi: o.roi, safety: o.safety, safetyNotes: o.safetyNotes, categories: o.categories, foundAt, closeTime: o.closeTime, days: o.days,
    profit: locked ? null : o.profit, cost: locked ? null : o.cost, fees: locked ? null : o.fees, sets: locked ? null : o.sets,
    profitPerDay: locked ? null : o.profitPerDay, gapCents: o.gapCents, locked,
  };
}

const safetyOk = (s: Safety, v: FeedViewer): boolean => s === "green" || (s === "yellow" && v.showYellow) || (s === "red" && v.showRed);

/** The rows a viewer may receive, best profit per day first (second opinions after the locks). */
export function feedFor(opps: readonly StoredOpp[], viewer: FeedViewer, now: number): FeedRow[] {
  const ent = entitlements(viewer.plan);
  const venues = allowedVenues(viewer.region, viewer.venues);
  const delayMs = ent.feedDelayMinutes * 60_000;
  const delayed = delayMs > 0;
  const rows: Array<{ row: FeedRow; rank: number }> = [];
  for (const s of opps) {
    // Free: only deals first found at least `delay` ago, as they were then. Paid: live, active deals.
    if (delayed ? s.firstSeenAt > now - delayMs : !s.active) continue;
    const o = delayed ? s.snapshot : s.live;
    if (!venuesOk(o, venues)) continue;
    if (!safetyOk(o.safety, viewer)) continue;
    if (o.kind !== "second_opinion" && o.roi < viewer.minRoi) continue;
    if (!delayed && viewer.minSizeUsd > 0 && o.cost + o.fees < viewer.minSizeUsd) continue;
    if (viewer.categories.length && !o.categories.some(c => viewer.categories.includes(c))) continue;
    rows.push({ row: toRow(o, s.firstSeenAt, ent.sizesHidden), rank: o.kind === "second_opinion" ? -1 : o.profitPerDay });
  }
  rows.sort((a, b) => b.rank - a.rank || b.row.roi - a.row.roi);
  const out = rows.map(r => r.row);
  return ent.maxRows === null ? out : out.slice(0, ent.maxRows);
}
