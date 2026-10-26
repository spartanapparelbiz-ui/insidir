/* Copy rules in one place. Never "guaranteed" or "risk-free" for anything we show. */

/** On every page. */
export const FOOTER =
  "Information only, not financial advice. Not affiliated with Polymarket or Kalshi. Prices move and fills aren't guaranteed. Check that prediction markets are available to you.";

/** How a lock is described everywhere. */
export const LOCK_LINE = "Locks in a profit if both sides fill and both markets settle the same way.";

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
/** Start the Insidir plan checkout (every upgrade button for a free user or visitor). */
export const UNLOCK = "Unlock live deals";
/** Start the Pro plan checkout. */
export const UNLOCK_PRO = "Unlock Pro";
/** Go to the live Terminal (no account needed). */
export const OPEN_TERMINAL = "See today's live deals";
/** Change any member setting: confirmed with this toast. */
export const SAVED = "Saved";
