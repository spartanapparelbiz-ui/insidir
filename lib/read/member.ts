/* The member home's pieces for the one tool (server only):
 *   Tonight      onboarding's one answer, "What do you bet on?" (BET_ON), as markets: games starting tonight in those
 *                leagues with big money on them (start times as the venues state them), and for Elections the busiest
 *                election markets of the last day. Each one opens a Read.
 *   Your markets every market the member has read, with its latest Read (theirs, or the refresh the worker keeps every
 *                15 minutes), marked when proven money has moved since their last visit (5+ points, or the wallet
 *                count changed).
 *   This week    of their markets that settled in the last 7 days, how often proven money's side (as their own last Read
 *                before the result showed it) won: "proven money was right on X of Y". Real results, losses included.
 */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { readSeen } from "@/lib/db/schema";
import { startOfEtDay } from "@/lib/discover";
import { fullTeamNames } from "@/lib/sports/team-names";
import { trackerBySlug, trackerWhere } from "@/lib/trackers";
import { buildRead, type Clients } from "./build";
import { saveRead, type StoredRead } from "./store";
import type { ReadData, Venue } from "./types";

const DAY = 86_400_000;

/** Onboarding's answers and the tracker rule each one means (lib/trackers.ts). */
export const BET_ON = [
  ["nfl", "NFL", "nfl-big-money"], ["nba", "NBA", "nba-big-money"], ["cfb", "CFB", "college-football"], ["nhl", "NHL", "nhl-big-money"],
  ["mlb", "MLB", "mlb-big-money"], ["soccer", "Soccer", "soccer-big-money"], ["elections", "Elections", "elections-2026"], ["other", "Other", null],
] as const;
export type BetOn = (typeof BET_ON)[number][0];
export const isBetOn = (v: unknown): v is BetOn => BET_ON.some(([k]) => k === v);

export interface TonightRow { key: BetOn; label: string; venue: Venue; marketId: string; title: string; event: string; total: number; startAt: number | null }

/** Markets for the member's answers: tonight's games in their leagues, the busiest election markets. Up to 4 per answer. */
export async function tonightFor(db: Db, betOn: readonly string[], now: number): Promise<TonightRow[]> {
  const end = startOfEtDay(now) + 30 * 3_600_000;
  const out: TonightRow[] = [];
  for (const [key, label, slug] of BET_ON) {
    if (!betOn.includes(key) || !slug) continue;
    const t = trackerBySlug(slug);
    if (!t) continue;
    const rows = key === "elections"
      ? await db.execute(sql`select source, market_id, max(market_title) as title, max(event_title) as event, sum(amount)::float as total, null::timestamptz as start_at
          from terminal.moves where hidden_at is null and result is null and source in ('polymarket', 'kalshi') and at > ${new Date(now - DAY)} and ${trackerWhere(t)}
          group by source, market_id order by total desc limit 4`)
      : await db.execute(sql`select terminal.moves.source, terminal.moves.market_id, max(market_title) as title, max(event_title) as event, sum(amount)::float as total, max(i.start_at) as start_at
          from terminal.moves join terminal.market_info i on i.source = terminal.moves.source and i.market_id = terminal.moves.market_id
          where hidden_at is null and result is null and terminal.moves.source in ('polymarket', 'kalshi') and ${trackerWhere(t)}
            and i.start_at >= ${new Date(now - 3 * 3_600_000)} and i.start_at < ${new Date(end)}
          group by terminal.moves.source, terminal.moves.market_id order by max(i.start_at) asc, total desc limit 4`);
    for (const r of rows.rows as Array<{ source: Venue; market_id: string; title: string; event: string; total: number; start_at: string | null }>) {
      out.push({ key, label, venue: r.source, marketId: r.market_id, title: fullTeamNames(r.title, label), event: r.event, total: Number(r.total), startAt: r.start_at ? new Date(r.start_at).getTime() : null });
    }
  }
  return out;
}

