/* Building one Read (server only), in under 5 seconds: each venue gets VENUE_MS to answer, else what we hold is used.
 *   Listings   the market and its match on the other venue (terminal.pairs, lib/matching), fresh from the venue, else
 *              the matcher's stored copy (terminal.markets).
 *   Proven     wallets with 30+ settled positions and a positive followable return (lib/follow isWinner): their open
 *              dollars on each side, from their large positions (terminal.moves) and, when we read them, their open
 *              positions (terminal.trader_open). Kalshi trades are anonymous, so proven money is Polymarket's.
 *   Big bets   every large position on either listing in the last 24 hours, Kalshi's turned to the main listing's sides,
 *              each flagged unusual when it is a fresh wallet, big against the market's own day, or the long-shot side.
 *   Prices     YES and NO on each venue now, the cheaper one marked. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { isWinner, traderFollowAll } from "@/lib/follow/records";
import { infoFor } from "@/lib/markets/info";
import { shortWallet } from "@/lib/moves/records";
import type { VMarket } from "@/lib/types";
import { provenSplit, sidePrices, unusualOf } from "./math";
import type { BigBet, Listing, ReadData, Venue } from "./types";

export const VENUE_MS = 1_500;
const DAY = 86_400_000;
export interface Clients { polymarket: PolymarketClient; kalshi: KalshiClient }

function within<T>(p: Promise<T>, fallback: T, ms = VENUE_MS): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>(ok => setTimeout(() => ok(fallback), ms))]);
}

export class ReadNotFound extends Error {}

/** The market's pair: its Polymarket and Kalshi ids, and whether Kalshi's YES pays like Polymarket's NO. */
export async function pairOf(db: Db, venue: Venue, id: string): Promise<{ polymarket: string | null; kalshi: string | null; inverted: boolean }> {
  const r = await db.execute(sql`select data from terminal.pairs where not blocked and (
      (data->'a'->>'venue' = ${venue} and data->'a'->>'id' = ${id}) or (data->'b'->>'venue' = ${venue} and data->'b'->>'id' = ${id})) limit 1`);
  const d = (r.rows[0] as { data: { a: { venue: string; id: string }; b: { venue: string; id: string }; inverted?: boolean } } | undefined)?.data;
  const side = (v: Venue) => (d?.a.venue === v ? d.a.id : d?.b.venue === v ? d.b.id : null);
  return { polymarket: venue === "polymarket" ? id : side("polymarket"), kalshi: venue === "kalshi" ? id : side("kalshi"), inverted: Boolean(d?.inverted) };
}

interface Stored { title: string; eventTitle: string | null; yesLabel: string; noLabel: string; url: string | null; yesPrice: number | null; volume24h: number | null; closeTime: number | null }

/** Fresh from the venue, else the matcher's copy, else what our moves call it. */
async function listing(db: Db, clients: Clients, venue: Venue, id: string): Promise<Stored | null> {
  const fresh: VMarket | undefined = (await within(clients[venue].getMarketsById([id]), new Map<string, VMarket>())).get(id);
  if (fresh) return { title: fresh.title, eventTitle: fresh.eventTitle, yesLabel: fresh.yesLabel, noLabel: fresh.noLabel, url: fresh.url, yesPrice: fresh.yesPrice ?? null, volume24h: fresh.volume24h, closeTime: fresh.closeTime };
  const [m, info] = await Promise.all([
    db.execute(sql`select data from terminal.markets where venue = ${venue} and id = ${id} limit 1`),
    infoFor(db, venue, [id]),
  ]);
  const d = (m.rows[0] as { data: VMarket } | undefined)?.data;
  const i = info.get(id);
  if (d) return { title: d.title, eventTitle: d.eventTitle, yesLabel: d.yesLabel, noLabel: d.noLabel, url: d.url, yesPrice: i?.yesPrice ?? d.yesPrice ?? null, volume24h: d.volume24h, closeTime: d.closeTime };
  const mv = await db.execute(sql`select max(event_title) as event, max(market_title) as title, max(url) as url,
      max(case when outcome_side = 'yes' then outcome end) as yes, max(case when outcome_side = 'no' then outcome end) as no
    from terminal.moves where source = ${venue} and market_id = ${id}`);
  const x = mv.rows[0] as { event: string | null; title: string | null; url: string | null; yes: string | null; no: string | null } | undefined;
  if (!x?.title) return null;
  return { title: x.title, eventTitle: x.event, yesLabel: x.yes ?? "Yes", noLabel: x.no ?? "No", url: x.url, yesPrice: i?.yesPrice ?? null, volume24h: null, closeTime: i?.endAt ?? null };
}

