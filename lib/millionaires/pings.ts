/* Millionaire pings, pure. A web push the moment a $1M+ wallet bets $25K+ in one of a member's categories:
 *   "A +$3.1M wallet just put $120K on Republicans in the Iowa Senate race at 60¢ (now 61¢). Copy?"
 * Tapping it opens the copy ticket (/copy/<bet>). Rules: paid members with push on; their /go categories (none chosen =
 * every category), Elections on for everyone through Election week; at most PING_DAILY_MAX in any 24 hours; nothing in
 * quiet hours (theirs, else 11pm–8am in their time zone, else New York). One ping per member and bet (alerts_sent). The
 * wallet is its tier and profit, never a name. */
import { inQuietHours } from "@/lib/alerts/quiet";
import { dollars } from "@/lib/money";

export const PING_MIN = 25_000;
export const PING_DAILY_MAX = 8;
export const DEFAULT_QUIET = { start: "23:00", end: "08:00" } as const;
/** Elections is on for everyone until the end of Nov 4 ET (Election week). */
export const ELECTIONS_ON_UNTIL = Date.parse("2026-11-05T05:00:00Z");

export interface PingUser { id: string; push: boolean; cats: readonly string[]; quietStart: string | null; quietEnd: string | null; timeZone: string | null; sentLast24h: number }
export interface PingBet { id: string; marketId?: string; side?: "yes" | "no"; tier: string; amount: number; category: string; title: string; outcome: string; price: number; pnl: number | null }
/** The market's approved Kalshi twin (lib/twins) and Kalshi's YES price now, when it has one. */
export interface PingTwin { yes: number | null }

export function pingCategories(u: Pick<PingUser, "cats">, now: number): Set<string> | null {
  if (!u.cats.length) return null; // none chosen: every category
  const s = new Set(u.cats);
  if (now < ELECTIONS_ON_UNTIL) s.add("elections");
  return s;
}

/** Who gets which bet, newest bets first, within each member's daily cap and outside their quiet hours. */
export function pingJobs(users: readonly PingUser[], bets: readonly PingBet[], now: number): Array<{ userId: string; betId: string }> {
  const big = bets.filter(b => b.tier === "millionaire" && b.amount >= PING_MIN);
  const out: Array<{ userId: string; betId: string }> = [];
  for (const u of users) {
    if (!u.push) continue;
    if (inQuietHours(now, u.quietStart ?? DEFAULT_QUIET.start, u.quietEnd ?? DEFAULT_QUIET.end, u.timeZone ?? "America/New_York")) continue;
    const cats = pingCategories(u, now);
    let left = PING_DAILY_MAX - u.sentLast24h;
    for (const b of big) {
      if (left <= 0) break;
      if (cats && !cats.has(b.category)) continue;
      out.push({ userId: u.id, betId: b.id });
      left--;
    }
  }
  return out;
}

const c = (p: number) => `${Math.round(p * 100)}¢`;

/** The ping's words. A Yes/No question names the market in quotes; a named outcome reads "on Republicans in …". */
export function pingMessage(b: PingBet, priceNow: number | null, appUrl: string, twin: PingTwin | null = null): { title: string; body: string; url: string } {
  const who = b.pnl !== null && b.pnl > 0 ? `A +${dollars(b.pnl)} wallet` : "A $1M+ wallet";
  const yn = /^(yes|no)$/i.test(b.outcome.trim());
  const what = yn ? `${b.outcome} in “${b.title}”` : `${b.outcome} in ${b.title}`;
  const now = priceNow !== null && Math.round(priceNow * 100) !== Math.round(b.price * 100) ? ` (now ${c(priceNow)})` : priceNow !== null ? " (still there now)" : "";
  // Kalshi first when the market has a twin: its price for the same side now, and the tap opens the bet's page, which
  // leads with the Kalshi market.
  const kalshi = twin && twin.yes !== null ? c(b.side === "no" ? 1 - twin.yes : twin.yes) : null;
  if (kalshi) return { title: "Insidir", body: `${who} bought ${b.outcome} at ${c(b.price)} on Polymarket. Kalshi: ${kalshi}.`, url: `${appUrl}/bet/${encodeURIComponent(b.id)}` };
  return { title: "Insidir", body: `${who} just put ${dollars(b.amount)} on ${what} at ${c(b.price)}${now}. Copy?`, url: `${appUrl}/copy/${encodeURIComponent(b.id)}` };
}
