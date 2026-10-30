/* Followable records: what $100 on every position would have made, following at the price Insidir showed it (or, for
 * Momentum, Early and Late, the price when the tag was added) plus one point of slippage, held to settlement.
 * Per tracker (each window and all time) and per trader (Polymarket accounts). A position counts once it has settled
 * won or lost, had a price to follow at, and was shown (or tagged) before it settled. Server only. */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveTabs } from "@/lib/features";
import { memo } from "@/lib/memo";
import { notComboSql } from "@/lib/moves/combos";
import { PERIODS, TRACKERS, trackerWhere, type Tracker, type TrackerSlug } from "@/lib/trackers";
import { EMPTY, MIN_SETTLED, SLIPPAGE, STAKE, type FollowRecord } from "./math";

const DAY = 86_400_000;
const OBSERVED = new Set(["steam", "early-money", "late-money"]);
export type FollowWindows = Record<string, FollowRecord>;

/** The price and moment a position can be followed from, for a tracker: its tag's for an after-the-fact tracker. */
const pointFor = (slug: string | null): { price: SQL; at: SQL; join: SQL } => slug && OBSERVED.has(slug)
  ? { price: sql`g.tagged_price`, at: sql`g.tagged_at`, join: sql`join terminal.move_tags g on g.move_id = terminal.moves.id and g.tracker = ${slug}` }
  : { price: sql`terminal.moves.seen_price`, at: sql`terminal.moves.seen_at`, join: sql`` };

/** Columns of one window's followable record: n, won, lost, staked and net. */
function cols(key: string, since: Date | null, price: SQL, at: SQL): SQL {
  const ok = sql`${price} > 0 and ${price} + ${SLIPPAGE} < 1 and ${at} < terminal.moves.settled_at and terminal.moves.result in ('won', 'lost')${since ? sql` and terminal.moves.settled_at >= ${since}` : sql``}`;
  const pnl = sql`case when terminal.moves.result = 'won' then ${STAKE} / (${price} + ${SLIPPAGE}) - ${STAKE} else -${STAKE} end`;
  return sql`count(*) filter (where ${ok})::int as ${sql.raw(`n_${key}`)},
    count(*) filter (where ${ok} and terminal.moves.result = 'won')::int as ${sql.raw(`won_${key}`)},
    coalesce(sum(${pnl}) filter (where ${ok}), 0)::float as ${sql.raw(`net_${key}`)}`;
}
const read = (r: Record<string, unknown> | undefined, key: string): FollowRecord => {
  const n = Number(r?.[`n_${key}`] ?? 0), won = Number(r?.[`won_${key}`] ?? 0);
  return { n, won, lost: n - won, staked: n * STAKE, net: Number(r?.[`net_${key}`] ?? 0) };
};
const windows = (now: number) => [...PERIODS.map(p => ({ key: p.key, since: new Date(now - p.days * DAY) })), { key: "all", since: null as Date | null }];
const base = () => sql`terminal.moves.hidden_at is null and ${notComboSql} and terminal.moves.source in ('polymarket', 'kalshi')
  and terminal.moves.tab in (${sql.join(liveTabs().map(t => sql`${t}`), sql`, `)})`;

/** One tracker's followable record, per window and all time. */
export async function trackerFollow(db: Db, t: Tracker, now: number): Promise<FollowWindows> {
  if (t.kind !== "bets") return Object.fromEntries(windows(now).map(w => [w.key, EMPTY]));
  const p = pointFor(t.slug);
  const r = (await db.execute(sql`select ${sql.join(windows(now).map(w => cols(w.key, w.since, p.price, p.at)), sql`, `)}
    from terminal.moves ${p.join} where ${base()} and ${trackerWhere(t)}`)).rows[0] as Record<string, unknown> | undefined;
  return Object.fromEntries(windows(now).map(w => [w.key, read(r, w.key)]));
}

export function trackerFollowAll(db: Db, now: number): Promise<Map<TrackerSlug, FollowWindows>> {
  return memo("follow:trackers", 5 * 60_000, async () => {
    const out = new Map<TrackerSlug, FollowWindows>();
    for (const t of TRACKERS) out.set(t.slug, await trackerFollow(db, t, now).catch(() => ({ all: EMPTY })));
    return out;
  });
}

export interface TraderFollow { wallet: string; name: string | null; all: FollowRecord; d30: FollowRecord; open: number; openAmount: number }

/** Every Polymarket account's followable record (all time and the last 30 days), for those with any settled. */
export function traderFollowAll(db: Db, now: number): Promise<Map<string, TraderFollow>> {
  return memo("follow:traders", 5 * 60_000, async () => {
    const p = pointFor(null), since = new Date(now - 30 * DAY);
    const r = await db.execute(sql`select terminal.moves.wallet as wallet, max(terminal.moves.wallet_name) as name,
        ${cols("all", null, p.price, p.at)}, ${cols("d30", since, p.price, p.at)},
        count(*) filter (where terminal.moves.result is null and terminal.moves.at > ${new Date(now - 60 * DAY)})::int as open,
        coalesce(sum(terminal.moves.amount) filter (where terminal.moves.result is null and terminal.moves.at > ${new Date(now - 60 * DAY)}), 0)::float as open_amount
      from terminal.moves where ${base()} and terminal.moves.source = 'polymarket' and terminal.moves.wallet is not null
      group by terminal.moves.wallet having count(*) filter (where terminal.moves.result in ('won', 'lost')) > 0`);
    const out = new Map<string, TraderFollow>();
    for (const x of r.rows as Array<Record<string, unknown>>) out.set(String(x.wallet), { wallet: String(x.wallet), name: (x.name as string | null) ?? null, all: read(x, "all"), d30: read(x, "d30"), open: Number(x.open), openAmount: Number(x.open_amount) });
    return out;
  });
}

/** Winners: a positive followable return on MIN_SETTLED or more settled positions. */
export const isWinner = (r: FollowRecord | null | undefined): boolean => Boolean(r && r.n >= MIN_SETTLED && r.net > 0);
