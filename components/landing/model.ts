/* Pure helpers behind the public pages (landing, /receipts, /pricing). No I/O, no clock reads: `now` is passed in.
 * Every number these produce comes from rows the caller read from the database. */
import { followGreen, type BacktestResult, type Receipt } from "@/lib/engines/receipts";
import type { FeedRow, FeedViewer, StoredOpp } from "@/lib/feed";
import { PLANS, type Entitlements } from "@/lib/plans";
import type { ReceiptRow } from "@/lib/queries";
import type { NearMiss } from "@/lib/engines/near-miss";
import { allowedVenues, venuesOk } from "@/lib/region";
import { VENUE_NAME, type Opportunity, type Plan, type Region } from "@/lib/types";

/** Owner-requested comparison line, in one place so it is easy to change or remove. (The owner's wording was
 *  "Other arbitrage tools charge around $200/mo."; "arbitrage" may only appear inside the FAQ, so it is reworded.) */
export const COMPETITOR_PRICE_LINE = "Other tools that do this charge around $200/mo.";

/** The hero's sub line. */
export const HERO_SUB = "Insidir scans Polymarket and Kalshi every few seconds for prices that lock in a net P&L after fees.";

/** The one call to action on the landing page: into the feed. */
export const LANDING_CTA = "See today's live deals";

/** The owner's FAQ question, kept word for word. Its answer is an explicit No. */
export const RISK_QUESTION = "Is this risk-free?";

/** Risk reversal, shown under the pricing cards only when the log averages at least this many green deals a day. */
export const REFUND_LINE = "Find no green deal in your first 7 days and get a full refund.";
export const REFUND_MIN_GREEN_PER_DAY = 1;
export const REFUND_WINDOW_DAYS = 30;

/** Objection killers, right under the pricing cards. */
export const OBJECTIONS = ["Not a prediction. Arithmetic.", "We never touch your money.", "Cancel anytime."] as const;

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

/** Where "Unlock live deals" goes: Whop checkout when configured, else sign-in that lands on the Terminal. */
export const checkoutHref = (url: string | null): string => url ?? "/login?next=/terminal";

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
  out.push(e.sizesHidden ? "Sizes and dollar net P&L hidden" : "Sizes and dollar net P&L");
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

/** The preview and the one plan (legacy Terminal pages). */
export function planCards(): PlanCard[] {
  const free = planFeatures(PLANS.free.entitlements);
  const ins = planFeatures(PLANS.insidir.entitlements);
  return [
    { plan: "free", name: PLANS.free.name, price: PLANS.free.price, tagline: PLANS.free.tagline, features: free, inherits: null },
    { plan: "insidir", name: PLANS.insidir.name, price: PLANS.insidir.price, tagline: PLANS.insidir.tagline, features: ins, inherits: null },
  ];
}

/* ---------- the hero ---------- */

/** One side of the hero split. */
export interface HeroLeg { venueName: string; side: "YES" | "NO"; priceCents: number }

/** The hero's deal as this viewer may see it: on their clock (free: 30 minutes late), a green two-venue lock from
 *  the last 24 hours that is still open on that clock. Prices are as found, or as of the latest real price tick
 *  before the viewer's clock (applied by the caller). */
export interface HeroSplit {
  oppId: string;
  title: string;
  legs: HeroLeg[];
  roi: number;
  firstSeenAt: number;
  /** When it stopped being found, on the viewer's clock; null while open. */
  closedAt: number | null;
}

const heroLegs = (o: Opportunity): HeroLeg[] =>
  o.legs.map(l => ({ venueName: VENUE_NAME[l.venue], side: l.side === "yes" ? "YES" : "NO", priceCents: Math.round(l.avgPrice * 1000) / 10 }));

/** (a) A live green deal: open on the viewer's clock, found in the last 24 hours. */
export function heroSplit(opps: readonly StoredOpp[], region: Region | null, delayMs: number, now: number): HeroSplit | null {
  const clock = now - delayMs;
  const venues = allowedVenues(region);
  const openAt = (s: StoredOpp) => (delayMs > 0 ? s.lastSeenAt >= clock : s.active);
  const pick = opps.filter(s => {
    const o = delayMs > 0 ? s.snapshot : s.live;
    return o.kind === "cross_arb" && o.safety === "green" && o.legs.length === 2 && venuesOk(o, venues)
      && s.firstSeenAt <= clock && s.firstSeenAt >= now - DAY_MS && openAt(s);
  }).sort((a, b) => b.firstSeenAt - a.firstSeenAt)[0];
  if (!pick) return null;
  const o = delayMs > 0 ? pick.snapshot : pick.live;
  return { oppId: o.id, title: o.title, roi: o.roi, firstSeenAt: pick.firstSeenAt, closedAt: null, legs: heroLegs(o) };
}

