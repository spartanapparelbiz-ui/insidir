/* What a watched wallet does to its position: each buy run opens it or adds to it, each sell run trims it or exits.
 *   open   a buy when it holds none of that side (as far as we've seen)
 *   add    a buy when it already holds that side
 *   trim   a sell of less than EXIT_SHARE of what it holds
 *   exit   a sell of EXIT_SHARE or more of what it holds
 * Sell runs are the wallet's SELL fills in one market and outcome, merged like buys (a gap over 10 minutes starts a new
 * run), $5K or more. A sell of a position we never saw it open is left out: we can't say if it trimmed or left.
 * Shares held come only from the buys and sells we've seen. Pure, except recordPositions (server only). */
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { positionEvents } from "@/lib/db/schema";
import { categoryOf } from "@/lib/brand/categories";
import { MERGE_WINDOW_MS } from "@/lib/moves/detect";
import type { Fill } from "@/lib/moves/types";
import { BET_MIN } from "@/lib/moves/poll";
import type { BetRow } from "./bets";
import type { Tier } from "./watchlist";

export const EXIT_SHARE = 0.9;
export type PositionKind = "open" | "add" | "trim" | "exit";

export interface SellRun {
  id: string; wallet: string; marketId: string; outcomeSide: "yes" | "no"; outcome: string; marketTitle: string; eventTitle: string;
  url: string | null; shares: number; amount: number; price: number; at: number; lastAt: number;
}

/** Watched wallets' SELL fills → sell runs of BET_MIN or more. */
export function sellRuns(fills: readonly Fill[], watched: (wallet: string) => boolean, min = BET_MIN): SellRun[] {
  const groups = new Map<string, Fill[]>();
  for (const f of fills) {
    if (f.source !== "polymarket" || f.side !== "SELL" || !f.wallet || !watched(f.wallet)) continue;
    const k = `${f.wallet.toLowerCase()}|${f.marketId}|${f.outcomeSide}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const out: SellRun[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.at - b.at);
    let run: Fill[] = [];
    const flush = () => {
      if (!run.length) return;
      const shares = run.reduce((s, f) => s + f.contracts, 0), amount = run.reduce((s, f) => s + f.contracts * f.price, 0), f0 = run[0]!;
      if (amount >= min && shares > 0) out.push({ id: `ps:${f0.wallet!.toLowerCase()}:${f0.marketId}:${f0.outcomeSide}:${f0.at}`, wallet: f0.wallet!.toLowerCase(), marketId: f0.marketId, outcomeSide: f0.outcomeSide,
        outcome: f0.outcome, marketTitle: f0.marketTitle, eventTitle: f0.eventTitle, url: f0.url, shares, amount, price: amount / shares, at: f0.at, lastAt: run[run.length - 1]!.at });
      run = [];
    };
    for (const f of g) { if (run.length && f.at - run[run.length - 1]!.at > MERGE_WINDOW_MS) flush(); run.push(f); }
    flush();
  }
  return out;
}

/** A buy or a sell against what the wallet held before it: its kind and the shares held after. Null for a sell of a
 *  position we never saw. */
export function classify(heldBefore: number, e: { side: "buy" | "sell"; shares: number }): { kind: PositionKind; heldAfter: number } | null {
  if (e.side === "buy") return { kind: heldBefore > 0 ? "add" : "open", heldAfter: heldBefore + e.shares };
  if (heldBefore <= 0) return null;
  return { kind: e.shares >= EXIT_SHARE * heldBefore ? "exit" : "trim", heldAfter: Math.max(0, heldBefore - e.shares) };
}

/** How much of the position a trim sold, 0..1 (shares sold over shares held before). */
export const soldShare = (shares: number, heldAfter: number): number => (shares + heldAfter > 0 ? shares / (shares + heldAfter) : 1);

/** Records this poll's buys (the bet rows just saved) and sells as position events, oldest first. An event already
 *  recorded keeps its kind; a run that grew updates its size. */
export async function recordPositions(db: Db, buys: readonly BetRow[], sells: readonly SellRun[], tierOf: (wallet: string) => Tier | null): Promise<number> {
  type Ev = { id: string; side: "buy" | "sell"; wallet: string; tier: Tier; marketId: string; outcomeSide: "yes" | "no"; outcome: string; marketTitle: string; eventTitle: string; category: string; url: string | null; amount: number; price: number; shares: number; at: number; lastAt: number };
  const evs: Ev[] = [];
  for (const b of buys) {
    if (!b.price || b.price <= 0) continue;
    evs.push({ id: b.id, side: "buy", wallet: b.wallet, tier: b.tier, marketId: b.marketId, outcomeSide: b.outcomeSide as "yes" | "no", outcome: b.outcome, marketTitle: b.marketTitle, eventTitle: b.eventTitle,
      category: b.category, url: b.url ?? null, amount: b.amount, price: b.price, shares: b.amount / b.price, at: +b.at!, lastAt: +(b.lastAt ?? b.at!) });
  }
  for (const s of sells) {
    const tier = tierOf(s.wallet);
    if (!tier) continue;
    evs.push({ id: s.id, side: "sell", wallet: s.wallet, tier, marketId: s.marketId, outcomeSide: s.outcomeSide, outcome: s.outcome, marketTitle: s.marketTitle, eventTitle: s.eventTitle,
      category: categoryOf({ title: s.marketTitle, event: s.eventTitle, url: s.url }), url: s.url, amount: s.amount, price: s.price, shares: s.shares, at: s.at, lastAt: s.lastAt });
  }
  if (!evs.length) return 0;
  const known = new Set((await db.select({ id: positionEvents.id }).from(positionEvents).where(inArray(positionEvents.id, evs.map(e => e.id)))).map(r => r.id));
  let n = 0;
  for (const e of evs.sort((a, b) => a.at - b.at)) {
    if (known.has(e.id)) {
      await db.update(positionEvents).set({ amount: e.amount, price: e.price, shares: e.shares, lastAt: new Date(e.lastAt) }).where(eq(positionEvents.id, e.id));
      continue;
    }
    const prev = await db.select({ held: positionEvents.heldAfter }).from(positionEvents)
      .where(and(eq(positionEvents.wallet, e.wallet), eq(positionEvents.marketId, e.marketId), eq(positionEvents.outcomeSide, e.outcomeSide), lt(positionEvents.at, new Date(e.at))))
      .orderBy(desc(positionEvents.at)).limit(1);
    const c = classify(prev[0]?.held ?? 0, e);
    if (!c) continue;
    await db.insert(positionEvents).values({ id: e.id, wallet: e.wallet, tier: e.tier, marketId: e.marketId, outcomeSide: e.outcomeSide, outcome: e.outcome, marketTitle: e.marketTitle,
      eventTitle: e.eventTitle, category: e.category, url: e.url, kind: c.kind, amount: e.amount, price: e.price, shares: e.shares, heldAfter: c.heldAfter, at: new Date(e.at), lastAt: new Date(e.lastAt) })
      .onConflictDoNothing();
    n++;
  }
  return n;
}

/** A position event's kind by id (the bet ids a ping is about). */
export async function kindsOf(db: Db, ids: readonly string[]): Promise<Map<string, PositionKind>> {
  if (!ids.length) return new Map();
  const r = await db.execute(sql`select id, kind from terminal.position_events where id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`);
  return new Map((r.rows as Array<{ id: string; kind: PositionKind }>).map(x => [x.id, x.kind]));
}
