/* Raw API rows → fills (pure). Field names per the public APIs:
 *   Polymarket Data API GET /trades: proxyWallet, side, conditionId, size, price, timestamp (s), title, slug,
 *     eventSlug, outcome, outcomeIndex, name, pseudonym, transactionHash.
 *   Polymarket Data API GET /closed-positions: conditionId, realizedPnl.
 *   Kalshi GET /markets/trades: trade_id, ticker, count (or count_fp), yes_price / no_price in cents (or
 *     yes_price_dollars / no_price_dollars), taker_side, created_time. Kalshi trades carry no account. */
import { displayName, polymarketUrl } from "@/lib/exchanges/polymarket";
import { epochMs, num, rows, str } from "@/lib/exchanges/parse";
import type { VMarket } from "@/lib/types";
import type { ResolvedPosition } from "./records";
import type { Fill } from "./types";

export function readPolymarketFills(raw: unknown): Fill[] {
  const out: Fill[] = [];
  for (const t of rows(raw)) {
    const wallet = str(t.proxyWallet) ?? str(t.wallet);
    const side = str(t.side)?.toUpperCase();
    const contracts = num(t.size), price = num(t.price), at = epochMs(t.timestamp);
    const marketId = str(t.conditionId);
    if (!wallet || (side !== "BUY" && side !== "SELL") || contracts === null || price === null || at === null || !marketId) continue;
    const idx = num(t.outcomeIndex);
    const outcome = str(t.outcome) ?? (idx === 1 ? "No" : "Yes");
    out.push({
      source: "polymarket", id: `${str(t.transactionHash) ?? "tx"}:${wallet}:${marketId}:${idx ?? 0}:${at}`,
      marketId, eventTitle: str(t.eventTitle) ?? str(t.title) ?? marketId, marketTitle: str(t.title) ?? marketId,
      outcome, outcomeSide: idx === 1 ? "no" : "yes", side, contracts, price, wallet: wallet.toLowerCase(), walletName: displayName(t), at,
      url: polymarketUrl(str(t.eventSlug), str(t.slug)),
    });
  }
  return out;
}

/** Kalshi prices: integer cents, or a dollar string in the newer fixed-point fields. */
const kPrice = (cents: unknown, dollars: unknown): number | null => {
  const d = num(dollars);
  if (d !== null) return d;
  const c = num(cents);
  return c === null ? null : c / 100;
};

export function readKalshiFills(raw: unknown, markets: ReadonlyMap<string, VMarket>): Fill[] {
  const out: Fill[] = [];
  for (const t of rows(raw, ["trades"])) {
    const id = str(t.trade_id), ticker = str(t.ticker), at = epochMs(t.created_time);
    const takerSide = str(t.taker_side)?.toLowerCase();
    const contracts = num(t.count_fp) ?? num(t.count);
    if (!id || !ticker || at === null || (takerSide !== "yes" && takerSide !== "no") || contracts === null) continue;
    const m = markets.get(ticker);
    if (!m) continue; // only markets we know (the sweep lists every open one): we need the question in words
    const price = takerSide === "yes" ? kPrice(t.yes_price, t.yes_price_dollars) : kPrice(t.no_price, t.no_price_dollars);
    if (price === null) continue;
    out.push({
      source: "kalshi", id, marketId: ticker, eventTitle: m.eventTitle ?? m.title, marketTitle: m.title,
      outcome: takerSide === "yes" ? m.yesLabel : m.noLabel, outcomeSide: takerSide, side: "BUY", contracts, price,
      wallet: null, walletName: null, at, url: m.url,
    });
  }
  return out;
}

export function readClosedPositions(raw: unknown): ResolvedPosition[] {
  const out: ResolvedPosition[] = [];
  for (const p of rows(raw)) {
    const marketId = str(p.conditionId), pnl = num(p.realizedPnl);
    if (marketId && pnl !== null) out.push({ marketId, realizedPnl: pnl });
  }
  return out;
}
