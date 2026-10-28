/* Moves, trader records, follows and the waitlist in Postgres (terminal schema). Server only. */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveTabs } from "@/lib/features";
import { follows, markets, moves, traderRecords, waitlist, type FollowKind } from "@/lib/db/schema";
import type { FillPart, League, Move, Tab, TraderRecord } from "./types";
import { fromParts, mergeParts } from "./detect";
import { notComboSql } from "./combos";
import type { Realized } from "./realize";

type Row = typeof moves.$inferSelect;

export const fromRow = (r: Row): Move => ({
  id: r.id, source: r.source, marketId: r.marketId, eventTitle: r.eventTitle, marketTitle: r.marketTitle, outcome: r.outcome,
  outcomeSide: r.outcomeSide, amount: r.amount, avgPrice: r.avgPrice, wallet: r.wallet, walletName: r.walletName,
  at: r.at.getTime(), lastAt: r.lastAt.getTime(), fills: r.fills, tab: r.tab, league: (r.league as League | null) ?? null,
  category: r.category, url: r.url, result: r.result ?? null, settledAt: r.settledAt?.getTime() ?? null,
  detail: (r.detail as Move["detail"]) ?? null, newWallet: r.newWallet ?? null, sourceRefs: r.sourceRefs ?? null,
  pnl: r.pnl ?? null, soldShare: r.soldShare ?? null,
});

/** Inserts new moves; a move seen again (more fills merged in) gets its new total. Returns the ids that are new. */
export async function upsertMoves(db: Db, list: readonly Move[]): Promise<string[]> {
  const fresh: string[] = [];
  for (const m of list) {
    // Polymarket: one move per open position (wallet, market, outcome). A position seen again (more buys, or earlier
    // fills the feed delivered late) merges into the row that's already there, by fill id, and any duplicates go.
    if (m.source === "polymarket" && m.wallet && m.parts?.length) {
      const same = await db.select().from(moves).where(and(eq(moves.source, "polymarket"), eq(moves.wallet, m.wallet), eq(moves.marketId, m.marketId),
        eq(moves.outcomeSide, m.outcomeSide), isNull(moves.result), isNull(moves.hiddenAt))).orderBy(moves.createdAt, moves.id);
      if (same.length) {
        const keep = same[0]!;
        const parts = mergeParts(...same.map(r => r.parts), m.parts);
        const merged = fromParts(parts);
        // Rows from before fills were kept can't be added up exactly: never show less than the biggest of them.
        const legacy = same.filter(r => !r.parts?.length).reduce((mx, r) => Math.max(mx, r.amount), 0);
        const useLegacy = legacy > merged.amount;
        await db.update(moves).set({
          parts: sql`${JSON.stringify(parts)}::jsonb`, amount: useLegacy ? legacy : merged.amount, avgPrice: useLegacy ? keep.avgPrice : merged.avgPrice,
          at: new Date(Math.min(merged.at, ...same.map(r => r.at.getTime()))), lastAt: new Date(Math.max(merged.lastAt, ...same.map(r => r.lastAt.getTime()))),
          fills: merged.fills, sourceRefs: sql`${JSON.stringify(merged.sourceRefs ?? [])}::jsonb`, walletName: m.walletName ?? keep.walletName,
        }).where(eq(moves.id, keep.id));
        const extra = same.slice(1).map(r => r.id);
        if (extra.length) await db.delete(moves).where(inArray(moves.id, extra));
        continue;
      }
    }
    const r = await db.insert(moves).values({
      id: m.id, source: m.source, marketId: m.marketId, eventTitle: m.eventTitle, marketTitle: m.marketTitle, outcome: m.outcome,
      outcomeSide: m.outcomeSide, amount: m.amount, avgPrice: m.avgPrice, wallet: m.wallet, walletName: m.walletName,
      at: new Date(m.at), lastAt: new Date(m.lastAt), fills: m.fills, tab: m.tab, league: m.league, category: m.category, url: m.url,
      detail: (m.detail ?? null) as Record<string, unknown> | null, newWallet: m.newWallet ?? null, sourceRefs: m.sourceRefs ?? null, parts: m.parts ?? null,
    }).onConflictDoUpdate({
      target: moves.id,
      set: { amount: m.amount, avgPrice: m.avgPrice, lastAt: new Date(m.lastAt), fills: m.fills, walletName: m.walletName, sourceRefs: m.sourceRefs ?? null, parts: m.parts ?? null },
      setWhere: sql`${moves.fills} < ${m.fills}`,
    }).returning({ id: moves.id, inserted: sql<boolean>`(xmax = 0)` });
    if (r[0]?.inserted) fresh.push(m.id);
  }
  return fresh;
}

/** Polymarket positions saved as more than one move (before moves merged by position): wallet, market, outcome and
 *  every row's id, earliest first. */
