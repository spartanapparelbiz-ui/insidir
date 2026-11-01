/* Copy math, pure. A copied move is bought at the price Insidir showed it plus one point (lib/follow/math.ts
 * followPrice), at the member's size, held to settlement: size / price back when it won, nothing when it lost.
 * Only moves Insidir showed after the copy began count. */
import { followPrice } from "@/lib/follow/math";
import { dollars } from "@/lib/money";

export interface CopyResult { n: number; won: number; lost: number; staked: number; net: number }
export const NO_RESULT: CopyResult = { n: 0, won: 0, lost: 0, staked: 0, net: 0 };

export interface SettledMove { seenPrice: number | null; seenAt: number; result: "won" | "lost" | "void" | null; settledAt: number | null }

/** What copying at `size` made on moves shown at or after `since` (the copy's start) and settled at or after
 *  `settledSince` (the start of the week, or the copy's start). */
export function copyResult(rows: readonly SettledMove[], size: number, since: number, settledSince = since): CopyResult {
  const r = { ...NO_RESULT };
  for (const m of rows) {
    if (m.seenAt < since || m.settledAt === null || m.settledAt < settledSince || m.settledAt < m.seenAt) continue;
    if (m.result !== "won" && m.result !== "lost") continue;
    const p = followPrice(m.seenPrice);
    if (p === null) continue;
    r.n++; r.staked += size;
    if (m.result === "won") { r.won++; r.net += size / p - size; } else { r.lost++; r.net -= size; }
  }
  return r;
}

/** "+$212", "−$40", "$0": whole dollars, signed. */
export function signedDollars(net: number): string {
  const v = Math.round(net);
  if (v === 0) return "$0";
  return `${v > 0 ? "+" : "−"}${dollars(Math.abs(v))}`;
}

/** Return on what was put in: "+12.4%", "−3.0%"; null when nothing settled. */
export function returnText(r: Pick<CopyResult, "net" | "staked">): string | null {
  if (!(r.staked > 0)) return null;
  const pct = (r.net / r.staked) * 100;
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(1)}%`;
}

/** The Kalshi side that pays on the same thing as a Polymarket side, given the pair's orientation. */
export const kalshiSide = (polySide: "yes" | "no", inverted: boolean): "yes" | "no" => (inverted ? (polySide === "yes" ? "no" : "yes") : polySide);

/** A side's price from a YES price. */
export const sidePrice = (yes: number | null | undefined, side: "yes" | "no"): number | null =>
  yes === null || yes === undefined || !Number.isFinite(yes) || yes < 0 || yes > 1 ? null : side === "yes" ? yes : 1 - yes;

/** "41¢" for a 0..1 price; "—" when unknown. */
export const cents = (p: number | null | undefined): string => (p === null || p === undefined || !Number.isFinite(p) ? "—" : `${Math.round(p * 100)}¢`);

/** The first sentence of an analyst note, for the one-line note under a copied move. */
export function oneLine(text: string | null | undefined, max = 160): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  const first = m ? m[1]! : t;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}
