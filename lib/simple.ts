/* The Simple view's words and math: one deal as a short sentence anyone can read, and the "Show me how" steps for an
 * amount the user types. Pure: no I/O, no clock reads (`now` is passed in), so the server and the browser agree.
 *
 * Everything comes from fields every plan already receives (leg prices, the return, what one set pays), so free
 * viewers get the same sentence scaled to $100, with no size. The math:
 *   one set costs c (the leg prices added up) and pays P (1 for a two-sided deal);
 *   with fees the set costs T = P / (1 + roi), so what you keep per set is P − T and the fee per set is T − c.
 * "Put in" is what the shares cost before fees, the number on each app's buy screen; the apps add their fee on top.
 * Kalshi rounds its fee up to the cent, so every "keep" is "about". */
import type { FeedLeg, FeedRow } from "./feed";
import type { Safety } from "./types";

/** "Same rules?" answers: Yes, Check, No. */
export const SAME_RULES: Record<Safety, string> = { green: "Yes", yellow: "Check", red: "No" };

/** One short line per number, opened by the "?" next to it. Grade 6 or below. */
export const HELP = {
  putIn: "Put in = what you pay for the shares on both apps. The apps add a small fee on top.",
  back: "Get back = what the winning side pays you when it ends. One side always wins, so you get this either way.",
  keep: "You keep = what's left after both apps take their fees.",
  make: "You make = what you keep for each $100 you put in.",
  upTo: "Works up to = the most you can put in before the prices get worse.",
  pays: "Pays out = when it ends and the winning side pays you.",
  rules: "Same rules = both apps pick the winner the same way. Yes means they match, and Check means read both first.",
  found: "Found = how long ago we saw this price gap.",
  price: "A share costs this much. If it wins, it pays $1.",
  fees: "Fees = what the two apps charge you to buy. We take them off every number.",
} as const;
export type HelpKey = keyof typeof HELP;

const r2 = (v: number): number => Math.round(v * 100) / 100;
const cents = (c: number): string => (Number.isInteger(c) ? String(c) : c.toFixed(1)) + "¢";
/** "$95", "$4.60", "$1,280". Whole dollars drop the cents. */
export function money(v: number): string {
  const a = Math.abs(r2(v));
  const s = Number.isInteger(a) ? a.toLocaleString("en-US") : a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "−$" : "$") + s;
}

/** The leg as the sentence names it: "YES on Kalshi (55¢)". */
export const legText = (l: Pick<FeedLeg, "side" | "venueName" | "priceCents">): string => `${l.side.toUpperCase()} on ${l.venueName} (${cents(l.priceCents)})`;

export interface PerSet {
  /** The shares of one set, before fees (dollars). */
  cost: number;
  /** What one set pays back, whichever way it ends. */
  payout: number;
  /** Kept after fees, per set. */
  keep: number;
  fee: number;
}

export function perSet(row: Pick<FeedRow, "legs" | "roi" | "payoutPerSet">): PerSet {
  const cost = row.legs.reduce((a, l) => a + l.priceCents, 0) / 100;
  const payout = row.payoutPerSet > 0 ? row.payoutPerSet : 1;
  const total = payout / (1 + row.roi);
  return { cost, payout, keep: payout - total, fee: Math.max(0, total - cost) };
}

export interface SimpleDeal {
  /** False for a price gap that is only a tip (second opinion): no walkthrough, no "either way". */
  lock: boolean;
  /** "Buy YES on Kalshi (55¢) + NO on Polymarket (40¢)." */
  buy: string;
  /** For $100 back: what you put in, and what you keep after fees. */
  putIn: number;
  back: number;
  keep: number;
  /** Paid viewers only: the most you can put in (the shares at the deal's full size, before fees). */
  upTo: number | null;
  sameRules: string;
}

const BACK = 100;