export interface YourMarket {
  key: string; latest: StoredRead; moved: { from: number | null; to: number | null } | null;
  /** Proven money's dollar change on each side since their last visit, and when that was; null on a first visit or
   *  for a market seen before dollars were recorded. */
  since: { yes: number; no: number; at: number } | null;
  /** YES now (the better venue's price), and at the first Read of today (ET); null when unknown. */
  price: number | null; dayOpen: number | null;
}

/** A Read's YES price: the better venue's, else whichever there is. */
export const yesPriceOf = (d: ReadData): number | null => {
  const y = d.prices.yes;
  return (y.best ? y[y.best] : null) ?? y.polymarket ?? y.kalshi ?? null;
};

/** The member's markets, newest first: each with its latest Read (anyone's or the refresh), and whether proven money
 *  moved since they last saw it here. Seeing them now records this view as their last. */
export async function yourMarkets(db: Db, userId: string, now: number, limit = 12): Promise<YourMarket[]> {
  const mine = await db.execute(sql`select market_key, max(created_at) as last from terminal.reads where user_id = ${userId} group by market_key order by last desc limit ${limit}`);
  const keys = (mine.rows as Array<{ market_key: string }>).map(r => r.market_key);
  if (!keys.length) return [];
  const list = sql.join(keys.map(k => sql`${k}`), sql`, `);
  const [latest, seen] = await Promise.all([
    db.execute(sql`select distinct on (market_key) * from terminal.reads where market_key in (${list}) order by market_key, created_at desc`),
    db.execute(sql`select market_key, yes_share, wallets, yes_dollars, no_dollars, seen_at from terminal.read_seen where user_id = ${userId} and market_key in (${list})`),
  ]);
  const opens = await db.execute(sql`select distinct on (market_key) market_key, data from terminal.reads where market_key in (${list}) and created_at >= ${new Date(startOfEtDay(now))}
    order by market_key, created_at asc`);
  const openBy = new Map((opens.rows as Array<{ market_key: string; data: ReadData }>).map(r => [r.market_key, yesPriceOf(r.data)]));
  const byKey = new Map((latest.rows as Array<Record<string, unknown>>).map(r => [String(r.market_key), {
    id: String(r.id), userId: (r.user_id as string | null) ?? null, visitorId: (r.visitor_id as string | null) ?? null, input: String(r.input),
    data: r.data as ReadData, ms: (r.ms as number | null) ?? null, createdAt: new Date(r.created_at as string).getTime(),
  } satisfies StoredRead]));
  const seenBy = new Map((seen.rows as Array<{ market_key: string; yes_share: number | null; wallets: number; yes_dollars: number | null; no_dollars: number | null; seen_at: string | Date }>).map(r => [r.market_key, r]));
  const out: YourMarket[] = [];
  for (const k of keys) {
    const l = byKey.get(k);
    if (!l) continue;
    const s = seenBy.get(k), p = l.data.proven;
    const moved = s && (Math.abs((p.yesShare ?? 0) - (s.yes_share ?? 0)) >= 0.05 || p.wallets !== s.wallets) ? { from: s.yes_share, to: p.yesShare } : null;
    const since = s && s.yes_dollars !== null && s.no_dollars !== null
      ? { yes: p.yes.dollars - Number(s.yes_dollars), no: p.no.dollars - Number(s.no_dollars), at: new Date(s.seen_at).getTime() } : null;
    const price = yesPriceOf(l.data), open = openBy.get(k) ?? null;
    out.push({ key: k, latest: l, moved, since, price, dayOpen: open !== null && price !== null ? open : null });
  }
  // This visit is now their last: what they saw is what the next visit compares to.
  for (const m of out) {
    const p = m.latest.data.proven;
    const v = { yesShare: p.yesShare, wallets: p.wallets, yesDollars: p.yes.dollars, noDollars: p.no.dollars, seenAt: new Date(now) };
    await db.insert(readSeen).values({ userId, marketKey: m.key, ...v }).onConflictDoUpdate({ target: [readSeen.userId, readSeen.marketKey], set: v });
  }
  return out;
}

