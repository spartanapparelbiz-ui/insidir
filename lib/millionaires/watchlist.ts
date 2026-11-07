/* The millionaire watchlist: the top WATCHLIST_SIZE wallets by all-time profit on Polymarket's public leaderboard
 * (GET /v2/leaderboard?timePeriod=ALL&orderBy=PNL, cursor pages), refreshed once a day by the worker. Each gets a tier
 * from its profit: Millionaire ($1M+), Pro ($100K+); below that it isn't watched. Only the wallet, tier and profit are
 * stored. Names, pictures and leaderboard positions are read past and never kept, so nothing can show who is behind
 * a wallet or where it ranks. The same profit refreshes terminal.wallet_pnl for wallets it already holds; wallets it
 * doesn't hold yet are queued for the proven-wallet backfill (lib/moves/proven-backfill.ts), which reads their closed
 * positions too. */
import { inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { trackedWallets, walletPnl, walletPnlQueue, watchlist } from "@/lib/db/schema";
import { isObject, num, rows, str } from "@/lib/exchanges/parse";
import { leaderboardCursor } from "@/lib/moves/sources";

export const WATCHLIST_SIZE = 1_000;
export const WATCHLIST_MS = 24 * 3_600_000;
const PAGE = 100;
export const MILLIONAIRE_MIN = 1_000_000;
export const PRO_MIN = 100_000;

export type Tier = "millionaire" | "pro";
export const tierOf = (pnl: number): Tier | null => (pnl >= MILLIONAIRE_MIN ? "millionaire" : pnl >= PRO_MIN ? "pro" : null);
export const TIER_NAME: Record<Tier, string> = { millionaire: "Millionaire", pro: "Pro" };

/** "0x5668…5839": the only way a wallet is ever named on Insidir's new pages. */
export const shortWallet = (w: string): string => (/^0x[0-9a-f]{40}$/i.test(w) ? `${w.slice(0, 6)}…${w.slice(-4)}` : w);

/** A leaderboard page → wallet and profit only (the username, picture and rank are dropped here). */
export function readBoardPnl(raw: unknown): Array<{ wallet: string; pnl: number }> {
  const out: Array<{ wallet: string; pnl: number }> = [];
  for (const r of rows(raw)) {
    const wallet = (str(r.user_id) ?? str(r.proxyWallet) ?? "").toLowerCase();
    const pnl = num(r.pnl);
    if (/^0x[0-9a-f]{40}$/.test(wallet) && pnl !== null && Number.isFinite(pnl)) out.push({ wallet, pnl: Math.round(pnl * 100) / 100 });
  }
  return out;
}

export interface BoardSource { getLeaderboardPage(o: { timePeriod: "ALL"; category?: string; limit?: number; cursor?: string | null; priority?: "hot" | "normal" }): Promise<unknown> }

/** The top `size` wallets by all-time profit, each once, with a tier (wallets under PRO_MIN dropped). */
export async function readTop(poly: BoardSource, size = WATCHLIST_SIZE): Promise<Array<{ wallet: string; pnl: number; tier: Tier }>> {
  const seen = new Map<string, number>();
  let cursor: string | null = null;
  for (let page = 0; seen.size < size && page < Math.ceil(size / PAGE) + 2; page++) {
    const raw = await poly.getLeaderboardPage({ timePeriod: "ALL", limit: PAGE, cursor, priority: "normal" });
    if (isObject(raw) && "error" in raw) throw new Error(`leaderboard: ${String(raw.error)}`);
    const got = readBoardPnl(raw);
    for (const r of got) if (!seen.has(r.wallet) && seen.size < size) seen.set(r.wallet, r.pnl);
    cursor = leaderboardCursor(raw);
    if (!cursor || !got.length) break;
  }
  return [...seen].flatMap(([wallet, pnl]) => { const tier = tierOf(pnl); return tier ? [{ wallet, pnl, tier }] : []; });
}

/** Replaces the watchlist with today's top (in one transaction) and refreshes wallet_pnl. A short read (under half the
 *  list, e.g. a failed page) leaves yesterday's list in place. */
export async function refreshWatchlist(db: Db, poly: BoardSource, now: number): Promise<{ wallets: number; millionaires: number }> {
  const top = await readTop(poly);
  if (top.length < WATCHLIST_SIZE / 2) throw new Error(`leaderboard: only ${top.length} wallets read`);
  const at = new Date(now);
  await db.transaction(async tx => {
    for (let i = 0; i < top.length; i += 500) {
      await tx.insert(watchlist).values(top.slice(i, i + 500).map(t => ({ ...t, refreshedAt: at })))
        .onConflictDoUpdate({ target: watchlist.wallet, set: {
          // A screened $1M+ wallet keeps the screen's verdict (lib/millionaires/proven.ts): millionaire only when proven.
          tier: sql`case when excluded.tier = 'millionaire' and ${watchlist.screenedAt} is not null and ${watchlist.exclusion} is not null then 'pro' else excluded.tier end`,
          pnl: sql`excluded.pnl`, refreshedAt: at } });
    }
    await tx.delete(watchlist).where(notInArray(watchlist.wallet, top.map(t => t.wallet)));
    const have = new Set((await tx.select({ w: walletPnl.wallet }).from(walletPnl).where(inArray(walletPnl.wallet, top.map(t => t.wallet)))).map(r => r.w));
    for (const t of top) if (have.has(t.wallet)) await tx.update(walletPnl).set({ pnl: t.pnl }).where(sql`${walletPnl.wallet} = ${t.wallet}`);
    const missing = top.filter(t => !have.has(t.wallet)).map(t => ({ wallet: t.wallet, queuedAt: at }));
    for (let i = 0; i < missing.length; i += 500) await tx.insert(walletPnlQueue).values(missing.slice(i, i + 500)).onConflictDoNothing();
    // Millionaire-tier wallets get their resolved positions read too (moves:records), for the landing's wallet
    // spotlight. Never a name: one already tracked keeps its row as it is.
    const mil = top.filter(t => t.tier === "millionaire").map(t => ({ wallet: t.wallet, name: null, reason: "watchlist" }));
    for (let i = 0; i < mil.length; i += 500) await tx.insert(trackedWallets).values(mil.slice(i, i + 500)).onConflictDoNothing();
  });
  return { wallets: top.length, millionaires: top.filter(t => t.tier === "millionaire").length };
}

/** When the list was last refreshed (null: never). */
export async function watchlistAge(db: Db): Promise<number | null> {
  const r = await db.execute(sql`select max(refreshed_at) as at from terminal.watchlist`);
  const at = (r.rows[0] as { at: Date | string | null } | undefined)?.at;
  return at ? new Date(at).getTime() : null;
}

/** The watchlist in memory for the poller (wallet → tier), re-read from the database every few minutes. */
export class WatchCache {
  private map = new Map<string, Tier>();
  private at = 0;
  constructor(private readonly ttlMs = 5 * 60_000) {}
  async load(db: Db, now: number): Promise<ReadonlyMap<string, Tier>> {
    if (now - this.at < this.ttlMs && this.map.size) return this.map;
    const rs = await db.select({ wallet: watchlist.wallet, tier: watchlist.tier }).from(watchlist);
    this.map = new Map(rs.map(r => [r.wallet, r.tier]));
    this.at = now;
    return this.map;
  }
  /** Forget the copy, so the next load re-reads the table (after the daily refresh). */
  invalidate(): void { this.at = 0; }
  has(wallet: string): boolean { return this.map.has(wallet.toLowerCase()); }
  tier(wallet: string): Tier | null { return this.map.get(wallet.toLowerCase()) ?? null; }
}
