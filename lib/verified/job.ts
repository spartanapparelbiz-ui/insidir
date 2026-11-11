/* The daily Verified run (worker verified:check): every wallet up $1M+ on the watchlist, read from its public record
 * (lib/verified/read.ts), judged (checks.ts) and stored in terminal.wallet_verification. A wallet that was Verified and
 * no longer passes loses the badge (badge_lost_at), and each member who follows it gets a push saying which test it
 * failed. A wallet whose read fails keeps yesterday's row. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { walletVerification } from "@/lib/db/schema";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { MIN_PNL, verdict, type Verdict, type WalletRead } from "./checks";
import { readWallet } from "./read";

export const RECHECK_MS = 20 * 3_600_000;

export function rowFor(v: Verdict, r: WalletRead, now: number, prev: { verified: boolean; verifiedSince: Date | null } | null) {
  const since = v.verified ? (prev?.verified && prev.verifiedSince ? prev.verifiedSince : new Date(now)) : null;
  return {
    wallet: v.wallet, verified: v.verified, checks: v.checks, months: v.months, pnl: r.pnl, pnl30: v.pnl30, pnl90: v.pnl90, won: v.won, lost: v.lost,
    byCategory: v.byCategory.slice(0, 12), bankroll: v.bankroll, avgSize: v.avgSize, avgSizePct: v.avgSizePct, hedgeShare: v.hedgeShare,
    last10: r.recent.slice(0, 10).map(p => ({ title: p.title, outcome: p.outcome, moneyIn: p.moneyIn, pnl: p.pnl, at: p.at, category: p.category })),
    checkedAt: new Date(now), verifiedSince: since, badgeLostAt: prev?.verified && !v.verified ? new Date(now) : null,
  };
}

/** The push a follower gets when a wallet loses its badge. */
export function badgeLostMessage(wallet: string, v: Pick<Verdict, "checks">, appUrl: string): { title: string; body: string; url: string } {
  const failed = v.checks.filter(c => !c.pass).map(c => c.label.toLowerCase());
  return { title: "A wallet you follow lost its Verified badge", body: `${shortWallet(wallet)} no longer passes: ${failed.join("; ")}. Its new trades are still sent to you while you follow it.`, url: `${appUrl}/trader/${wallet}` };
}

/** Wallets due a check (up $1M+, not checked in RECHECK_MS), oldest first, `limit` of them; then judge and store each. */
export async function verifiedOnce(db: Db, now: number, o: { limit?: number; read?: typeof readWallet; onLost?: (wallet: string, v: Verdict) => Promise<void> } = {}): Promise<{ checked: number; verified: number; lost: number; failed: number }> {
  const due = (await db.execute(sql`select w.wallet, w.pnl::float as pnl, v.verified, v.verified_since from terminal.watchlist w
      left join terminal.wallet_verification v on v.wallet = w.wallet
    where w.pnl >= ${MIN_PNL} and (v.checked_at is null or v.checked_at < ${new Date(now - RECHECK_MS)})
    order by v.checked_at asc nulls first, w.pnl desc limit ${o.limit ?? 30}`)).rows as Array<{ wallet: string; pnl: number; verified: boolean | null; verified_since: string | null }>;
  let verified = 0, lost = 0, failed = 0;
  for (const d of due) {
    try {
      const r = await (o.read ?? readWallet)(d.wallet, d.pnl, null, now);
      const v = verdict(r, now);
      const prev = d.verified === null ? null : { verified: d.verified, verifiedSince: d.verified_since ? new Date(d.verified_since) : null };
      const row = rowFor(v, r, now, prev);
      await db.insert(walletVerification).values(row).onConflictDoUpdate({ target: walletVerification.wallet, set: { ...row, badgeLostAt: row.badgeLostAt ?? sql`${walletVerification.badgeLostAt}` } });
      if (v.verified) verified++;
      if (row.badgeLostAt) { lost++; await o.onLost?.(d.wallet, v).catch(() => undefined); }
    } catch { failed++; }
  }
  return { checked: due.length - failed, verified, lost, failed };
}