export async function duplicatePositions(db: Db, limit: number): Promise<Array<{ wallet: string; marketId: string; outcomeSide: "yes" | "no"; ids: string[] }>> {
  const r = await db.execute(sql`select wallet, market_id, outcome_side, array_agg(id order by at, id) as ids from terminal.moves
    where source = 'polymarket' and wallet is not null and hidden_at is null
    group by wallet, market_id, outcome_side, (result is null) having count(*) > 1 limit ${limit}`);
  return (r.rows as Array<{ wallet: string; market_id: string; outcome_side: "yes" | "no"; ids: string[] }>).map(x => ({ wallet: x.wallet, marketId: x.market_id, outcomeSide: x.outcome_side, ids: x.ids }));
}

/** Folds a duplicate group into its first row: the fills given (from the wallet's own trades) or, without them, the
 *  biggest row's numbers. The record is worked out again for it (realized_at cleared). */
export async function collapsePosition(db: Db, ids: string[], parts: FillPart[] | null): Promise<void> {
  const rows = await db.select().from(moves).where(inArray(moves.id, ids)).orderBy(moves.at, moves.id);
  if (rows.length < 2) return;
  const keep = rows[0]!, biggest = rows.reduce((b, r) => (r.amount > b.amount ? r : b));
  const set = parts?.length ? (() => { const f = fromParts(parts); return { parts, amount: f.amount, avgPrice: f.avgPrice, at: new Date(f.at), lastAt: new Date(f.lastAt), fills: f.fills, sourceRefs: f.sourceRefs }; })()
    : { amount: biggest.amount, avgPrice: biggest.avgPrice, lastAt: new Date(Math.max(...rows.map(r => r.lastAt.getTime()))), fills: Math.max(...rows.map(r => r.fills)),
        sourceRefs: [...new Set(rows.flatMap(r => (Array.isArray(r.sourceRefs) ? r.sourceRefs : [])))] };
  // jsonb arrays as JSON text: a bare JS array would reach Postgres as an array literal ("{}").
  await db.update(moves).set({ ...set, sourceRefs: sql`${JSON.stringify(set.sourceRefs ?? [])}::jsonb`, ...("parts" in set ? { parts: sql`${JSON.stringify(set.parts)}::jsonb` } : {}),
    realizedAt: null, pnl: null, soldShare: null }).where(eq(moves.id, keep.id));
  await db.delete(moves).where(inArray(moves.id, rows.slice(1).map(r => r.id)));
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

/** Settled Polymarket moves not yet checked against the wallet's own trades (biggest first). */
export async function movesToRealize(db: Db, limit: number): Promise<Move[]> {
  const rs = await db.select().from(moves).where(and(eq(moves.source, "polymarket"), isNotNull(moves.result), isNull(moves.realizedAt), isNotNull(moves.wallet)))
    .orderBy(desc(moves.amount)).limit(limit);
  return rs.map(fromRow);
}

/** Stores what a settled Polymarket move really made (lib/moves/realize.ts). A move that turns out not to be a buy
 *  (a sell or a position being closed) is hidden everywhere and left out of the record. */
export async function saveRealized(db: Db, id: string, r: Realized, now: Date): Promise<void> {
  if (r.ok) {
    await db.update(moves).set({ pnl: r.pnl, soldShare: r.soldShare, amount: Math.round(r.amount * 100) / 100, avgPrice: r.avgPrice, realizedAt: now }).where(eq(moves.id, id));
  } else if (r.reason === "not_a_buy") {
    await db.update(moves).set({ realizedAt: now, hiddenAt: now, hiddenReason: "Not a new bet: the wallet was selling or closing a position" }).where(eq(moves.id, id));
  } else {
    await db.update(moves).set({ realizedAt: now }).where(eq(moves.id, id));
  }
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

/** Top traders (as topTraders) who have made moves in what a member picked: their tabs, leagues and market
 *  categories. Topped up from the overall list when fewer qualify. */
export async function topTradersFor(db: Db, p: { tabs: string[]; leagues: string[]; categories: string[] }, limit: number): Promise<TraderRecord[]> {
  const tabs = p.tabs.filter(t => liveTabs().includes(t as Tab));
  const pickIn = sql.join([
    p.leagues.length ? sql`(m.tab = 'sports' and m.league in (${sql.join(p.leagues.map(l => sql`${l}`), sql`, `)}))` : tabs.includes("sports") ? sql`m.tab = 'sports'` : null,
    p.categories.length ? sql`(m.tab = 'markets' and m.category in (${sql.join(p.categories.map(c => sql`${c}`), sql`, `)}))` : tabs.includes("markets") ? sql`m.tab = 'markets'` : null,
  ].filter((x): x is ReturnType<typeof sql> => x !== null), sql` or `);
  const picked = tabs.some(t => t === "sports" || t === "markets")
    ? (await db.select().from(traderRecords).where(and(gte(traderRecords.resolved, 20), sql`${traderRecords.profit} > 0`,
        sql`exists (select 1 from terminal.moves m where m.wallet = ${traderRecords.wallet} and m.hidden_at is null and (${pickIn}))`))
        .orderBy(desc(traderRecords.profit)).limit(limit))
    : [];
  const out = picked.map(r => ({ wallet: r.wallet, name: r.name, resolved: r.resolved, won: r.won, lost: r.lost, profit: r.profit, biggestWin: r.biggestWin, updatedAt: r.updatedAt.getTime() }));
  if (out.length < limit) for (const t of await topTraders(db, limit * 2)) if (out.length < limit && !out.some(o => o.wallet === t.wallet)) out.push(t);
  return out;
}

export interface MoveQuery {
  tab?: Tab | null; min?: number; league?: League | null; wallet?: string | null; marketId?: string | null;
  /** Only moves at or before this time (a free viewer's clock), ms. */
  until?: number; since?: number; before?: number; settled?: boolean; limit?: number;
  /** Skip this many (Results' pages). */
  offset?: number;
  /** Biggest first instead of newest first. */
  byAmount?: boolean;
  /** Any of these leagues / venue categories (a member's picks). */
  leagues?: League[]; categories?: string[];
  /** Only this venue (the home Results preview: Polymarket, the bets in the record). */
  source?: Move["source"];
  /** Only moves by these wallets or in these markets (a member's Following feed); nothing when both are empty. */
  followed?: { wallets: string[]; marketIds: string[] };
}

export async function listMoves(db: Db, q: MoveQuery): Promise<Move[]> {
  // Tabs that aren't live yet (Coming soon) never reach a page, whatever the query asks for.
  const w = [
    inArray(moves.tab, q.tab ? liveTabs().filter(t => t === q.tab) : liveTabs()),
    // A move the accuracy check found wrong is hidden until a later check passes (lib/accuracy).
    isNull(moves.hiddenAt),
    // Multi-leg combos never reach a page (lib/moves/combos.ts).
    notComboSql,
    q.min ? gte(moves.amount, q.min) : undefined,
    q.league ? eq(moves.league, q.league) : undefined,
    q.leagues?.length ? inArray(moves.league, q.leagues) : undefined,
    q.categories?.length ? inArray(moves.category, q.categories) : undefined,
    q.wallet ? eq(moves.wallet, q.wallet) : undefined,
    q.marketId ? eq(moves.marketId, q.marketId) : undefined,
    q.until !== undefined ? lte(moves.at, new Date(q.until)) : undefined,
    q.since !== undefined ? gte(moves.at, new Date(q.since)) : undefined,
    q.before !== undefined ? lt(moves.at, new Date(q.before)) : undefined,
    q.settled ? isNotNull(moves.result) : undefined,
    q.source ? eq(moves.source, q.source) : undefined,
    q.followed ? or(
      q.followed.wallets.length ? inArray(moves.wallet, q.followed.wallets) : undefined,
      q.followed.marketIds.length ? inArray(moves.marketId, q.followed.marketIds) : undefined,
      sql`false`) : undefined,
  ].filter(Boolean);
  const rs = await db.select().from(moves).where(w.length ? and(...w) : undefined)
    // Stocks: insiders' Form 4 buys (days old) before funds' 13F adds (up to months old), each newest first.
    .orderBy(...(q.tab === "stocks" && !q.byAmount && !q.settled ? [sql`(${moves.category} = 'fund')`] : []),
      q.byAmount ? desc(moves.amount) : q.settled ? desc(moves.settledAt) : desc(moves.at), desc(moves.id)).limit(Math.min(q.limit ?? 50, 200)).offset(q.offset ?? 0);
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

export async function followList(db: Db, userId: string): Promise<Array<{ kind: FollowKind; target: string; push: boolean; email: boolean }>> {
  return db.select({ kind: follows.kind, target: follows.target, push: follows.push, email: follows.email }).from(follows).where(eq(follows.userId, userId));
}
export async function follow(db: Db, userId: string, kind: FollowKind, target: string): Promise<void> {
  await db.insert(follows).values({ userId, kind, target }).onConflictDoNothing();
}
export async function unfollow(db: Db, userId: string, kind: FollowKind, target: string): Promise<void> {
  await db.delete(follows).where(and(eq(follows.userId, userId), eq(follows.kind, kind), eq(follows.target, target)));
}

/** The stored market for a move (for the market page: title, live price, rules link). */
export async function storedMarket(db: Db, venue: "polymarket" | "kalshi", id: string) {
  const r = await db.select({ data: markets.data }).from(markets).where(and(eq(markets.venue, venue), eq(markets.id, id))).limit(1);
  return r[0]?.data ?? null;
}
