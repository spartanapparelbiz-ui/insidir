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

/** A first period at a lower price, then `price` a month. The Whop plan behind WHOP_PLAN_INSIDIR must match it. */
export interface Intro { price: number; days: number }

/** The only offers: Free, Insidir ($1 for 3 days, then $39/mo) and Pro ($99/mo). */
export const PLANS: Record<Plan, { name: string; price: number; intro: Intro | null; tagline: string; entitlements: Entitlements }> = {
  free: {
    name: "Free", price: 0, intro: null, tagline: "The feed, 30 minutes late",
    entitlements: { feedDelayMinutes: 30, maxRows: 3, sizesHidden: true, calculator: false, alertDelaySeconds: null, whales: false, pnl: false, fullHistory: false },
  },
  insidir: {
    name: "Insidir", price: 39, intro: { price: 1, days: 3 }, tagline: "The live feed and alerts",
    entitlements: { feedDelayMinutes: 0, maxRows: null, sizesHidden: false, calculator: true, alertDelaySeconds: 60, whales: false, pnl: false, fullHistory: false },
  },
  pro: {
    name: "Insidir Pro", price: 99, intro: null, tagline: "For active traders",
    entitlements: { feedDelayMinutes: 0, maxRows: null, sizesHidden: false, calculator: true, alertDelaySeconds: 0, whales: true, pnl: true, fullHistory: true },
  },
};

export const entitlements = (plan: Plan): Entitlements => PLANS[plan].entitlements;

/** "$1 for 3 days, then $39/mo", "$99/mo". */
export function offerText(plan: Plan): string {
  const p = PLANS[plan];
  if (!p.price) return "Free";
  return p.intro ? `$${p.intro.price} for ${p.intro.days} days, then $${p.price}/mo` : `$${p.price}/mo`;
}

/** What a checkout button says: "Try 3 days for $1", "Start Pro for $99/mo". */
export function startText(plan: "insidir" | "pro"): string {
  const p = PLANS[plan];
  return p.intro ? `Try ${p.intro.days} days for $${p.intro.price}` : `Start ${plan === "pro" ? "Pro" : p.name} for $${p.price}/mo`;
}
export const isPaid = (plan: Plan): boolean => plan !== "free";
