/* Trackers in the database (lib/trackers.ts): each tracker's record per window, money tracked, followers, and its
 * moves. One query per tracker, every number from terminal.moves and terminal.follows. Server only. */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { moves as movesT, traderRecords } from "@/lib/db/schema";
import { fromRow } from "@/lib/moves/store";
import { countsToRecord } from "@/lib/trust";
import { infoFor } from "@/lib/markets/info";
import type { Db } from "@/lib/db";
import { isReady, liveTabs } from "@/lib/features";
import { memo } from "@/lib/memo";
import { notComboSql } from "@/lib/moves/combos";
import { SOLD_EARLY_SHARE } from "@/lib/moves/realize";
import { listMoves, type MoveQuery } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { PERIODS, TRACKERS, trackerWhere, type PeriodKey, type Tracker, type TrackerRecord, type TrackerSlug } from "./trackers";

export interface TrackerStats {
  slug: TrackerSlug;
  /** Record per window (by when the market settled), and all-time. */
  records: Record<PeriodKey, TrackerRecord>;
  /** Money in its moves over the last 30 days, and how many. */
  tracked30d: number;
  moves30d: number;
  /** Every move it holds. */
  moves: number;
  lastAt: number | null;
  followers: number;
}

const DAY = 86_400_000;
const n = (v: unknown) => Number(v ?? 0) || 0;

/** The rule a settled move must meet to count toward a record (lib/trust.ts countsToRecord, in SQL). */
const COUNTS = (tabs: string[]) => sql`terminal.moves.source = 'polymarket' and terminal.moves.result in ('won', 'lost') and terminal.moves.pnl is not null
  and coalesce(terminal.moves.sold_share, 0) <= ${SOLD_EARLY_SHARE} and terminal.moves.tab in (${sql.join(tabs.map(t => sql`${t}`), sql`, `)})`;

function windowCols(key: string, since: Date | null, counted: ReturnType<typeof sql>) {
  const w = since ? sql`(${counted}) and terminal.moves.settled_at >= ${since}` : sql`(${counted})`;
  const priced = sql`${w} and terminal.moves.avg_price > 0 and terminal.moves.avg_price < 1`;
  return sql`count(*) filter (where ${w} and terminal.moves.result = 'won')::int as ${sql.raw(`won_${key}`)},
    count(*) filter (where ${w} and terminal.moves.result = 'lost')::int as ${sql.raw(`lost_${key}`)},
    sum(terminal.moves.amount * terminal.moves.avg_price) filter (where ${priced})::float as ${sql.raw(`wp_${key}`)},
    sum(terminal.moves.amount) filter (where ${priced})::float as ${sql.raw(`w_${key}`)},
    coalesce(sum(terminal.moves.pnl) filter (where ${w}), 0)::float as ${sql.raw(`net_${key}`)}`;
}

export async function trackerStatsOne(db: Db, t: Tracker, now: number): Promise<TrackerStats> {
  const tabs = liveTabs();
  const windows = [...PERIODS.map(p => ({ key: p.key, since: new Date(now - p.days * DAY) })), { key: "all", since: null }];
  const since30 = new Date(now - 30 * DAY);
  const counted = COUNTS(tabs);
  const r = (await db.execute(sql`select ${sql.join(windows.map(w => windowCols(w.key, w.since, counted)), sql`, `)},
      count(*)::int as moves, max(terminal.moves.at) as last_at,
      coalesce(sum(terminal.moves.amount) filter (where terminal.moves.at >= ${since30}), 0)::float as tracked30,
      count(*) filter (where terminal.moves.at >= ${since30})::int as moves30,
      (select count(*)::int from terminal.follows f where f.kind = 'tracker' and f.target = ${t.slug}) as followers
    from terminal.moves
    where terminal.moves.hidden_at is null and ${notComboSql} and terminal.moves.tab in (${sql.join(tabs.map(x => sql`${x}`), sql`, `)}) and ${trackerWhere(t)}`)).rows[0] as Record<string, unknown> | undefined;
  const rec = (k: string): TrackerRecord => {
    const w = n(r?.[`w_${k}`]);
    return { won: n(r?.[`won_${k}`]), lost: n(r?.[`lost_${k}`]), oddsPct: w > 0 ? (n(r?.[`wp_${k}`]) / w) * 100 : null, net: n(r?.[`net_${k}`]) };
  };
  return {
    slug: t.slug,
    records: Object.fromEntries(windows.map(w => [w.key, rec(w.key)])) as Record<PeriodKey, TrackerRecord>,
    tracked30d: n(r?.tracked30), moves30d: n(r?.moves30), moves: n(r?.moves),
    lastAt: r?.last_at ? new Date(r.last_at as string).getTime() : null, followers: n(r?.followers),
  };
}

