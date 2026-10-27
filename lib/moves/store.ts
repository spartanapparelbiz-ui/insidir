/* Moves, trader records, follows and the waitlist in Postgres (terminal schema). Server only. */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveTabs } from "@/lib/features";
import { follows, markets, moves, traderRecords, waitlist } from "@/lib/db/schema";
import type { League, Move, Tab, TraderRecord } from "./types";

type Row = typeof moves.$inferSelect;

export const fromRow = (r: Row): Move => ({
  id: r.id, source: r.source, marketId: r.marketId, eventTitle: r.eventTitle, marketTitle: r.marketTitle, outcome: r.outcome,
  outcomeSide: r.outcomeSide, amount: r.amount, avgPrice: r.avgPrice, wallet: r.wallet, walletName: r.walletName,
  at: r.at.getTime(), lastAt: r.lastAt.getTime(), fills: r.fills, tab: r.tab, league: (r.league as League | null) ?? null,
  category: r.category, url: r.url, result: r.result ?? null, settledAt: r.settledAt?.getTime() ?? null,
  detail: (r.detail as Move["detail"]) ?? null, newWallet: r.newWallet ?? null, sourceRefs: r.sourceRefs ?? null,
});

/** Inserts new moves; a move seen again (more fills merged in) gets its new total. Returns the ids that are new. */
export async function upsertMoves(db: Db, list: readonly Move[]): Promise<string[]> {
  const fresh: string[] = [];
  for (const m of list) {
    const r = await db.insert(moves).values({
      id: m.id, source: m.source, marketId: m.marketId, eventTitle: m.eventTitle, marketTitle: m.marketTitle, outcome: m.outcome,
      outcomeSide: m.outcomeSide, amount: m.amount, avgPrice: m.avgPrice, wallet: m.wallet, walletName: m.walletName,
      at: new Date(m.at), lastAt: new Date(m.lastAt), fills: m.fills, tab: m.tab, league: m.league, category: m.category, url: m.url,
      detail: (m.detail ?? null) as Record<string, unknown> | null, newWallet: m.newWallet ?? null, sourceRefs: m.sourceRefs ?? null,
    }).onConflictDoUpdate({
      target: moves.id,
      set: { amount: m.amount, avgPrice: m.avgPrice, lastAt: new Date(m.lastAt), fills: m.fills, walletName: m.walletName, sourceRefs: m.sourceRefs ?? null },
      setWhere: sql`${moves.fills} < ${m.fills}`,
    }).returning({ id: moves.id, inserted: sql<boolean>`(xmax = 0)` });
    if (r[0]?.inserted) fresh.push(m.id);
  }
  return fresh;
}

/** Markets with unsettled moves older than an hour, per source (for the settlement check). SEC filings never settle. */
export async function unsettledMarkets(db: Db, before: Date, limit = 300): Promise<Array<{ source: "polymarket" | "kalshi"; marketId: string }>> {
  const rows = await db.selectDistinct({ source: moves.source, marketId: moves.marketId }).from(moves)
    .where(and(isNull(moves.result), lt(moves.at, before), inArray(moves.source, ["polymarket", "kalshi"]))).limit(limit);
  return rows as Array<{ source: "polymarket" | "kalshi"; marketId: string }>;
}

/** Marks every move in a settled market won or lost (or void when the market was refunded). */
export async function settleMarket(db: Db, source: "polymarket" | "kalshi", marketId: string, result: "yes" | "no" | "void", at: Date): Promise<void> {
  const w = and(eq(moves.source, source), eq(moves.marketId, marketId), isNull(moves.result));
  if (result === "void") { await db.update(moves).set({ result: "void", settledAt: at }).where(w); return; }
  await db.update(moves).set({ result: sql`case when ${moves.outcomeSide} = ${result} then 'won' else 'lost' end`, settledAt: at }).where(w);
}

/** Polymarket wallets seen moving in the last week whose record is missing or older than `staleMs`. */
export async function walletsToRecord(db: Db, now: number, staleMs: number, limit: number): Promise<Array<{ wallet: string; name: string | null }>> {
  // Wallets seen moving this week first, then the leaderboard's (terminal.tracked_wallets) for /top.
  const r = await db.execute(sql`select w.wallet, max(w.name) as name, max(w.at) as at from (
      select m.wallet, m.wallet_name as name, m.at from terminal.moves m where m.wallet is not null and m.at > ${new Date(now - 7 * 86_400_000)}
      union all select tw.wallet, tw.name, tw.added_at - interval '30 days' from terminal.tracked_wallets tw
    ) w left join terminal.trader_records t on t.wallet = w.wallet
    where t.wallet is null or t.updated_at < ${new Date(now - staleMs)}
    group by w.wallet order by max(w.at) desc limit ${limit}`);
  return (r.rows as Array<{ wallet: string; name: string | null }>);
}

export async function saveRecord(db: Db, r: TraderRecord): Promise<void> {
  const v = { name: r.name, resolved: r.resolved, won: r.won, lost: r.lost, profit: r.profit, biggestWin: r.biggestWin, biggestBet: r.biggestBet ?? null, updatedAt: new Date(r.updatedAt) };
  await db.insert(traderRecords).values({ wallet: r.wallet, ...v }).onConflictDoUpdate({ target: traderRecords.wallet, set: v });
}

export async function recordsFor(db: Db, wallets: readonly string[]): Promise<Map<string, TraderRecord>> {
  const ws = [...new Set(wallets)].filter(Boolean);
  if (!ws.length) return new Map();
  const rs = await db.select().from(traderRecords).where(inArray(traderRecords.wallet, ws));
  return new Map(rs.map(r => [r.wallet, { wallet: r.wallet, name: r.name, resolved: r.resolved, won: r.won, lost: r.lost, profit: r.profit, biggestWin: r.biggestWin, biggestBet: r.biggestBet, updatedAt: r.updatedAt.getTime() }]));
}

