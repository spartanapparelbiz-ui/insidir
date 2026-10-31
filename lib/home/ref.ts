/* Where a visitor came from (?ref=, kept first-touch in the insidir_ref cookie by middleware.ts). The stock accounts
 * send people who came for insider stock trades, so the home page leads with stocks for them: the hero line, the first
 * live card and the Research example. Any other ref (or none) gets the standard home page. */

export const REF_COOKIE = "insidir_ref";

/** Our stock accounts' ref slugs. */
export const STOCK_REFS: ReadonlySet<string> = new Set(["insidirfinance", "marketreceipts", "wallstreetdecoded", "companybriefdaily", "marketexplaineddaily"]);

/** A ref as we store it: lower case, letters, digits, dot, dash and underscore, at most 40; anything else is ignored. */
export function cleanRef(raw: string | null | undefined): string | null {
  const r = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{2,40}$/.test(r) ? r : null;
}

export type HomeMode = "stocks" | "default";
export const homeMode = (ref: string | null): HomeMode => (ref && STOCK_REFS.has(ref) ? "stocks" : "default");

export const HERO_SUB: Record<HomeMode, string> = {
  default: "Insidir analyzes every large position on Polymarket, Kalshi and SEC filings: who placed it, their verified record, and what it means. Within minutes.",
  stocks: "See when CEOs buy and sell their own stock. Every insider trade filed with the SEC, who made it, their past trades, and how the stock has moved since.",
};