export interface WeekLine { key: string; question: string; provenSide: string; won: string; right: boolean }
export interface WeekRecap { right: number; of: number; lines: WeekLine[] }

/** Which side paid, from our settled positions on that market (either listing): null when it hasn't settled (or voided). */
async function resultOf(db: Db, d: ReadData, since: number, now: number): Promise<"yes" | "no" | null> {
  const ids = [d.polymarket ? sql`(source = 'polymarket' and market_id = ${d.polymarket.id})` : null, d.kalshi ? sql`(source = 'kalshi' and market_id = ${d.kalshi.id})` : null].filter(Boolean) as ReturnType<typeof sql>[];
  if (!ids.length) return null;
  const r = await db.execute(sql`select source, outcome_side, result from terminal.moves where (${sql.join(ids, sql` or `)}) and result in ('won', 'lost')
    and settled_at >= ${new Date(since)} and settled_at <= ${new Date(now)} limit 1`);
  const x = r.rows[0] as { source: Venue; outcome_side: "yes" | "no"; result: "won" | "lost" } | undefined;
  if (!x) return null;
  let paid: "yes" | "no" = x.result === "won" ? x.outcome_side : x.outcome_side === "yes" ? "no" : "yes";
  if (x.source === "kalshi" && d.kalshi?.inverted) paid = paid === "yes" ? "no" : "yes";
  return paid;
}

/** "Your markets this week: proven money was right on X of Y." */
export async function weeklyRecap(db: Db, userId: string, now: number): Promise<WeekRecap> {
  const since = now - 7 * DAY;
  // Each market's last Read by this member (what they saw), from the last 60 days.
  const r = await db.execute(sql`select distinct on (market_key) market_key, data from terminal.reads where user_id = ${userId} and created_at > ${new Date(now - 60 * DAY)}
    order by market_key, created_at desc`);
  const lines: WeekLine[] = [];
  for (const row of r.rows as Array<{ market_key: string; data: ReadData }>) {
    const d = row.data, share = d.proven.yesShare;
    if (share === null || share === 0.5) continue;
    const paid = await resultOf(db, d, since, now);
    if (!paid) continue;
    const provenSide = share > 0.5 ? "yes" : "no";
    lines.push({ key: row.market_key, question: d.question, provenSide: provenSide === "yes" ? d.yesLabel : d.noLabel, won: paid === "yes" ? d.yesLabel : d.noLabel, right: provenSide === paid });
  }
  return { right: lines.filter(l => l.right).length, of: lines.length, lines };
}

/** The worker's refresh: markets members read in the last 14 days get a fresh Read every 15 minutes (input "refresh",
 *  nobody's), so Your markets shows where proven money is now. */
export async function refreshWatched(db: Db, clients: Clients, now: number, max = 40): Promise<number> {
  const r = await db.execute(sql`select market_key, max(created_at) as last from terminal.reads where created_at > ${new Date(now - 14 * DAY)}
    and market_key in (select distinct market_key from terminal.reads where user_id is not null and created_at > ${new Date(now - 14 * DAY)})
    group by market_key having max(created_at) < ${new Date(now - 15 * 60_000)} order by last asc limit ${max}`);
  let n = 0;
  for (const { market_key } of r.rows as Array<{ market_key: string }>) {
    const [p, id] = [market_key.slice(0, 1), market_key.slice(2)];
    try {
      const t0 = Date.now();
      const data = await buildRead(db, clients, p === "p" ? "polymarket" : "kalshi", id, now);
      await saveRead(db, { userId: null, visitorId: null, input: "refresh", data: { ...data, line: null }, ms: Date.now() - t0 }, now);
      n++;
    } catch { /* next run */ }
  }
  return n;
}