/** A closed deal from the receipts log, with when it stopped being found. */
export interface ClosedDeal { snapshot: Opportunity; detectedAt: number; closedAt: number }

/** (b) The most recent real deal that has closed, from the receipts of the last 7 days, on the viewer's clock: found
 *  and closed before it (free viewers never learn about a deal earlier than the feed would show it). */
export function lastDeal(rows: readonly ClosedDeal[], region: Region | null, delayMs: number, now: number): HeroSplit | null {
  const clock = now - delayMs;
  const venues = allowedVenues(region);
  const pick = rows.filter(r => r.snapshot.kind === "cross_arb" && r.snapshot.safety === "green" && r.snapshot.legs.length === 2
    && venuesOk(r.snapshot, venues) && r.detectedAt >= now - 7 * DAY_MS && r.detectedAt <= clock && r.closedAt <= clock)
    .sort((a, b) => b.closedAt - a.closedAt)[0];
  if (!pick) return null;
  const o = pick.snapshot;
  return { oppId: o.id, title: o.title, roi: o.roi, firstSeenAt: pick.detectedAt, closedAt: pick.closedAt, legs: heroLegs(o) };
}

/** (c) The closest matched market the viewer's region can trade, from the last scan: not a deal, and labelled so. */
export interface HeroNear { title: string; legs: HeroLeg[]; totalCents: number; at: number }

export function nearestMarket(list: readonly NearMiss[], region: Region | null): HeroNear | null {
  const venues = allowedVenues(region);
  const pick = list.filter(n => n.venues.every(v => venues.includes(v))).sort((a, b) => a.totalCents - b.totalCents)[0];
  if (!pick) return null;
  return {
    title: pick.title, totalCents: pick.totalCents, at: pick.at,
    legs: pick.legs.map(l => ({ venueName: VENUE_NAME[l.venue], side: l.side === "yes" ? "YES" : "NO", priceCents: l.priceCents })),
  };
}

/** What the hero shows, in order of preference: a live deal, the last real deal, the closest market. Null only
 *  before the scanner has ever run (the hero then shows its words alone, never empty boxes). */
export type HeroView =
  | { mode: "live"; split: HeroSplit }
  | { mode: "last"; split: HeroSplit }
  | { mode: "near"; near: HeroNear };

export function heroView(live: HeroSplit | null, last: HeroSplit | null, near: HeroNear | null): HeroView | null {
  if (live) return { mode: "live", split: live };
  if (last) return { mode: "last", split: last };
  if (near) return { mode: "near", near };
  return null;
}

/** The headline count under the hero: today's deals, else this week's, else nothing (the block is hidden). */
export function dealCount(today: number, week: number): { label: string; n: number; period: "today" | "week" } | null {
  if (today > 0) return { label: "Deals found today", n: today, period: "today" };
  if (week > 0) return { label: "Deals this week", n: week, period: "week" };
  return null;
}

/** Profit per $1 paid out, in cents, from the ROI alone (profit / (cost + fees) = roi, cost + fees + profit = $1). */
export const profitCentsPerDollar = (roi: number): number => Math.round((100 * roi / (1 + roi)) * 10) / 10;

/** Live deals a free viewer can't see yet (found inside the delay): counted, never shown. */
export function liveHiddenCount(opps: readonly StoredOpp[], region: Region | null, delayMs: number, now: number): Array<{ foundAt: number }> {
  if (delayMs <= 0) return [];
  const venues = allowedVenues(region);
  return opps.filter(s => s.active && s.firstSeenAt > now - delayMs && s.live.kind !== "second_opinion" && s.live.safety !== "red" && venuesOk(s.live, venues))
    .map(s => ({ foundAt: s.firstSeenAt })).sort((a, b) => b.foundAt - a.foundAt);
}
