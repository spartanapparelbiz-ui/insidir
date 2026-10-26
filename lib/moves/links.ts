/* Where "See market" may point (docs/V2.md §5), pure.
 *   Kalshi moves: the Kalshi market, for everyone.
 *   Polymarket moves: outside the US, the Polymarket market. In the US (or unknown region, which is treated as US),
 *   never an international Polymarket link: the same market on Kalshi when the matching engine found one
 *   ("See it on Kalshi"), otherwise no trade link at all. */
import type { Region } from "@/lib/types";
import type { Move } from "./types";

export interface MarketLink { href: string; label: string }

export function marketLink(m: Pick<Move, "source" | "url">, region: Region | null, kalshiMatchUrl: string | null): MarketLink | null {
  if (m.source === "kalshi") return m.url ? { href: m.url, label: "See it on Kalshi" } : null;
  if (region === "non_us") return m.url ? { href: m.url, label: "See it on Polymarket" } : null;
  return kalshiMatchUrl ? { href: kalshiMatchUrl, label: "See it on Kalshi" } : null;
}

/** True for any link to the international Polymarket site (polymarket.com, not polymarket.us). */
export const isIntlPolymarket = (href: string): boolean => /^https?:\/\/(www\.)?polymarket\.com(\/|$)/i.test(href);
