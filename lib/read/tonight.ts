/* The home page's one-tap Reads (server only): tonight's busiest markets that have proven money. Each one opens its
 * Read in one tap (components/read/ReadPick.tsx).
 *   Tonight   the game starts, or the market is due to close, between 3 hours ago and 6 a.m. ET tomorrow
 *             (terminal.market_info). The time shown is only ever the start (Polymarket gameStartTime / startDate,
 *             else Kalshi's event milestone); a game already under way is "Live" (components/read/TonightReads.tsx).
 *   Names     full team names ("Los Angeles R" → "Rams", lib/sports/team-names.ts).
 *   Busiest   24h volume (terminal.markets) plus the tracked big money still open in it.
 *   Proven    at least one open position from a winning tracker or a proven wallet: the same two sources as the Read's
 *             Proven money (lib/read/build.ts), so the Read it opens has some.
 * Combos are left out; a Kalshi market paired with a Polymarket one appears once, as the Polymarket market. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { startOfEtDay } from "@/lib/discover";
import { MIN_SETTLED } from "@/lib/follow/math";
import { isWinner, traderFollowAll } from "@/lib/follow/records";
import { memo } from "@/lib/memo";
import { notComboSql } from "@/lib/moves/combos";
import { isLive, TRACKERS, trackerWhere } from "@/lib/trackers";
import { pairOf, winningTrackers } from "./build";
import { PROVEN_CLOSED_MIN } from "./math";
import { fullTeamNames } from "@/lib/sports/team-names";
import type { Venue } from "./types";

export interface TonightRead { venue: Venue; id: string; title: string; event: string | null; /** When the game starts (never a close time); null when no venue says. */ startAt: number | null; volume: number; money: number; provenMoney: number; provenPositions: number }

const HOUR = 3_600_000;

export async function tonightReads(db: Db, now: number, n = 3): Promise<TonightRead[]> {
  const [trackers, follows] = await Promise.all([winningTrackers(db, now), traderFollowAll(db, now).catch(() => new Map())]);
  const tagged = TRACKERS.filter(t => trackers.has(t.slug) && !isLive(t)).map(t => t.slug);
  const live = TRACKERS.filter(t => trackers.has(t.slug) && isLive(t));
  const winners = [...follows.values()].filter(f => f.all.n >= MIN_SETTLED && isWinner(f.all)).map(f => f.wallet as string);
  const arr = (xs: readonly string[]) => (xs.length ? sql`array[${sql.join(xs.map(x => sql`${x}`), sql`, `)}]::text[]` : sql`array[]::text[]`);
  const proven = sql`(coalesce(terminal.moves.trackers, '{}') && ${arr(tagged)}
    ${live.length ? sql`or ${sql.join(live.map(t => sql`(${trackerWhere(t)})`), sql` or `)}` : sql``}
    or (terminal.moves.wallet is not null and (terminal.moves.wallet = any(${arr(winners)})
      or exists (select 1 from terminal.wallet_pnl r where r.wallet = terminal.moves.wallet and r.closed >= ${PROVEN_CLOSED_MIN} and r.pnl > 0))))`;
  const from = new Date(now - 3 * HOUR), to = new Date(startOfEtDay(now) + 30 * HOUR);
  const r = await db.execute(sql`select p.*, coalesce((mk.data->>'volume24h')::float, 0) as volume, i.start_at from (
      select terminal.moves.source, terminal.moves.market_id, max(market_title) as title, max(event_title) as event, max(league) as league, sum(amount)::float as money,
        coalesce(sum(amount) filter (where ${proven}), 0)::float as proven_money, count(*) filter (where ${proven})::int as proven_n
      from terminal.moves where hidden_at is null and result is null and terminal.moves.source in ('polymarket', 'kalshi') and ${notComboSql}
      group by terminal.moves.source, terminal.moves.market_id) p
    join terminal.market_info i on i.source = p.source and i.market_id = p.market_id and not i.closed
    left join terminal.markets mk on mk.venue = p.source and mk.id = p.market_id
    where p.proven_n > 0 and coalesce(i.start_at, i.end_at) >= ${from} and coalesce(i.start_at, i.end_at) < ${to}
    order by coalesce((mk.data->>'volume24h')::float, 0) + p.money desc limit ${n * 4}`);
  const out = new Map<string, TonightRead>();
  const ms = (v: string | Date | null | undefined) => (v ? new Date(v).getTime() : null);
  for (const x of r.rows as Array<{ source: Venue; market_id: string; title: string; event: string | null; league: string | null; money: number; proven_money: number; proven_n: number; volume: number; start_at: string | Date | null }>) {
    const pair = x.source === "kalshi" ? await pairOf(db, "kalshi", x.market_id) : null;
    const venue: Venue = pair?.polymarket ? "polymarket" : x.source, id = pair?.polymarket ?? x.market_id;
    // The start: Polymarket's (gameStartTime) when the market is paired with one, else this listing's own (Kalshi's
    // event milestone). Never a close time: Kalshi's expected expiration is hours after the game starts.
    let startAt = ms(x.start_at);
    if (pair?.polymarket) {
      const p = await db.execute(sql`select start_at from terminal.market_info where source = 'polymarket' and market_id = ${pair.polymarket}`);
      startAt = ms((p.rows[0] as { start_at: string | null } | undefined)?.start_at) ?? startAt;
    }
    const k = `${venue}:${id}`, cur = out.get(k);
    const row: TonightRead = { venue, id, title: fullTeamNames(x.title, x.league), event: x.event, startAt,
      volume: Number(x.volume), money: Number(x.money), provenMoney: Number(x.proven_money), provenPositions: Number(x.proven_n) };
    if (!cur) out.set(k, row);
    else {
      cur.volume += row.volume; cur.money += row.money; cur.provenMoney += row.provenMoney; cur.provenPositions += row.provenPositions;
      if (x.source === "polymarket") Object.assign(cur, { title: row.title, event: row.event, startAt: row.startAt ?? cur.startAt });
      else cur.startAt ??= row.startAt;
    }
  }
  return [...out.values()].sort((a, b) => (b.volume + b.money) - (a.volume + a.money)).slice(0, n);
}

/** The same, memoized for 5 minutes (the landing renders it for every visitor). */
export const tonightReadsCached = (db: Db, now: number): Promise<TonightRead[]> => memo("read:tonight", 5 * 60_000, () => tonightReads(db, now));
