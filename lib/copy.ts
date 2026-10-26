/* Copy rules in one place. Never "guaranteed" or "risk-free" for anything we show. */

/** On every page. */
export const FOOTER =
  "This is information, not financial advice. We are not part of Polymarket or Kalshi. Prices move, and your buy may not go through. Check that these apps are open where you live.";

/** How a lock is described everywhere. */
export const LOCK_LINE = "You keep the gap only if both buys go through and both apps pick the same winner.";

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