/** Top traders by all-time profit (20+ resolved markets, profit > 0). */
export async function topTraders(db: Db, limit: number): Promise<TraderRecord[]> {
  const rs = await db.select().from(traderRecords).where(and(gte(traderRecords.resolved, 20), sql`${traderRecords.profit} > 0`)).orderBy(desc(traderRecords.profit)).limit(limit);
  return rs.map(r => ({ wallet: r.wallet, name: r.name, resolved: r.resolved, won: r.won, lost: r.lost, profit: r.profit, biggestWin: r.biggestWin, updatedAt: r.updatedAt.getTime() }));
}

export interface MoveQuery {
  tab?: Tab | null; min?: number; league?: League | null; wallet?: string | null; marketId?: string | null;
  /** Only moves at or before this time (a free viewer's clock), ms. */
  until?: number; since?: number; before?: number; settled?: boolean; limit?: number;
  /** Biggest first instead of newest first. */
  byAmount?: boolean;
}

export async function listMoves(db: Db, q: MoveQuery): Promise<Move[]> {
  // Tabs that aren't live yet (Coming soon) never reach a page, whatever the query asks for.
  const w = [
    inArray(moves.tab, q.tab ? liveTabs().filter(t => t === q.tab) : liveTabs()),
    // A move the accuracy check found wrong is hidden until a later check passes (lib/accuracy).
    isNull(moves.hiddenAt),
    q.min ? gte(moves.amount, q.min) : undefined,
    q.league ? eq(moves.league, q.league) : undefined,
    q.wallet ? eq(moves.wallet, q.wallet) : undefined,
    q.marketId ? eq(moves.marketId, q.marketId) : undefined,
    q.until !== undefined ? lte(moves.at, new Date(q.until)) : undefined,
    q.since !== undefined ? gte(moves.at, new Date(q.since)) : undefined,
    q.before !== undefined ? lt(moves.at, new Date(q.before)) : undefined,
    q.settled ? isNotNull(moves.result) : undefined,
  ].filter(Boolean);
  const rs = await db.select().from(moves).where(w.length ? and(...w) : undefined)
    .orderBy(q.byAmount ? desc(moves.amount) : q.settled ? desc(moves.settledAt) : desc(moves.at)).limit(Math.min(q.limit ?? 50, 200));
  return rs.map(fromRow);
}

export async function moveById(db: Db, id: string): Promise<Move | null> {
  const r = await db.select().from(moves).where(and(eq(moves.id, id), isNull(moves.hiddenAt))).limit(1);
  return r[0] ? fromRow(r[0]) : null;
}

/** For Polymarket markets: the matched Kalshi market's link, when the matching engine paired them. */
export async function kalshiMatches(db: Db, polymarketIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(polymarketIds)];
  if (!ids.length) return new Map();
  const r = await db.execute(sql`select case when p.data->'a'->>'venue' = 'polymarket' then p.data->'a'->>'id' else p.data->'b'->>'id' end as poly,
      k.data->>'url' as url
    from terminal.pairs p
    join terminal.markets k on k.venue = 'kalshi' and k.id = case when p.data->'a'->>'venue' = 'kalshi' then p.data->'a'->>'id' else p.data->'b'->>'id' end
    where not p.blocked and (
      (p.data->'a'->>'venue' = 'polymarket' and p.data->'a'->>'id' in (${sql.join(ids.map(i => sql`${i}`), sql`, `)}))
      or (p.data->'b'->>'venue' = 'polymarket' and p.data->'b'->>'id' in (${sql.join(ids.map(i => sql`${i}`), sql`, `)})))`);
  return new Map((r.rows as Array<{ poly: string; url: string | null }>).filter(x => x.url).map(x => [x.poly, x.url!]));
}

/** "Big money in the last 24h: $1.2M on Yes, $300k on No", per outcome side. */
export async function moneyBySide(db: Db, marketId: string, since: Date): Promise<Array<{ outcome: string; side: "yes" | "no"; total: number }>> {
  const r = await db.select({ outcome: sql<string>`max(${moves.outcome})`, side: moves.outcomeSide, total: sql<number>`sum(${moves.amount})::float` })
    .from(moves).where(and(eq(moves.marketId, marketId), gte(moves.at, since))).groupBy(moves.outcomeSide);
  return r;
}

export async function addWaitlist(db: Db, email: string, feature: string): Promise<void> {
  await db.insert(waitlist).values({ email: email.toLowerCase(), feature }).onConflictDoNothing();
}

export async function followList(db: Db, userId: string): Promise<Array<{ kind: "trader" | "market"; target: string; push: boolean; email: boolean }>> {
  return db.select({ kind: follows.kind, target: follows.target, push: follows.push, email: follows.email }).from(follows).where(eq(follows.userId, userId));
}
export async function follow(db: Db, userId: string, kind: "trader" | "market", target: string): Promise<void> {
  await db.insert(follows).values({ userId, kind, target }).onConflictDoNothing();
}
export async function unfollow(db: Db, userId: string, kind: "trader" | "market", target: string): Promise<void> {
  await db.delete(follows).where(and(eq(follows.userId, userId), eq(follows.kind, kind), eq(follows.target, target)));
}

/** The stored market for a move (for the market page: title, live price, rules link). */
export async function storedMarket(db: Db, venue: "polymarket" | "kalshi", id: string) {
  const r = await db.select({ data: markets.data }).from(markets).where(and(eq(markets.venue, venue), eq(markets.id, id))).limit(1);
  return r[0]?.data ?? null;
}
