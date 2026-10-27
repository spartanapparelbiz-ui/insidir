/* Where every number comes from: the public record behind a move or a profile, as a link anyone can open. Pure.
 *   Polymarket move: the Polygon transaction of its first fill (polygonscan.com), or the wallet's on-chain history
 *     when the move predates stored hashes. A public blockchain record, not a trading site, so it is shown in every
 *     region (the location rules in ./links.ts are about trade links).
 *   Kalshi move: Kalshi's own public trade record (GET /markets/trades for that market, filtered to that second).
 *   SEC move: the filing on sec.gov.
 *   Profiles: a trader's wallet on polygonscan; an insider's or a fund's filing list on EDGAR. */
import type { Move } from "./types";
import type { ProfileRef } from "@/lib/profiles/name";

export interface SourceLink { href: string; label: string }

const KALSHI_API = (process.env.KALSHI_API_URL || "https://api.elections.kalshi.com/trade-api/v2").replace(/\/$/, "");
const POLYGONSCAN = "https://polygonscan.com";
const EDGAR = "https://www.sec.gov/cgi-bin/browse-edgar";
const HASH = /^0x[0-9a-fA-F]{64}$/;
const WALLET = /^0x[0-9a-fA-F]{40}$/;

export function moveSource(m: Pick<Move, "id" | "source" | "marketId" | "wallet" | "at" | "url"> & { sourceRefs?: string[] | null }): SourceLink | null {
  if (m.source === "sec") return m.url && /^https:\/\/www\.sec\.gov\//.test(m.url) ? { href: m.url, label: "Where this comes from: SEC EDGAR filing" } : null;
  if (m.source === "kalshi") {
    const s = Math.floor(m.at / 1000);
    return { href: `${KALSHI_API}/markets/trades?ticker=${encodeURIComponent(m.marketId)}&min_ts=${s}&max_ts=${s + 1}`, label: "Where this comes from: Kalshi trade record" };
  }
  const tx = m.sourceRefs?.find(h => HASH.test(h));
  if (tx) return { href: `${POLYGONSCAN}/tx/${tx}`, label: "Where this comes from: Polymarket trade on Polygon" };
  return m.wallet && WALLET.test(m.wallet) ? { href: `${POLYGONSCAN}/address/${m.wallet.toLowerCase()}`, label: "Where this comes from: Polymarket wallet on Polygon" } : null;
}

export function profileSource(ref: ProfileRef): SourceLink {
  if (ref.kind === "trader") return { href: `${POLYGONSCAN}/address/${ref.wallet.toLowerCase()}`, label: "Where this comes from: this Polymarket wallet on Polygon" };
  const cik = String(Number(ref.cik)).padStart(10, "0");
  return ref.kind === "insider"
    ? { href: `${EDGAR}?action=getcompany&CIK=${cik}&type=4&owner=include`, label: "Where this comes from: their Form 4 filings on SEC EDGAR" }
    : { href: `${EDGAR}?action=getcompany&CIK=${cik}&type=13F-HR`, label: "Where this comes from: their 13F filings on SEC EDGAR" };
}
