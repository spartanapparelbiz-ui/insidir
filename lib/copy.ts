/* Copy rules in one place. Never "guaranteed" or "risk-free" for anything we show. */

/** On every page. */
export const FOOTER =
  "Insidir shows public trading data. It is not financial advice or a recommendation to buy anything. Big traders lose too. Past results don't predict future ones.";

/** What Insidir is and isn't, under every page and on /disclosures. */
export const DATA_COMPANY = "Insidir is a data company. It is not a broker, exchange, sportsbook or investment adviser, and isn't affiliated with Polymarket, Kalshi or the SEC.";
/** The problem-gambling line: the footer, every sports page and /disclosures. */
export const GAMBLER = "Gambling problem? Call 1-800-GAMBLER.";
/** Who builds Insidir. */
export const COMPANY = { name: "Aethric LLC", place: "Pompano Beach, FL", email: "hello@aethric.llc", founder: "Nicholas" } as const;

/** The thin bar above the nav, and the one paid call to action (docs/INSIDIR-V2.md §6). */
/** What Insidir is, in one plain sentence: the first FAQ answer, the meta description and link previews. */
export const WHAT_IS = "Insidir tracks large positions on sports, prediction markets and insider stock trades as they are opened: the account, the size, and its record.";
/** The same thing as a title (the home page's <title>, the link preview headline). */
export const WHAT_IS_TITLE = "Insidir: live trackers of large positions on prediction markets and insider stock trades";
/** The one paid call to action, everywhere (buttons, the bar above the nav, sheets, emails, share cards): the first
 *  7 days for $1 (lib/plans.ts TRIAL), then $39/mo. */
export const GET_CTA = "Try 7 days for $1";
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
/** "$1 today. $39 on Nov 4 unless you cancel." (/start, under the button): the date is 7 days from `now`, US Eastern. */
export function chargeLine(now: number): string {
  const d = new Date(now + 7 * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  return `$1 today. $39 on ${d} unless you cancel.`;
}

/** How a lock is described everywhere. */
export const LOCK_LINE = "Locks in a net P&L if both sides fill and both markets settle the same way.";

/** Words that must never describe a deal (checked over every page by test/compliance.test.ts). The negated form
 *  "Not risk-free" and "aren't guaranteed" are allowed, and so is the FAQ question "Is this risk-free?". */
export const BANNED = [/\bguaranteed\b/i, /\brisk[- ]free\b/i, /\bfree money\b/i, /\bsure thing\b/i, /\bcan'?t lose\b/i, /\byou should (buy|bet|sell)\b/i];
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
