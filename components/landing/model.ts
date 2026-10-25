/* Pure helpers behind the public pages (landing, /receipts, /pricing). No I/O, no clock reads: `now` is passed in.
 * Every number these produce comes from rows the caller read from the database. */
import { followGreen, type BacktestResult, type Receipt } from "@/lib/engines/receipts";
import type { FeedRow, FeedViewer } from "@/lib/feed";
import { PLANS, type Entitlements } from "@/lib/plans";
import type { ReceiptRow } from "@/lib/queries";
import { allowedVenues, venuesOk } from "@/lib/region";
import type { Opportunity, Plan, Region } from "@/lib/types";

/** Owner-requested comparison line, in one place so it is easy to change or remove. (The owner's wording was
 *  "Other arbitrage tools charge around $200/mo."; "arbitrage" may only appear inside the FAQ, so it is reworded.) */
export const COMPETITOR_PRICE_LINE = "Other tools that do this charge around $200/mo.";

/** The one call to action on the landing page: into the feed. */
export const LANDING_CTA = "See today's live deals";

/** The owner's FAQ question, kept word for word. Its answer is an explicit No. */
export const RISK_QUESTION = "Is this risk-free?";

/** Risk reversal, shown under the pricing cards only when the log averages at least this many green deals a day. */
export const REFUND_LINE = "Find no green deal in your first 7 days and get a full refund.";
export const REFUND_MIN_GREEN_PER_DAY = 1;
export const REFUND_WINDOW_DAYS = 30;

/** Objection killers, right under the pricing cards. */
export const OBJECTIONS = ["Not a prediction. Just math.", "We never touch your money.", "Cancel in one click."] as const;

/** Stake per green deal in the "if you had followed every green deal" line, dollars. */
export const FOLLOW_STAKE = 500;

/** Receipts shown on the landing page (the full log is on /receipts). */
export const LANDING_RECEIPTS = 8;

/** Free rows shown in the landing page's terminal preview. */
export const PREVIEW_ROWS = 3;

/** Public receipts window in days; Pro members see RECEIPTS_FULL_DAYS. */
export const RECEIPTS_PUBLIC_DAYS = 7;
export const RECEIPTS_FULL_DAYS = 90;

export const DAY_MS = 86_400_000;

/** Midnight UTC of the day `now` falls in. */
export const startOfTodayUTC = (now: number): number => Math.floor(now / DAY_MS) * DAY_MS;

/** Monday 00:00 UTC of the week `ms` falls in. */
export function weekStartUTC(ms: number): number {
  const day = startOfTodayUTC(ms);
  const dow = new Date(day).getUTCDay(); // 0 = Sunday
  return day - ((dow + 6) % 7) * DAY_MS;
}

/** The feed a free, anonymous-style viewer gets in the region the visitor chose (US set when unknown). */
export const publicFeedViewer = (region: Region | null): FeedViewer => ({
  plan: "free", region, minRoi: 0, minSizeUsd: 0, categories: [], venues: [], showYellow: true, showRed: false,
});

/** Where "Start for $39" goes: Whop checkout when configured, else sign-in that lands on the Terminal. */
export const checkoutHref = (url: string | null): string => url ?? "/auth/login?next=/terminal";

/** A real two-leg green cross-venue row from the feed, or null. */
export const realCrossArb = (rows: readonly FeedRow[]): FeedRow | null =>
  rows.find(r => r.kind === "cross_arb" && r.safety === "green" && r.legs.length === 2) ?? null;

/** The hero's per-$1 math for a two-leg lock, in cents per set: what each side costs, the fees, and what's left of
 *  the $1. No dollar size or total profit (those are paid fields). */
export interface PerDollar { aCents: number; bCents: number; inCents: number; feeCents: number; profitCents: number; roi: number }
export function perDollar(o: Opportunity): PerDollar | null {
  const [a, b] = o.legs;
  if (!a || !b || !(o.sets > 0)) return null;
  const c = (v: number) => Math.round(v * 1000) / 10;
  const aCents = c(a.avgPrice), bCents = c(b.avgPrice);
  const feeCents = c(o.fees / o.sets);
  const payCents = c(o.payout / o.sets);
  const inCents = c(a.avgPrice + b.avgPrice);
  return { aCents, bCents, inCents, feeCents, profitCents: Math.round((payCents - inCents - feeCents) * 10) / 10, roi: o.roi };
}

/* ---------- receipts ---------- */

/** Locks only (price gaps are not locks), on venues the viewer's region may see. */
export const visibleReceipts = (rows: readonly ReceiptRow[], region: Region | null): ReceiptRow[] => {
  const venues = allowedVenues(region);
  return rows.filter(r => r.snapshot.kind !== "second_opinion" && venuesOk(r.snapshot, venues));
};

