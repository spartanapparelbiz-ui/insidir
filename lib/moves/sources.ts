/* Raw API rows → fills (pure). Field names per the public APIs:
 *   Polymarket Data API GET /trades: proxyWallet, side, conditionId, size, price, timestamp (s), title, slug,
 *     eventSlug, outcome, outcomeIndex, name, pseudonym, transactionHash.
 *   Polymarket Data API GET /v2/positions?status=CLOSED (rows in v1 names, lib/exchanges/polymarket.ts v1Position): conditionId, realizedPnl.
 *   Kalshi GET /markets/trades: trade_id, ticker, count (or count_fp), yes_price / no_price in cents (or
 *     yes_price_dollars / no_price_dollars), taker_side, created_time. Kalshi trades carry no account. */
import { polymarketUrl } from "@/lib/exchanges/polymarket";
import { epochMs, isObject, num, rows, str } from "@/lib/exchanges/parse";
import type { VMarket } from "@/lib/types";
import type { ResolvedPosition } from "./records";
import type { Fill } from "./types";
import { isBlockedName } from "./names";
import { profileAvatar, profileBlocked } from "./avatar";

/** The provenance fields of a Data API trade, as returned. Never the account's name, pseudonym, bio or picture: a wallet
 *  is only ever its tier and short address (lib/millionaires/watchlist.ts shortWallet). */
const TRADE_KEEP = ["proxyWallet", "side", "asset", "conditionId", "size", "price", "timestamp", "outcome", "outcomeIndex", "transactionHash", "slug", "eventSlug", "title"] as const;
export function slimTrade(t: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of TRADE_KEEP) if (t[k] !== undefined) out[k] = t[k];
  return out;
}

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
      outcome, outcomeSide: idx === 1 ? "no" : "yes", side, contracts, price, wallet: wallet.toLowerCase(), walletName: publicUsername(t), at,
      url: polymarketUrl(str(t.eventSlug), str(t.slug)), raw: slimTrade(t),
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

/** A leaderboard row's wallet: v2 user_id, v1 proxyWallet. */
const boardWallet = (r: Record<string, unknown>): string => (str(r.user_id) ?? str(r.proxyWallet) ?? str(r.wallet) ?? "").toLowerCase();

/** The next page's cursor of a v2 leaderboard page; null on the last page. */
export function leaderboardCursor(raw: unknown): string | null {
  const p = isObject(raw) && isObject(raw.pagination) ? raw.pagination : null;
  return p && p.has_more === true ? str(p.next_cursor) : null;
}

/** Polymarket's public leaderboard rows (Data API /v2/leaderboard, or v1's shape): the wallet, the public username and
 *  profile picture (lib/moves/avatar.ts; null when it has none or the username is blocked). */
export function readLeaderboard(raw: unknown): Array<{ wallet: string; name: string | null; avatar: string | null; blocked: boolean }> {
  const out: Array<{ wallet: string; name: string | null; avatar: string | null; blocked: boolean }> = [];
  for (const r0 of rows(raw)) {
    const r = { ...r0, userName: r0.userName ?? r0.user_name, profileImage: r0.profileImage ?? r0.profile_image };
    const w = boardWallet(r);
    if (!/^0x[0-9a-f]{40}$/.test(w)) continue;
    out.push({ wallet: w, name: publicUsername(r), avatar: profileAvatar(r), blocked: profileBlocked(r) });
  }
  return out;
}

/** A wallet's all-time profit from its own leaderboard row: pnl, and nothing else (never the username or the rank).
 *  null when there is no row for that exact wallet (an answer about another wallet is ignored) or no number. */
export function readUserPnl(raw: unknown, wallet: string): number | null {
  const w = wallet.toLowerCase();
  // v2 answers a user lookup with one object ({ data: {...} }); v1 with a list.
  const list = isObject(raw) && isObject(raw.data) ? [raw.data] : rows(raw);
  for (const r of list) {
    if (boardWallet(r) !== w) continue;
    const pnl = num(r.pnl);
    return pnl === null || !Number.isFinite(pnl) ? null : Math.round(pnl * 100) / 100;
  }
  return null;
}

/** A wallet's public Polymarket username (never the auto-made pseudonym); null when it has none. */
export function publicUsername(r: Record<string, unknown>): string | null {
  const name = str(r.name) ?? str(r.userName) ?? str(r.username);
  if (r.displayUsernamePublic === false || !name || /^0x[0-9a-f]{6,}/i.test(name) || isBlockedName(name)) return null;
  return name.trim().slice(0, 60) || null;
}
