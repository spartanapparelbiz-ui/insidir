/* Millionaire pings, pure. A web push the moment a $1M+ wallet opens, adds to, trims or exits a position with $25K+ in
 * one of a member's categories (trims and exits only on a market with a Kalshi twin), with Kalshi's price when it has one:
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
export interface PingBet { id: string; marketId?: string; side?: "yes" | "no"; tier: string; amount: number; category: string; title: string; outcome: string; price: number; pnl: number | null;
  /** What it did to the position (lib/millionaires/positions.ts); a bet without one is an open. */
  kind?: "open" | "add" | "trim" | "exit";
  /** A trim: the share of the position it sold, 0..1. */
  sold?: number;
  /** Where a sell's ping opens (the market's page; a buy opens its bet). */
  path?: string }
/** The market's approved Kalshi twin (lib/twins) and Kalshi's YES price now, when it has one. */
export interface PingTwin { yes: number | null; noAsk?: number | null }

/** Kalshi's price to buy `side` now: the YES price for YES, and the NO ask for NO. Never 1 − the YES ask: that's the
 *  best NO bid, which understates what a NO costs by the spread. Null when Kalshi has no NO offer. Pure. */
export const kalshiSidePrice = (t: PingTwin, side: "yes" | "no" | null | undefined): number | null =>
  side === "no" ? (t.noAsk ?? null) : t.yes;

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
  const kp = twin ? kalshiSidePrice(twin, b.side) : null, kalshi = kp !== null && kp > 0 && kp < 1 ? c(kp) : null;
  const k = kalshi ? ` Kalshi: ${kalshi}.` : "";
  // A sell: what share of the position went, at what price, and Kalshi's price for that side now. Opens the market.
  if (b.kind === "trim" || b.kind === "exit") {
    const share = b.kind === "trim" && b.sold !== undefined ? ` (about ${Math.max(1, Math.round(b.sold * 100))}% of it)` : "";
    const did = b.kind === "exit" ? `sold out of ${b.outcome}` : `sold ${dollars(b.amount)} of ${b.outcome}${share}`;
    return { title: "Insidir", body: `${who} ${did} at ${c(b.price)} on Polymarket.${k}`, url: `${appUrl}${b.path ?? `/bet/${encodeURIComponent(b.id)}`}` };
  }
  if (b.kind === "add") {
    if (twin) return { title: "Insidir", body: `${who} added ${dollars(b.amount)} to ${b.outcome} at ${c(b.price)} on Polymarket.${k}`, url: `${appUrl}/bet/${encodeURIComponent(b.id)}` };
    return { title: "Insidir", body: `${who} just added ${dollars(b.amount)} to ${what} at ${c(b.price)}${now}. Copy?`, url: `${appUrl}/copy/${encodeURIComponent(b.id)}` };
  }
  if (twin) return { title: "Insidir", body: `${who} bought ${b.outcome} at ${c(b.price)} on Polymarket.${k}`, url: `${appUrl}/bet/${encodeURIComponent(b.id)}` };
  return { title: "Insidir", body: `${who} just put ${dollars(b.amount)} on ${what} at ${c(b.price)}${now}. Copy?`, url: `${appUrl}/copy/${encodeURIComponent(b.id)}` };
}
