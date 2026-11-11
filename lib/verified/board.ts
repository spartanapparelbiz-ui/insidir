/* The leaderboard of $1M+ wallets (wallet_verification): Verified first, then by all-time profit. Each row: total profit,
 * 30 and 90-day realized profit, win rate and record (90 days, settled positions), record by category, average position
 * as a share of its bankroll, its last 10 settled positions with results (losses as plain as wins), the checks, and
 * whether the viewer follows it. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { shortWallet } from "@/lib/millionaires/watchlist";

export interface BoardWallet {
  wallet: string; short: string; verified: boolean; pnl: number; pnl30: number; pnl90: number; won: number; lost: number; winRate: number | null;
  byCategory: Array<{ category: string; won: number; lost: number; pnl: number }>;
  avgSizePct: number | null; bankroll: number | null;
  last10: Array<{ title: string; outcome: string | null; moneyIn: number; pnl: number; at: number; category: string }>;
  checks: Array<{ key: string; pass: boolean; label: string; detail: string }>;
  checkedAt: number; verifiedSince: number | null; badgeLostAt: number | null; following: boolean;
}

type Row = Record<string, unknown>;
const ms = (v: unknown) => (v ? new Date(String(v)).getTime() : null);
function read(x: Row): BoardWallet {
  const won = Number(x.won), lost = Number(x.lost), wallet = String(x.wallet);
  return {
    wallet, short: shortWallet(wallet), verified: x.verified === true, pnl: Number(x.pnl), pnl30: Number(x.pnl30), pnl90: Number(x.pnl90), won, lost,
    winRate: won + lost > 0 ? won / (won + lost) : null, byCategory: (x.by_category as BoardWallet["byCategory"]) ?? [],
    avgSizePct: x.avg_size_pct === null ? null : Number(x.avg_size_pct), bankroll: x.bankroll === null ? null : Number(x.bankroll),
    last10: (x.last10 as BoardWallet["last10"]) ?? [], checks: (x.checks as BoardWallet["checks"]) ?? [],
    checkedAt: ms(x.checked_at)!, verifiedSince: ms(x.verified_since), badgeLostAt: ms(x.badge_lost_at), following: x.following === true,
  };
}

export async function verifiedBoard(db: Db, o: { userId?: string | null; limit?: number; verifiedOnly?: boolean } = {}): Promise<BoardWallet[]> {
  const r = await db.execute(sql`select v.*, exists (select 1 from terminal.follows f where f.kind = 'trader' and f.target = v.wallet and f.user_id = ${o.userId ?? ""}) as following
    from terminal.wallet_verification v ${o.verifiedOnly ? sql`where v.verified` : sql``}
    order by v.verified desc, v.pnl desc limit ${o.limit ?? 200}`);
  return (r.rows as Row[]).map(read);
}

export async function walletVerdict(db: Db, wallet: string, userId?: string | null): Promise<BoardWallet | null> {
  const r = await db.execute(sql`select v.*, exists (select 1 from terminal.follows f where f.kind = 'trader' and f.target = v.wallet and f.user_id = ${userId ?? ""}) as following
    from terminal.wallet_verification v where v.wallet = ${wallet.toLowerCase()}`);
  return r.rows[0] ? read(r.rows[0] as Row) : null;
}

/** How many wallets pass today, of how many checked. */
export async function verifiedCount(db: Db): Promise<{ verified: number; checked: number }> {
  const r = await db.execute(sql`select count(*) filter (where verified)::int as verified, count(*)::int as checked from terminal.wallet_verification`);
  const x = r.rows[0] as { verified: number; checked: number } | undefined;
  return { verified: x?.verified ?? 0, checked: x?.checked ?? 0 };
}
