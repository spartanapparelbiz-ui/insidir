import { TRIAL } from "./plans";

/* Copy rules in one place. Never "guaranteed" or "risk-free" for anything we show. */

/** Under every bet and market, at the top of the footer, and wherever data could be mistaken for a tip. */
export const ADVICE = "Information, not financial advice.";

/** On every page. */
export const FOOTER = "Information, not advice. Verified wallets lose trades too. 18+.";

/** What Insidir is and isn't, under every page and on /disclosures. */
export const DATA_COMPANY = "Insidir is a data company. We are not a broker, exchange or investment adviser, and we aren't affiliated with Kalshi, Polymarket or the SEC. Past results don't predict future results.";
/** The data disclaimer, last in every footer: what Insidir is, and isn't. */
export const DISCLAIMER = "Insidir is a research and data analytics tool. Content is for information only and is not financial or trading advice. Insidir is not a brokerage or exchange and does not take custody of user funds.";
/** Who builds Insidir. */
export const COMPANY = { name: "Aethric LLC", place: "Pompano Beach, FL", email: "hello@aethric.llc", founder: "Nicholas" } as const;

/** The thin bar above the nav, and the one paid call to action (docs/INSIDIR-V2.md §6). */
/** What Insidir is, in one plain sentence: the first FAQ answer, the meta description and link previews. */
/** The one-liner and the line under it (the brand, 2026-11-11). */
export const ONE_LINER = "The intelligence layer for prediction markets.";
export const WHAT_IS = "We track every Polymarket wallet up $1M+, verify which ones are consistently good, and tell you the moment they move.";
/** The Instagram bio, kept here so it's said one way (not shown on the site). */
export const SOCIAL_BIO = ["The intelligence layer for prediction markets.", "Verified wallets. Live signals. Public track record.", "Start for $1 ↓"] as const;
/** The same thing as a title (the home page's <title>, the link preview headline). */
export const WHAT_IS_TITLE = "Insidir: the intelligence layer for prediction markets";
/* The trial, said one way everywhere and always from lib/plans.ts TRIAL (it must match the Whop plan exactly, or
 * whop:setup keeps checkout shut). */
/** "3 days". */
export const TRIAL_DAYS = `${TRIAL.days} days`;
/** "3-day". */
export const TRIAL_ADJ = `${TRIAL.days}-day`;
/** "$1 for your first 3 days". */
export const TRIAL_LINE = `$${TRIAL.fee} for your first ${TRIAL.days} days`;
/** The one paid call to action, everywhere (buttons, the bar above the nav, sheets, emails, share cards): the first
 *  TRIAL.days for TRIAL.fee, then $39/mo. */
export const GET_CTA = `Try ${TRIAL.days} days for $${TRIAL.fee}`;
/** Next to every performance figure. */
export const PAST = "Past results, not a promise.";
/** The nav's one button, for visitors on every page. */
export const NAV_CTA = "Start for $1";
/** What comes after, said next to every price. */
export const THEN_LINE = "then $39/mo, cancel anytime";
/** The small line under a button. */
export const CANCEL_LINE = "Then $39/mo, cancel anytime.";
export const OFFER_BAR = `${GET_CTA}, ${THEN_LINE}.`;
/** What the members-only APIs say to someone without a plan. */
export const MEMBERS_ONLY = `Members only. ${GET_CTA}, ${THEN_LINE}.`;
/** "$1 today. $39 on Nov 4 unless you cancel." (/start, under the button): the date is TRIAL.days from `now`, US Eastern. */
export function chargeLine(now: number): string {
  const d = new Date(now + TRIAL.days * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  return `$${TRIAL.fee} today. $39 on ${d} unless you cancel.`;
}

/** How a lock is described everywhere. */
export const LOCK_LINE = "Fixes a net P&L if both sides fill and both markets settle the same way.";

/** Words that must never describe a deal (checked over every page by test/compliance.test.ts). The negated form
 *  "Not risk-free" and "aren't guaranteed" are allowed, and so is the FAQ question "Is this risk-free?". */
export const BANNED = [/\bguaranteed\b/i, /\brisk[- ]free\b/i, /\bfree money\b/i, /\beasy money\b/i, /\bsure thing\b/i, /\blocks?\b/i, /\bcan'?t lose\b/i, /\byou should (buy|trade|sell)\b/i,
  // The voice (2026-11-11): a company with a system, numbers over adjectives; no hype words.
  /\bpov\b/i, /\binsane(ly)?\b/i, /\b(the|our|my|their|a) secret\b|\bsecret (to|weapon|sauce|strategy|edge|wallets?)\b/i, /\bcheat ?codes?\b/i];
const NEGATED = /\b(not|aren'?t|isn'?t|never|no)\s+(\w+\s+)?(guaranteed|risk[- ]free)\b/gi;
/** A reader's question we answer with "No" (the FAQ's "Is this risk-free?"). */
const QUESTION = /\b(is|are) (this|it|these|deals?) (guaranteed|risk[- ]free)\?/gi;

/** The banned phrases a text uses, after removing negated forms ("not risk-free"). */
export function bannedPhrases(text: string): string[] {
  const cleaned = text.replace(NEGATED, "").replace(QUESTION, "");
  return BANNED.filter(r => r.test(cleaned)).map(r => r.source);
}

/* One name per action, everywhere (buttons say exactly what happens). */
/** Start the checkout (every upgrade button for a visitor). */
export const UNLOCK = GET_CTA;
/** Go to the live Terminal (no account needed). */
export const OPEN_TERMINAL = "See today's live deals";
/** Change any member setting: confirmed with this toast. */
export const SAVED = "Saved";

/** What the money-path monitor looks for on the home page: the landing's own marker (components/brand/landing). */
export const LANDING_MARK = 'data-testid="landing"';
