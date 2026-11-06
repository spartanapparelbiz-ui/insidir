import { TRIAL } from "./plans";

/* Copy rules in one place. Never "guaranteed" or "risk-free" for anything we show. */

/** Under every bet and market, at the top of the footer, and wherever data could be mistaken for a tip. */
export const ADVICE = "Information, not financial or betting advice.";

/** On every page. */
export const FOOTER =
  `${ADVICE} Insidir shows public trading data and never recommends a trade or a bet. Big traders lose too. Past results don't predict future ones.`;

/** What Insidir is and isn't, under every page and on /disclosures. */
export const DATA_COMPANY = "Insidir is a data company. It is not a broker, exchange, sportsbook or investment adviser, and isn't affiliated with Polymarket, Kalshi or the SEC.";
/** The problem-gambling line: the footer, every sports page and /disclosures. */
export const GAMBLER = "Gambling problem? Call 1-800-GAMBLER.";
/** Who builds Insidir. */
export const COMPANY = { name: "Aethric LLC", place: "Pompano Beach, FL", email: "hello@aethric.llc", founder: "Nicholas" } as const;

/** The thin bar above the nav, and the one paid call to action (docs/INSIDIR-V2.md §6). */
/** What Insidir is, in one plain sentence: the first FAQ answer, the meta description and link previews. */
export const WHAT_IS = "Every bet from Polymarket wallets up $1M+, live, with the side they took, and the same market on Kalshi where there is one.";
/** The same thing as a title (the home page's <title>, the link preview headline). */
export const WHAT_IS_TITLE = "Insidir: see which side the millionaires bet";
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
export const LOCK_LINE = "Locks in a net P&L if both sides fill and both markets settle the same way.";

/** Words that must never describe a deal (checked over every page by test/compliance.test.ts). The negated form
 *  "Not risk-free" and "aren't guaranteed" are allowed, and so is the FAQ question "Is this risk-free?". */
export const BANNED = [/\bguaranteed\b/i, /\brisk[- ]free\b/i, /\bfree money\b/i, /\beasy money\b/i, /\bsure thing\b/i, /\blocks?\b/i, /\bcan'?t lose\b/i, /\byou should (buy|bet|sell)\b/i];
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

/* ---------- Filings (docs/RESEARCH-DESK.md §2) ---------- */
/** Under every /filings view, in the first-visit notice and under every calculator. */
export const RESEARCH_DISCLAIMER =
  "Insidir is research software made by Aethric LLC. It is not a broker, dealer, or registered investment adviser. All figures are sourced from public SEC records. Not investment advice.";
/** Bump to show the first-visit notice again to everyone. */
export const RESEARCH_DISCLAIMER_V = 1;
/** Under every calculator and the positions desk: their numbers are the member's, not the SEC's. */
export const CALC_LINE = "Calculated only from the numbers you entered. Insidir does not supply estimates or advice.";
/** Words that never appear on a /filings surface (test/filings-compliance.test.ts). */
export const RESEARCH_BANNED = [/\bsignals?\b/i, /\balpha\b/i, /\bprice targets?\b/i, /\btarget price\b/i, /\bfair value\b/i, /\bupside\b/i, /\boutperform/i,
  /\bunderperform/i, /\bstrong buy\b/i, /\bconviction\b/i, /\bbullish\b/i, /\bbearish\b/i, /\bwe recommend\b/i, /\bsmart money\b/i, /\byou should\b/i, /\bfollow the insiders\b/i];
export const researchBanned = (text: string): string[] => [...bannedPhrases(text), ...RESEARCH_BANNED.filter(r => r.test(text)).map(r => r.source)];
