/* Who gets pinged for a new move (docs/INSIDIR-V2.md §7), pure.
 *   Insidir and Pro members: every move by a trader they follow, and every move of $50,000+ in a market they follow.
 *   Pro also: custom rules (any tab, league or size).
 *   Free: no alerts. Quiet hours hold push and email alerts back. One alert per user, move and channel. */
import { inQuietHours } from "@/lib/alerts/quiet";
import type { Plan } from "@/lib/types";
import { agoText, dollars, moveSentence, onWhat, payoutLine } from "./copy";
import { movePlan } from "./gate";
import type { League, Move, Tab, TraderRecord } from "./types";

export const MARKET_ALERT_MIN = 50_000;

export interface MoveRule { tab: Tab | null; league: League | null; min: number }

export interface AlertUser {
  id: string;
  plan: Plan;
  email: string | null;
  push: boolean;
  emailOn: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  timeZone: string | null;
  traders: ReadonlySet<string>;
  markets: ReadonlySet<string>;
  rules: readonly MoveRule[];
}

export type AlertReason = "trader" | "market" | "rule";
export interface AlertJob { userId: string; moveId: string; channel: "push" | "email"; reason: AlertReason }

export function ruleMatches(r: MoveRule, m: Pick<Move, "tab" | "league" | "amount">): boolean {
  return (!r.tab || r.tab === m.tab) && (!r.league || r.league === m.league) && m.amount >= r.min;
}

export function reasonFor(u: AlertUser, m: Move): AlertReason | null {
  const p = movePlan(u.plan);
  if (!p.alerts) return null;
  if (m.wallet && u.traders.has(m.wallet)) return "trader";
  if (u.markets.has(m.marketId) && m.amount >= MARKET_ALERT_MIN) return "market";
  if (p.customRules && u.rules.some(r => ruleMatches(r, m))) return "rule";
  return null;
}

export function alertJobs(users: readonly AlertUser[], moves: readonly Move[], now: number): AlertJob[] {
  const out: AlertJob[] = [];
  for (const u of users) {
    if (inQuietHours(now, u.quietStart, u.quietEnd, u.timeZone)) continue;
    for (const m of moves) {
      const reason = reasonFor(u, m);
      if (!reason) continue;
      if (u.push) out.push({ userId: u.id, moveId: m.id, channel: "push", reason });
      if (u.emailOn && u.email) out.push({ userId: u.id, moveId: m.id, channel: "email", reason });
    }
  }
  return out;
}

export function alertMessage(m: Move, record: TraderRecord | null, reason: AlertReason, appUrl: string, now: number): { title: string; body: string; url: string } {
  const title = reason === "trader" ? "A trader you follow just moved" : reason === "market" ? "Big money in a market you follow" : "A big move matched your rule";
  const body = [moveSentence(m, record), payoutLine(m), agoText(m.at, now) === "just now" ? null : agoText(m.at, now)].filter(Boolean).join(" ");
  return { title, body, url: `${appUrl}/market/${encodeURIComponent(m.marketId)}?from=alert` };
}

/** Moves older than this when the worker sees them don't alert: the news is stale. */
export const ALERT_MAX_AGE_MS = 10 * 60_000;

/* ---------- the daily email (8am ET): yesterday's top 5 moves and how yesterday's top-trader moves settled ---------- */

export const DAILY_HOUR_ET = 8;
export const DAILY_TOP = 5;

/** The hour in New York at `now` (0–23). */
export function hourInNewYork(now: number): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now)).find(p => p.type === "hour")?.value;
  return Number(h ?? 0) % 24;
}

/** Due when it's 8am ET or later, the member wants it, their plan includes it, and none went out in the last 20 hours. */
export function dailyDue(u: { plan: Plan; email: string | null; emailDigest: boolean; lastDigestAt: number | null }, now: number): boolean {
  if (!movePlan(u.plan).dailyEmail || !u.emailDigest || !u.email) return false;
  if (hourInNewYork(now) < DAILY_HOUR_ET) return false;
  return u.lastDigestAt === null || now - u.lastDigestAt > 20 * 3_600_000;
}

export interface DailyEmail { subject: string; heading: string; lines: Array<{ text: string; url?: string }> }

/** `top` are the biggest moves of the last 24h; `settled` are top-trader moves that settled in the last 24h. */
export function dailyEmail(top: readonly Move[], settled: readonly Move[], records: ReadonlyMap<string, TraderRecord>, appUrl: string): DailyEmail {
  const rec = (m: Move) => (m.wallet ? records.get(m.wallet) ?? null : null);
  const link = (m: Move) => `${appUrl}/market/${encodeURIComponent(m.marketId)}?from=daily`;
  const lines: DailyEmail["lines"] = [];
  if (top.length) {
    lines.push({ text: "The biggest money moves of the last 24 hours:" });
    for (const m of top.slice(0, DAILY_TOP)) lines.push({ text: [moveSentence(m, rec(m), false), payoutLine(m)].filter(Boolean).join(" "), url: link(m) });
  } else lines.push({ text: "No moves of $10,000 or more in the last 24 hours." });
  const done = settled.filter(m => m.result === "won" || m.result === "lost");
  if (done.length) {
    const won = done.filter(m => m.result === "won").length;
    lines.push({ text: `How yesterday's top-trader moves settled: ${won} won, ${done.length - won} lost.` });
    for (const m of done.slice(0, DAILY_TOP)) lines.push({ text: `${m.result === "won" ? "Won" : "Lost"}: ${dollars(m.amount)} on ${onWhat(m)}.`, url: link(m) });
  }
  const biggest = top[0];
  const subject = biggest ? `${dollars(biggest.amount)} on ${onWhat(biggest)}, and more` : "Yesterday on Insidir";
  return { subject: subject.length > 90 ? "Yesterday's biggest money moves" : subject, heading: "Yesterday's biggest money moves", lines };
}
