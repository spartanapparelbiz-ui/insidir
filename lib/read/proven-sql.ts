/* "Is this open position proven money?" as SQL over terminal.moves: it belongs to a winning tracker (a stored tag, or a
 * live rule's SQL), or it is a proven wallet's (a winning followable record, or 30+ closed Polymarket markets and
 * positive all-time profit in terminal.wallet_pnl). The same two sources as the Read's Proven money
 * (lib/read/build.ts), so a list that says "proven money" and the Read it opens agree. Server only. */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { MIN_SETTLED } from "@/lib/follow/math";
import { isWinner, traderFollowAll } from "@/lib/follow/records";
import { isLive, TRACKERS, trackerWhere } from "@/lib/trackers";
import { winningTrackers } from "./build";
import { PROVEN_CLOSED_MIN } from "./math";

export async function provenPredicate(db: Db, now: number): Promise<SQL> {
  const [trackers, follows] = await Promise.all([winningTrackers(db, now), traderFollowAll(db, now).catch(() => new Map())]);
  const tagged = TRACKERS.filter(t => trackers.has(t.slug) && !isLive(t)).map(t => t.slug);
  const live = TRACKERS.filter(t => trackers.has(t.slug) && isLive(t));
  const winners = [...follows.values()].filter(f => f.all.n >= MIN_SETTLED && isWinner(f.all)).map(f => f.wallet as string);
  const arr = (xs: readonly string[]) => (xs.length ? sql`array[${sql.join(xs.map(x => sql`${x}`), sql`, `)}]::text[]` : sql`array[]::text[]`);
  return sql`(coalesce(terminal.moves.trackers, '{}') && ${arr(tagged)}
    ${live.length ? sql`or ${sql.join(live.map(t => sql`(${trackerWhere(t)})`), sql` or `)}` : sql``}
    or (terminal.moves.wallet is not null and (terminal.moves.wallet = any(${arr(winners)})
      or exists (select 1 from terminal.wallet_pnl r where r.wallet = terminal.moves.wallet and r.closed >= ${PROVEN_CLOSED_MIN} and r.pnl > 0))))`;
}