/** Proven wallets' open dollars on each side of a Polymarket market. */
async function provenRows(db: Db, marketId: string, now: number): Promise<Array<{ wallet: string; side: "yes" | "no"; dollars: number }>> {
  const [winners, moves, open] = await Promise.all([
    traderFollowAll(db, now).then(m => new Set([...m.values()].filter(t => isWinner(t.all)).map(t => t.wallet))),
    db.execute(sql`select wallet, outcome_side as side, sum(amount)::float as dollars from terminal.moves
      where source = 'polymarket' and market_id = ${marketId} and wallet is not null and result is null and hidden_at is null group by wallet, outcome_side`),
    db.execute(sql`select wallet, outcome_index, money_in::float as dollars from terminal.trader_open
      where market_id = ${marketId} and read_at > ${new Date(now - 3 * 3_600_000)} and outcome_index in (0, 1)`),
  ]);
  const best = new Map<string, { wallet: string; side: "yes" | "no"; dollars: number }>();
  const add = (wallet: string, side: "yes" | "no", dollars: number) => {
    if (!winners.has(wallet)) return;
    const k = `${wallet}:${side}`, cur = best.get(k);
    if (!cur || dollars > cur.dollars) best.set(k, { wallet, side, dollars });
  };
  for (const r of moves.rows as Array<{ wallet: string; side: "yes" | "no"; dollars: number }>) add(r.wallet, r.side, Number(r.dollars));
  for (const r of open.rows as Array<{ wallet: string; outcome_index: number; dollars: number }>) add(r.wallet, r.outcome_index === 0 ? "yes" : "no", Number(r.dollars));
  return [...best.values()];
}

/** Large positions on either listing in the last 24 hours, largest first (up to 8). */
async function bigBets(db: Db, ids: { polymarket: string | null; kalshi: string | null; inverted: boolean }, vol: { polymarket: number | null; kalshi: number | null }, now: number): Promise<BigBet[]> {
  const conds = [ids.polymarket ? sql`(source = 'polymarket' and market_id = ${ids.polymarket})` : null, ids.kalshi ? sql`(source = 'kalshi' and market_id = ${ids.kalshi})` : null].filter(Boolean) as ReturnType<typeof sql>[];
  if (!conds.length) return [];
  const r = await db.execute(sql`select source, outcome_side as side, amount::float as amount, avg_price::float as price, at, wallet, new_wallet
    from terminal.moves where hidden_at is null and at > ${new Date(now - DAY)} and at <= ${new Date(now)} and (${sql.join(conds, sql` or `)})
    order by amount desc limit 8`);
  return (r.rows as Array<{ source: Venue; side: "yes" | "no"; amount: number; price: number; at: string | Date; wallet: string | null; new_wallet: boolean | null }>).map(x => {
    const flip = x.source === "kalshi" && ids.inverted;
    const side: "yes" | "no" = flip ? (x.side === "yes" ? "no" : "yes") : x.side;
    const u = unusualOf({ amount: Number(x.amount), price: Number(x.price), newWallet: x.new_wallet }, vol[x.source]);
    return { venue: x.source, side, amount: Number(x.amount), price: Number(x.price), at: new Date(x.at).getTime(), wallet: x.source === "polymarket" && x.wallet ? shortWallet(x.wallet) : null, ...u };
  });
}

/** Everything but the analyst line. */
export async function buildRead(db: Db, clients: Clients, venue: Venue, id: string, now: number): Promise<Omit<ReadData, "line">> {
  const ids = await pairOf(db, venue, id);
  const [poly, kal] = await Promise.all([
    ids.polymarket ? listing(db, clients, "polymarket", ids.polymarket) : Promise.resolve(null),
    ids.kalshi ? listing(db, clients, "kalshi", ids.kalshi) : Promise.resolve(null),
  ]);
  const main = poly ?? kal;
  if (!main) throw new ReadNotFound("not found");
  const [proven, bets] = await Promise.all([
    ids.polymarket && poly ? provenRows(db, ids.polymarket, now).then(provenSplit) : Promise.resolve(provenSplit([])),
    bigBets(db, ids, { polymarket: poly?.volume24h ?? null, kalshi: kal?.volume24h ?? null }, now),
  ]);
  const kYes = kal?.yesPrice ?? null;
  const kalYesOriented = kYes === null ? null : poly && ids.inverted ? 1 - kYes : kYes;
  const L = (v: Venue, mid: string, s: Stored): Listing => ({ venue: v, id: mid, title: s.title, url: s.url, yesPrice: s.yesPrice, volume24h: s.volume24h });
  return {
    key: ids.polymarket && poly ? `p:${ids.polymarket}` : `k:${ids.kalshi}`,
    question: main.title, event: main.eventTitle, yesLabel: main.yesLabel, noLabel: main.noLabel, closeTime: main.closeTime,
    polymarket: poly && ids.polymarket ? L("polymarket", ids.polymarket, poly) : null,
    kalshi: kal && ids.kalshi ? { ...L("kalshi", ids.kalshi, kal), inverted: Boolean(poly) && ids.inverted } : null,
    proven, bets, prices: sidePrices(poly?.yesPrice ?? null, kalYesOriented), at: now,
  };
}
