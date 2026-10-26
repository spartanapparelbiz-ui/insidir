/* Pure helpers for the live Terminal: apply a price tick to a row, and word the free plan's "members vs you" line.
 * Browser-safe (no server imports). */
import type { FeedRow } from "@/lib/feed";
import type { LiveDealClosed, LivePriceTick } from "@/lib/live/types";
import { playText } from "@/lib/play";

/** The row after a price tick: new leg prices (by leg order), the play re-worded, and (paid rows) the new numbers.
 *  A delayed free row is a snapshot of what was found, so ticks never change it. */
export function applyTick(row: FeedRow, t: LivePriceTick, at: number): FeedRow {
  if (row.locked) return row;
  const legs = row.legs.map((l, i) => {
    const m = t.legs.length === row.legs.length ? t.legs[i] : t.legs.find(x => x.venue === l.venue && x.side === l.side);
    return m ? { ...l, priceCents: m.priceCents } : l;
  });
  const play = playText({ kind: row.kind, gapCents: row.gapCents, legs: legs.map(l => ({ venue: l.venue, side: l.side, label: l.label, avgPrice: l.priceCents / 100 })) });
  // The sparkline keeps the last 30 minutes, the new point appended (same metric as lib/deal-view.ts historyFrom).
  const v = row.kind === "cross_arb" && legs.length === 2 ? Math.round((100 - legs[0]!.priceCents - legs[1]!.priceCents) * 10) / 10 : Math.round(t.roi * 10_000) / 100;
  const spark = row.spark ? [...row.spark.filter(p => p.at >= at - 30 * 60_000 && p.at < at), { at, v }] : row.spark;
  return {
    ...row, legs, play, roi: t.roi, spark,
    profit: t.profit ?? row.profit, profitPerDay: t.profitPerDay ?? row.profitPerDay, cost: t.cost ?? row.cost, fees: t.fees ?? row.fees, sets: t.sets ?? row.sets,
    lastSeenAt: Math.max(row.lastSeenAt, at), stale: false,
  };
}

const clock = (ms: number): string => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** "Closed 4 min ago. Members got it at 3:14 PM. You'd see it at 3:44 PM." From the event's own times only. */
export function missedLine(d: Pick<LiveDealClosed, "firstSeenAt" | "closedAt">, delayMs: number, now: number): string {
  const min = Math.floor(Math.max(0, now - d.closedAt) / 60_000);
  const closed = min < 1 ? "Closed just now." : `Closed ${min} min ago.`;
  return `${closed} Members got it at ${clock(d.firstSeenAt)}. You'd see it at ${clock(d.firstSeenAt + delayMs)}.`;
}

/** A free viewer missed it when it closed before the delayed feed could show it. */
export const missedByDelay = (d: Pick<LiveDealClosed, "firstSeenAt" | "closedAt">, delayMs: number): boolean => d.firstSeenAt + delayMs > d.closedAt;

/** "Deals usually show up every 6 min." Null when there isn't enough history. */
export function quietLine(medianGapMin: number | null): string | null {
  if (medianGapMin === null || !Number.isFinite(medianGapMin)) return null;
  const n = Math.round(medianGapMin);
  return `Quiet right now. Deals usually show up ${n <= 1 ? "every minute or so" : `every ${n} min`}.`;
}
