/* Copy rules in one place. Never "guaranteed" or "risk-free" for anything we show. */

/** On every page. */
export const FOOTER =
  "Information only, not financial advice. Not affiliated with Polymarket or Kalshi. Prices move and fills aren't guaranteed. Check that prediction markets are available to you.";

/** How a lock is described everywhere. */
export const LOCK_LINE = "Locks in a profit if both sides fill and both markets settle the same way.";

/** Words that must never describe a deal (checked over every page by test/compliance.test.ts). The negated form
 *  "Not risk-free" and "aren't guaranteed" are allowed. */
export const BANNED = [/\bguaranteed\b/i, /\brisk[- ]free\b/i, /\bfree money\b/i, /\bsure thing\b/i, /\bcan'?t lose\b/i, /\byou should (buy|bet|sell)\b/i];
const NEGATED = /\b(not|aren'?t|isn'?t|never|no)\s+(\w+\s+)?(guaranteed|risk[- ]free)\b/gi;

/** The banned phrases a text uses, after removing negated forms ("not risk-free"). */
export function bannedPhrases(text: string): string[] {
  const cleaned = text.replace(NEGATED, "");
  return BANNED.filter(r => r.test(cleaned)).map(r => r.source);
}
