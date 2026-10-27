/* The feed as one viewer may see it. Everything is decided here on the server: a free viewer's rows are built from
 * the snapshot taken when a deal was first found at least 30 minutes ago, cut to the top 3, with fillable size and
 * dollar profit removed (not hidden in the browser: never sent). Paid viewers get the live state. Region and the
 * viewer's own filters apply to everyone. */
import { entitlements } from "./plans";
import { FRESH_MS } from "./status";
import { playText } from "./play";
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
  /** When a scan last re-confirmed the deal. */
  lastSeenAt: number;
  /** Not re-confirmed within FRESH_MS (or a delayed row): grey it out, never show it as live. */
  stale: boolean;
  /** The gap over the last 30 minutes (lib/deal-view.ts historyFrom), paid rows only; added by the Terminal. */
  spark?: Array<{ at: number; v: number }> | null;
}

export { playText };

function toRow(o: Opportunity, foundAt: number, locked: boolean, lastSeenAt: number, stale: boolean): FeedRow {
  return {
    id: o.id, kind: o.kind, title: o.title, play: playText(o),
    legs: o.legs.map(l => ({ venue: l.venue, venueName: VENUE_NAME[l.venue], side: l.side, label: l.label, priceCents: Math.round(l.avgPrice * 1000) / 10, url: l.url })),
    roi: o.roi, safety: o.safety, safetyNotes: o.safetyNotes, categories: o.categories, foundAt, closeTime: o.closeTime, days: o.days,
    profit: locked ? null : o.profit, cost: locked ? null : o.cost, fees: locked ? null : o.fees, sets: locked ? null : o.sets,
    profitPerDay: locked ? null : o.profitPerDay, gapCents: o.gapCents, locked, lastSeenAt, stale,
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
    // A delayed (free) row is never live; a paid row is live only if a scan re-confirmed it within FRESH_MS.
    const stale = delayed || now - s.lastSeenAt > FRESH_MS;
    rows.push({ row: toRow(o, s.firstSeenAt, ent.sizesHidden, delayed ? s.firstSeenAt : s.lastSeenAt, stale), rank: o.kind === "second_opinion" ? -1 : o.profitPerDay });
  }
  // Fresh deals first, then by profit per day.
  rows.sort((a, b) => Number(a.row.stale) - Number(b.row.stale) || b.rank - a.rank || b.row.roi - a.row.roi);
  const out = rows.map(r => r.row);
  return ent.maxRows === null ? out : out.slice(0, ent.maxRows);
}
