/* The millionaire watchlist (terminal.millionaire_wallets): the top WATCH_TOP wallets by all-time profit on
 * Polymarket's public leaderboard (GET /v1/leaderboard?timePeriod=ALL&orderBy=PNL, paged), plus every wallet already
 * in wallet_pnl. Refreshed daily. Only the pnl is read and stored: never the username, the rank or the picture, and
 * nothing that says who is behind a wallet. Tiers come from pnl (./tiers.ts). */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { rows, str } from "@/lib/exchanges/parse";
import { TIER_MIN } from "./tiers";

export const WATCH_TOP = 1_000;
export const WATCH_MS = 24 * 3_600_000;
const PAGE = 50;

/** pnl from one leaderboard page, and nothing else. */
export function readLeaderboardPnl(raw: unknown): Array<{ wallet: string; pnl: number }> {
  const out: Array<{ wallet: string; pnl: number }> = [];
  for (const r of rows(raw)) {
    const w = (str(r.proxyWallet) ?? str(r.wallet) ?? "").toLowerCase();
    const pnl = Number(r.pnl);
    if (/^0x[0-9a-f]{40}$/.test(w) && Number.isFinite(pnl)) out.push({ wallet: w, pnl });
  }
  return out;
}

export interface LeaderboardSource { getLeaderboardPage(o: { timePeriod: "ALL"; category?: string; limit?: number; offset?: number }): Promise<unknown> }

/** Reads the leaderboard's top WATCH_TOP by all-time pnl and copies in wallet_pnl's tiered wallets. Returns the number
 *  of wallets on the watchlist with $100K+ all-time. */
export async function watchlistOnce(db: Db, poly: LeaderboardSource, now: number, top = WATCH_TOP): Promise<number> {
  const got = new Map<string, number>();
  for (let offset = 0; offset < top; offset += PAGE) {
    let page: Array<{ wallet: string; pnl: number }>;
    try { page = readLeaderboardPnl(await poly.getLeaderboardPage({ timePeriod: "ALL", category: "OVERALL", limit: PAGE, offset })); } catch { break; }
    for (const r of page) if (!got.has(r.wallet)) got.set(r.wallet, r.pnl);
    if (page.length < PAGE) break;
  }
  const at = new Date(now);
  for (const [wallet, pnl] of got) {
    await db.execute(sql`insert into terminal.millionaire_wallets (wallet, pnl, source, read_at) values (${wallet}, ${pnl}, 'leaderboard', ${at})
      on conflict (wallet) do update set pnl = excluded.pnl, source = 'leaderboard', read_at = excluded.read_at`);
  }
  // Every wallet the proven-wallet backfill has read (its own leaderboard row), unless the leaderboard pass just did.
  await db.execute(sql`insert into terminal.millionaire_wallets (wallet, pnl, source, read_at)
      select wallet, pnl, 'wallet_pnl', read_at from terminal.wallet_pnl where pnl is not null
    on conflict (wallet) do update set pnl = excluded.pnl, read_at = excluded.read_at
      where terminal.millionaire_wallets.source = 'wallet_pnl' or terminal.millionaire_wallets.read_at < excluded.read_at`);
  const r = await db.execute(sql`select count(*)::int as n from terminal.millionaire_wallets where pnl >= ${TIER_MIN.pro}`);
  return Number((r.rows[0] as { n: number } | undefined)?.n ?? 0);
}

/** The watchlist's tiered wallets ($100K+) and their pnl, for the poller and the Read. */
export async function watchPnl(db: Db): Promise<Map<string, number>> {
  const r = await db.execute(sql`select wallet, pnl::float as pnl from terminal.millionaire_wallets where pnl >= ${TIER_MIN.pro}`);
  return new Map((r.rows as Array<{ wallet: string; pnl: number }>).map(x => [x.wallet, Number(x.pnl)]));
}
