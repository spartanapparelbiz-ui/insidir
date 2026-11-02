/* Millionaire pings, the pure part: which member gets which bet, and what the push says.
 *   A ping is a web push the moment a Polymarket wallet with $1M+ all-time profit makes a bet of PING_MIN+ in a
 *   category the member has pings on (settings.pingCats; unset: their onboarding categories, or all of them).
 *   At most PING_DAILY_MAX a day per member (Eastern day), the largest first; quiet hours respected.
 *   "A $1M+ wallet just put $120K on Rams at 69¢ (now 70¢)". The wallet is never named. */
import type { Cat } from "@/lib/nx/data";

export const PING_MIN = 25_000;
export const PING_DAILY_MAX = 5;
/** A bet older than this when the worker sees it isn't "just" any more: no ping. */
export const PING_MAX_AGE_MS = 15 * 60_000;
export const PING_CATS: readonly Cat[] = ["elections", "sports", "economy", "world", "culture"];

/** The onboarding answers (lib/read/member.ts BET_ON keys) as ping categories. */
const BET_ON_CAT: Record<string, Cat> = { nfl: "sports", nba: "sports", cfb: "sports", nhl: "sports", mlb: "sports", soccer: "sports", elections: "elections" };

/** The categories a member's pings are on for. */
export function pingCatsOf(s: { pingCats?: string[] | null; betOn?: string[] | null }): Set<Cat> {
  if (s.pingCats) return new Set(s.pingCats.filter((c): c is Cat => (PING_CATS as readonly string[]).includes(c)));
  const fromOnboarding = new Set((s.betOn ?? []).map(k => BET_ON_CAT[k]).filter((c): c is Cat => Boolean(c)));
  // "Other" on its own, or no answer: every category.
  return fromOnboarding.size ? fromOnboarding : new Set(PING_CATS);
}

export interface PingBet { moveId: string; cat: Cat | null; amount: number; at: number }
export interface PingUser { id: string; cats: ReadonlySet<Cat>; sentToday: number; quiet: boolean }

/** Who gets which bet: one job per member and bet, largest bets first, capped at PING_DAILY_MAX a day. */
export function pingJobs(users: readonly PingUser[], bets: readonly PingBet[], now: number): Array<{ userId: string; moveId: string }> {
  const fresh = bets.filter(b => b.amount >= PING_MIN && now - b.at <= PING_MAX_AGE_MS && b.cat).sort((a, b) => b.amount - a.amount);
  const jobs: Array<{ userId: string; moveId: string }> = [];
  for (const u of users) {
    if (u.quiet) continue;
    let left = PING_DAILY_MAX - u.sentToday;
    for (const b of fresh) {
      if (left <= 0) break;
      if (!u.cats.has(b.cat!)) continue;
      jobs.push({ userId: u.id, moveId: b.moveId });
      left--;
    }
  }
  return jobs;
}

const k = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`);
const c = (p: number) => `${Math.round(p * 100)}¢`;

/** The push: "A $1M+ wallet just put $120K on Rams at 69¢ (now 70¢)", the market as the title. */
export function pingText(b: { amount: number; side: string; priceThen: number; priceNow: number | null; title: string }): { title: string; body: string } {
  return { title: b.title, body: `A $1M+ wallet just put ${k(b.amount)} on ${b.side} at ${c(b.priceThen)}${b.priceNow !== null ? ` (now ${c(b.priceNow)})` : ""}` };
}

/** The Eastern day a ping counts against ("2026-11-02"). */
export const dayET = (t: number): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));

/** The receipts line: "Millionaire pings: 7 won of 11 settled". Losses count; void markets don't. */
export function receiptLine(r: { won: number; lost: number }): string | null {
  const n = r.won + r.lost;
  return n ? `Millionaire pings: ${r.won} won of ${n} settled` : null;
}