/** The deal in plain words, scaled so you get $100 back. */
export function simpleDeal(row: FeedRow): SimpleDeal {
  const lock = row.kind !== "second_opinion";
  const s = perSet(row);
  const sets = BACK / s.payout;
  const sameVenue = row.legs.length > 1 && row.legs.every(l => l.venue === row.legs[0]!.venue);
  let buy: string;
  if (!lock) {
    const l = row.legs[0];
    buy = l ? `${l.venueName} sells YES for ${cents(l.priceCents)}. The other app asks ${cents(l.priceCents + (row.gapCents ?? 0))}.` : "Two apps disagree on the price.";
  } else if (sameVenue && row.legs.length > 2 && row.legs.every(l => l.side === row.legs[0]!.side)) {
    buy = `Buy ${row.legs[0]!.side.toUpperCase()} on all ${row.legs.length} choices on ${row.legs[0]!.venueName} (${cents(r2(s.cost * 100))} in all).`;
  } else {
    buy = "Buy " + row.legs.map(legText).join(" + ") + ".";
  }
  return {
    lock, buy, putIn: r2(sets * s.cost), back: BACK, keep: r2(sets * s.keep),
    upTo: row.cost === null ? null : r2(row.cost), sameRules: SAME_RULES[row.safety],
  };
}

/* ---------- when it pays out ---------- */

const DAY = 86_400_000;
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const partOfDay = (h: number): string => (h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night");
const dayKey = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "in 3 days": the same on the server and in every time zone. */
export function paysOutRough(closeTime: number | null, now: number): string {
  if (closeTime === null) return "when it ends";
  const d = (closeTime - now) / DAY;
  if (d <= 0) return "soon";
  if (d < 1) return "within a day";
  const n = Math.round(d);
  return `in ${n} ${n === 1 ? "day" : "days"}`;
}

/** "Sunday night", "tonight", "tomorrow morning", "Nov 30": in the viewer's own time zone (render in the browser). */
export function paysOutLocal(closeTime: number | null, now: number): string {
  if (closeTime === null) return "when it ends";
  if (closeTime <= now) return "soon";
  const end = new Date(closeTime), today = new Date(now);
  const days = Math.round((dayKey(end) - dayKey(today)) / DAY);
  const part = partOfDay(end.getHours());
  if (days === 0) return part === "night" || part === "evening" ? "tonight" : `this ${part}`;
  if (days === 1) return `tomorrow ${part}`;
  if (days < 7) return `${WEEKDAY.format(end)} ${part}`;
  if (days < 60) return `${MONTH_DAY.format(end)} (in ${days} days)`;
  return `in ${Math.round(days / 30)} months`;
}

/* ---------- Show me how ---------- */

export interface HowStep { venueName: string; url: string; side: string; priceCents: number; label: string; shares: number; spend: number }

export interface HowResult {
  steps: HowStep[];
  /** What the shares cost in all, before fees. */
  spend: number;
  back: number;
  fees: number;
  keep: number;
  /** The amount was cut to what the deal can take (paid viewers, who know the size). */
  capped: boolean;
  reason: "ok" | "empty" | "too_small";
}

/** What to buy on each app for an amount the user types (dollars for the shares, before fees). Whole shares only. */
export function howTo(row: FeedRow, amount: number): HowResult {
  const s = perSet(row);
  const empty = (reason: HowResult["reason"]): HowResult => ({ steps: row.legs.map(l => ({ ...stepOf(l), shares: 0, spend: 0 })), spend: 0, back: 0, fees: 0, keep: 0, capped: false, reason });
  if (!Number.isFinite(amount) || amount <= 0 || !(s.cost > 0)) return empty("empty");
  let shares = Math.floor(amount / s.cost + 1e-9);
  let capped = false;
  if (row.sets !== null && shares > Math.floor(row.sets)) { shares = Math.floor(row.sets); capped = true; }
  if (shares < 1) return empty("too_small");
  const steps = row.legs.map(l => ({ ...stepOf(l), shares, spend: r2(shares * l.priceCents / 100) }));
  return {
    steps, spend: r2(steps.reduce((a, x) => a + x.spend, 0)), back: r2(shares * s.payout), fees: r2(shares * s.fee), keep: r2(shares * s.keep), capped, reason: "ok",
  };
}
const stepOf = (l: FeedLeg) => ({ venueName: l.venueName, url: l.url, side: l.side.toUpperCase(), priceCents: l.priceCents, label: l.label });

/** The amount the box starts with: what you put in to get $100 back. */
export const startAmount = (row: FeedRow): number => simpleDeal(row).putIn;