/** Every tracker's stats, shared by every visitor for a minute. */
export function trackerStats(db: Db, now: number): Promise<Map<TrackerSlug, TrackerStats>> {
  return memo("trackers:stats", 60_000, async () => {
    const all = await Promise.all(TRACKERS.filter(t => !t.needs || isReady(t.needs)).map(t => trackerStatsOne(db, t, now).catch(() => null)));
    return new Map(all.filter((s): s is TrackerStats => s !== null).map(s => [s.slug, s]));
  });
}

/** A tracker's moves, newest first (or settled / biggest), on the viewer's clock. */
export function trackerMoves(db: Db, t: Tracker, q: Omit<MoveQuery, "where">): Promise<Move[]> {
  return listMoves(db, { ...q, where: trackerWhere(t) });
}

/* ---------- a tracker's page (app/trackers/[slug]) ---------- */

const tabsIn = () => inArray(movesT.tab, liveTabs());

/** Wallets with a record and a profit (Top Traders), shared for 10 minutes. */
export function topTraderSet(db: Db): Promise<Set<string>> {
  return memo("trackers:top", 600_000, async () => new Set((await db.select({ w: traderRecords.wallet }).from(traderRecords)
    .where(and(gte(traderRecords.resolved, 20), sql`${traderRecords.profit} > 0`))).map(r => r.w)));
}

export interface TrackerPageData {
  /** Settled moves that count toward the record, newest settled first. */
  settled: Move[];
  /** Every move in the last year (activity, heatmap, top-trader share). */
  year: Array<Pick<Move, "id" | "amount" | "wallet" | "at">>;
  /** Unsettled moves from the last 60 days, with the price now (their side) when known. */
  open: Array<{ m: Move; now: number | null }>;
  top: Set<string>;
}

export function trackerPage(db: Db, t: Tracker, until: number, now: number): Promise<TrackerPageData> {
  return memo(`tracker:${t.slug}:${Math.floor(until / 60_000)}`, 60_000, async () => {
    const base = and(isNull(movesT.hiddenAt), notComboSql, tabsIn(), trackerWhere(t));
    const [settledRows, yearRows, openRows, top] = await Promise.all([
      db.select().from(movesT).where(and(base, isNotNull(movesT.result), eq(movesT.source, "polymarket"), isNotNull(movesT.pnl))).orderBy(desc(movesT.settledAt)).limit(5000),
      db.select({ id: movesT.id, amount: movesT.amount, wallet: movesT.wallet, at: movesT.at }).from(movesT)
        .where(and(base, gte(movesT.at, new Date(now - 365 * DAY)), lte(movesT.at, new Date(until)))).limit(50_000),
      db.select().from(movesT).where(and(base, isNull(movesT.result), gte(movesT.at, new Date(now - 60 * DAY)), lte(movesT.at, new Date(until)))).orderBy(desc(movesT.amount)).limit(200),
      topTraderSet(db),
    ]);
    const open = openRows.map(fromRow);
    const infos = new Map<string, number | null>();
    for (const source of ["polymarket", "kalshi"] as const) {
      const got = await infoFor(db, source, open.filter(m => m.source === source).map(m => m.marketId)).catch(() => new Map());
      for (const [id, i] of got) infos.set(`${source}:${id}`, i.yesPrice);
    }
    return {
      settled: settledRows.map(fromRow).filter(m => countsToRecord(m)),
      year: yearRows.map(r => ({ id: r.id, amount: r.amount, wallet: r.wallet, at: r.at.getTime() })),
      open: open.map(m => {
        const yes = infos.get(`${m.source}:${m.marketId}`) ?? null;
        return { m, now: yes === null ? null : m.outcomeSide === "no" ? 1 - yes : yes };
      }),
      top,
    };
  });
}