/** A free viewer must not see, in the public log, a deal the delayed feed would not show yet. */
export const outsideDelay = (rows: readonly ReceiptRow[], ent: Entitlements, now: number): ReceiptRow[] =>
  rows.filter(r => r.detectedAt <= now - ent.feedDelayMinutes * 60_000);

export const isSettled = (r: ReceiptRow): boolean => r.settledAt !== null && r.realizedProfit !== null;

export const toReceipt = (r: ReceiptRow): Receipt => ({
  opp: r.snapshot,
  settlement: isSettled(r)
    ? { settled: true, sameWay: r.sameWay === true, realizedPayout: 0, realizedProfit: r.realizedProfit ?? 0 }
    : { settled: false, sameWay: false, realizedPayout: 0, realizedProfit: 0 },
});

/** "Following every green deal with $500": settled green locks, fees included, each capped at what was fillable
 *  at alert time (lib/engines/receipts.ts followGreen). Null when no settled green receipt exists. */
export function followLine(rows: readonly ReceiptRow[], stake: number = FOLLOW_STAKE): BacktestResult | null {
  const res = followGreen(rows.map(toReceipt), stake);
  return res.count > 0 ? res : null;
}

export interface ReceiptTally { total: number; settled: number; sameWay: number; differently: number; open: number }

export function tally(rows: readonly ReceiptRow[]): ReceiptTally {
  let settled = 0, sameWay = 0;
  for (const r of rows) if (isSettled(r)) { settled++; if (r.sameWay === true) sameWay++; }
  return { total: rows.length, settled, sameWay, differently: settled - sameWay, open: rows.length - settled };
}

/** The most recently settled receipts (wins and misses alike, newest settlement first), then open ones. */
export function landingReceipts(rows: readonly ReceiptRow[], n: number = LANDING_RECEIPTS): ReceiptRow[] {
  const settled = rows.filter(isSettled).sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0));
  const open = rows.filter(r => !isSettled(r)).sort((a, b) => b.detectedAt - a.detectedAt);
  return [...settled, ...open].slice(0, n);
}

export interface ReceiptWeek { start: number; rows: ReceiptRow[]; follow: BacktestResult | null; tally: ReceiptTally }

/** Rows grouped by UTC week (Monday start), newest week first. */
export function byWeek(rows: readonly ReceiptRow[], stake: number = FOLLOW_STAKE): ReceiptWeek[] {
  const map = new Map<number, ReceiptRow[]>();
  for (const r of rows) {
    const k = weekStartUTC(r.detectedAt);
    const list = map.get(k);
    if (list) list.push(r); else map.set(k, [r]);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([start, list]) => {
    const sorted = [...list].sort((a, b) => b.detectedAt - a.detectedAt);
    return { start, rows: sorted, follow: followLine(sorted, stake), tally: tally(sorted) };
  });
}

/* ---------- pricing ---------- */

/** Feature lines from a plan's entitlements, so the cards can't drift from what the server enforces. */
export function planFeatures(e: Entitlements): string[] {
  const out: string[] = [];
  out.push(e.feedDelayMinutes > 0 ? `Feed delayed ${e.feedDelayMinutes} min` : "Full live feed");
  if (e.maxRows !== null) out.push(`Top ${e.maxRows} deals`);
  out.push(e.sizesHidden ? "Sizes and dollar profit hidden" : "Sizes and dollar profit");
  // Alerts: web push, with email as the backup; the free plan gets a daily email digest of the delayed feed.
  if (e.alertDelaySeconds === null) out.push("Daily email digest");
  else {
    out.push(e.alertDelaySeconds === 0 ? "Instant push alerts, in seconds" : `Push alerts within ${e.alertDelaySeconds} seconds`);
    out.push("Email backup and daily summary");
  }
  if (e.calculator) out.push("Calculator");
  out.push(e.fullHistory ? "Full receipts history" : "Receipts (last 7 days)");
  if (e.whales) out.push("Whale tracker");
  if (e.pnl) out.push("P&L from your Kalshi CSV");
  return out;
}

export interface PlanCard { plan: Plan; name: string; price: number; tagline: string; features: string[]; inherits: string | null }

/** Free / Insidir / Pro. Pro lists only what it adds over Insidir. */
export function planCards(): PlanCard[] {
  const free = planFeatures(PLANS.free.entitlements);
  const ins = planFeatures(PLANS.insidir.entitlements);
  const pro = planFeatures(PLANS.pro.entitlements).filter(f => !ins.includes(f));
  return [
    { plan: "free", name: PLANS.free.name, price: PLANS.free.price, tagline: PLANS.free.tagline, features: free, inherits: null },
    { plan: "insidir", name: PLANS.insidir.name, price: PLANS.insidir.price, tagline: PLANS.insidir.tagline, features: ins, inherits: null },
    { plan: "pro", name: PLANS.pro.name, price: PLANS.pro.price, tagline: PLANS.pro.tagline, features: pro, inherits: PLANS.insidir.name },
  ];
}
