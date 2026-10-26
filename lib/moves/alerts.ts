/* Who gets pinged for a new move (docs/V2.md §7), pure.
 *   Insidir and Pro members: every move by a trader they follow, and every move of $50,000+ in a market they follow.
 *   Pro also: custom rules (any tab, league or size).
 *   Free: no alerts. Quiet hours hold push and email alerts back. One alert per user, move and channel. */
import { inQuietHours } from "@/lib/alerts/quiet";
import type { Plan } from "@/lib/types";
import { agoText, moveSentence, payoutLine } from "./copy";
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
