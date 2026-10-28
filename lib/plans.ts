/* What each plan gets. Enforced on the server (lib/feed.ts redacts before anything is rendered or sent). */
import type { Plan } from "./types";

export interface Entitlements {
  /** The feed shows what was found at least this long ago. 0 = live. */
  feedDelayMinutes: number;
  /** Rows shown; null = all. */
  maxRows: number | null;
  /** Fillable size, dollar profit and profit per day are withheld. */
  sizesHidden: boolean;
  calculator: boolean;
  /** Alerts after this delay from detection; null = no alerts. */
  alertDelaySeconds: number | null;
  whales: boolean;
  pnl: boolean;
  /** Receipts older than the public 7-day window. */
  fullHistory: boolean;
}

export const PLANS: Record<Plan, { name: string; price: number; tagline: string; entitlements: Entitlements }> = {
  free: {
    name: "No plan", price: 0, tagline: "The public preview",
    entitlements: { feedDelayMinutes: 30, maxRows: 3, sizesHidden: true, calculator: false, alertDelaySeconds: null, whales: false, pnl: false, fullHistory: false },
  },
  insidir: {
    name: "Insidir", price: 39, tagline: "Everything, live",
    entitlements: { feedDelayMinutes: 0, maxRows: null, sizesHidden: false, calculator: true, alertDelaySeconds: 0, whales: true, pnl: true, fullHistory: true },
  },
};

/** The one plan, as every button and price line says it. */
export const PRICE = `$${PLANS.insidir.price}/mo`;

/** The trial: the first 7 days for $1 (Whop: a 7-day trial with a $1 initial fee), then the monthly price. Access
 *  starts the moment the $1 is paid (a trialing membership grants it, lib/billing/whop.ts GRANTING). */
export const TRIAL = { days: 7, fee: 1 } as const;

export const entitlements = (plan: Plan): Entitlements => PLANS[plan].entitlements;
export const isPaid = (plan: Plan): boolean => plan !== "free";
