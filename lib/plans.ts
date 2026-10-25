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
    name: "Free", price: 0, tagline: "The feed, 30 minutes late",
    entitlements: { feedDelayMinutes: 30, maxRows: 3, sizesHidden: true, calculator: false, alertDelaySeconds: null, whales: false, pnl: false, fullHistory: false },
  },
  insidir: {
    name: "Insidir", price: 39, tagline: "The live feed and alerts",
    entitlements: { feedDelayMinutes: 0, maxRows: null, sizesHidden: false, calculator: true, alertDelaySeconds: 60, whales: false, pnl: false, fullHistory: false },
  },
  pro: {
    name: "Insidir Pro", price: 99, tagline: "For active traders",
    entitlements: { feedDelayMinutes: 0, maxRows: null, sizesHidden: false, calculator: true, alertDelaySeconds: 0, whales: true, pnl: true, fullHistory: true },
  },
};

export const entitlements = (plan: Plan): Entitlements => PLANS[plan].entitlements;
export const isPaid = (plan: Plan): boolean => plan !== "free";
