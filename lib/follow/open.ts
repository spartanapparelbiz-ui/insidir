/* "Open now" from winners (the home hero and /open): open positions in trackers, and from traders, whose followable
 * record is positive on 30+ settled positions. Each row: the tracker (or trader), the position's artwork, amount,
 * outcome, the price Insidir showed it at, the price now, the time left to settle, and that tracker's followable
 * record. Visitors see the 3 newest (and how many more), on their usual 30-minute delay; members see every one, live.
 * Losing trackers never appear here. Server only. */
import { desc, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { moves as movesT } from "@/lib/db/schema";
import { liveTabs } from "@/lib/features";
import { artOfMove, type MoveArt } from "@/lib/logos";
import { infoFor } from "@/lib/markets/info";
import { notComboSql } from "@/lib/moves/combos";
import { headlineOf, sublineOf } from "@/lib/moves/headline";
import { leagueLabel } from "@/lib/moves/leagues";
import { walletLabel } from "@/lib/moves/records";
import { fromRow } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { movePlan } from "@/lib/moves/gate";
import { TRACKERS, type TrackerSlug } from "@/lib/trackers";
import { trackerStats } from "@/lib/trackers-store";
import type { Plan } from "@/lib/types";
import { isWinner, traderFollowAll } from "./records";
import type { FollowRecord } from "./math";

const DAY = 86_400_000;

/** Positions are the same when the same account takes the same side of the same market within an hour: one row,
 *  the amounts added (the newest time kept). Pure. */
export function dedupe<T extends Pick<Move, "wallet" | "marketId" | "outcomeSide" | "amount" | "at">>(rows: readonly T[], windowMs = 3_600_000): T[] {
  const out: T[] = [];
  for (const m of [...rows].sort((a, b) => b.at - a.at)) {
    const same = m.wallet ? out.find(x => x.wallet === m.wallet && x.marketId === m.marketId && x.outcomeSide === m.outcomeSide && Math.abs(x.at - m.at) <= windowMs) : undefined;
    if (same) (same as { amount: number }).amount = same.amount + m.amount;
    else out.push({ ...m });
  }
  return out;
}

export interface OpenRow {
  id: string;
  /** Who it's from: a winning tracker (its slug and name) or a winning trader (their wallet and name). */
  from: { kind: "tracker"; slug: TrackerSlug; name: string } | { kind: "trader"; wallet: string; name: string };
  record: FollowRecord;
  art: MoveArt;
  headline: string;
  subline: string;
  amount: number;
  at: number;
  marketId: string;
  /** The side's price when Insidir showed it, and now (null when the venue hasn't said). */
  seenPrice: number | null;
  nowPrice: number | null;
  /** When the market is due to settle. */
  endAt: number | null;
}

export async function openFromWinners(db: Db, plan: Plan, now: number): Promise<{ rows: OpenRow[]; total: number }> {
  const stats = await trackerStats(db, now);
  const winners = TRACKERS.filter(t => t.kind === "bets").map(t => ({ t, r: stats.get(t.slug)?.records.all ?? null }))
    .filter(x => x.r && isWinner({ n: x.r.won + x.r.lost, won: x.r.won, lost: x.r.lost, staked: x.r.staked ?? 0, net: x.r.net }))
    .map(x => ({ slug: x.t.slug, name: x.t.name, record: { n: x.r!.won + x.r!.lost, won: x.r!.won, lost: x.r!.lost, staked: x.r!.staked ?? 0, net: x.r!.net } }));
  const traders = [...(await traderFollowAll(db, now)).values()].filter(t => isWinner(t.all));
  if (!winners.length && !traders.length) return { rows: [], total: 0 };
  const until = now - movePlan(plan).delayMs;
  const slugs = winners.map(w => w.slug), wallets = traders.map(t => t.wallet);
  const T = sql`terminal.moves`;
  const rows0 = await db.select().from(movesT).where(sql`${T}.result is null and ${T}.hidden_at is null and ${notComboSql}
      and ${T}.source in ('polymarket', 'kalshi') and ${T}.tab in (${sql.join(liveTabs().map(t => sql`${t}`), sql`, `)})
      and ${T}.at <= ${new Date(now)} and ${T}.at > ${new Date(now - 30 * DAY)}
      and (${slugs.length ? sql`${T}.trackers && array[${sql.join(slugs.map(s => sql`${s}`), sql`, `)}]::text[]` : sql`false`}
        or ${wallets.length ? sql`${T}.wallet in (${sql.join(wallets.map(w => sql`${w}`), sql`, `)})` : sql`false`})`)
    .orderBy(desc(movesT.at)).limit(500);
  const moves = dedupe(rows0.map(fromRow));
  const best = new Map(winners.map(w => [w.slug, w]));
  const byWallet = new Map(traders.map(t => [t.wallet, t]));
  const info = new Map<string, Awaited<ReturnType<typeof infoFor>>>();
  for (const source of ["polymarket", "kalshi"] as const) info.set(source, await infoFor(db, source, moves.filter(m => m.source === source).map(m => m.marketId)));
  const rows: OpenRow[] = [];
  for (const m of moves) {
    // Its best winning tracker (highest followable return), else the winning trader behind it.
    const tr = (m.trackers ?? []).map(s => best.get(s)).filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => b.record.net / b.record.staked - a.record.net / a.record.staked)[0];
    const td = m.wallet ? byWallet.get(m.wallet) : undefined;
    if (!tr && !td) continue;
    const i = info.get(m.source)?.get(m.marketId) ?? null;
    const yes = i?.yesPrice ?? null;
    rows.push({
      id: m.id, from: tr ? { kind: "tracker", slug: tr.slug, name: tr.name } : { kind: "trader", wallet: td!.wallet, name: walletLabel(td!.wallet, td!.name) },
      record: tr ? tr.record : td!.all, art: artOfMove(m), headline: headlineOf(m), subline: sublineOf({ ...m, leagueLabel: leagueLabel(m) }), amount: m.amount, at: m.at,
      marketId: m.marketId, seenPrice: m.seenPrice ?? null, nowPrice: yes === null ? null : m.outcomeSide === "no" ? 1 - yes : yes, endAt: i?.endAt ?? null,
    });
  }
  // The count is every open one; a visitor sees the 3 newest of those old enough for them (30 minutes late).
  const total = rows.length;
  return { rows: movePlan(plan).delayMs > 0 ? rows.filter(r => r.at <= until).slice(0, 3) : rows, total };
}
