/* What each plan gets of the feed (docs/V2.md §8), enforced on the server before anything is sent:
 *   Free: moves 30 minutes late, no records (so nobody is called a top trader), no follows, no alerts.
 *   Insidir: live moves, records, up to 50 follows, push and email alerts, the daily email.
 *   Pro: everything, plus custom alert rules, unlimited follows and Price gaps. */
import type { Plan } from "@/lib/types";

export interface MovePlan {
  delayMs: number;
  records: boolean;
  /** null = unlimited; 0 = none. */
  maxFollows: number | null;
  alerts: boolean;
  customRules: boolean;
  dailyEmail: boolean;
  priceGaps: boolean;
}

export const MOVE_PLANS: Record<Plan, MovePlan> = {
  free: { delayMs: 30 * 60_000, records: false, maxFollows: 0, alerts: false, customRules: false, dailyEmail: false, priceGaps: false },
  insidir: { delayMs: 0, records: true, maxFollows: 50, alerts: true, customRules: false, dailyEmail: true, priceGaps: false },
  pro: { delayMs: 0, records: true, maxFollows: null, alerts: true, customRules: true, dailyEmail: true, priceGaps: true },
};

export const movePlan = (plan: Plan): MovePlan => MOVE_PLANS[plan];

export function canFollow(plan: Plan, current: number): boolean {
  const max = MOVE_PLANS[plan].maxFollows;
  return max === null || current < max;
}
