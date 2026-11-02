/* Building one Read (server only), in under 5 seconds: each venue gets VENUE_MS to answer, else what we hold is used.
 *   Listings   the market and its match on the other venue (terminal.pairs, lib/matching), fresh from the venue, else
 *              the matcher's stored copy (terminal.markets).
 *   Proven     two real sources. Winning trackers (30+ settled, positive all-time followable return): which side
 *              their open positions here are on, on either venue (trackers tag Kalshi moves too). Proven wallets
 *              (30+ closed Polymarket markets and positive all-time profit, terminal.wallet_pnl: the count from the
 *              Data API /closed-positions, the profit from the wallet's /v1/leaderboard row; or a winning followable
 *              record): their side and dollars, from their large positions
 *              (terminal.moves) and their open positions (terminal.trader_open).
 *   Big split  every open tracked large position by side: shown, labelled as such, when there is no proven money.
 *   Big bets   every large position on either listing in the last 24 hours, Kalshi's turned to the main listing's sides,
 *              each flagged unusual when it is a fresh wallet, big against the market's own day, or the long-shot side.
 *   Prices     YES and NO on each venue now, the cheaper one marked. */
import { tierMoney, tierOf, type MarketTiers } from "@/lib/millionaire/tiers";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { isWinner, trackerFollowAll, traderFollowAll } from "@/lib/follow/records";
import { infoFor } from "@/lib/markets/info";
import { shortWallet } from "@/lib/moves/records";
import type { VMarket } from "@/lib/types";
import { MIN_SETTLED } from "@/lib/follow/math";
import { onDemand } from "@/lib/moves/proven-backfill";
import { walletPnlFor } from "@/lib/moves/store";
import { isLive, TRACKERS, trackerWhere } from "@/lib/trackers";
import { bigSplitOf, provenFrom, sidePrices, unusualOf, type OpenPosition } from "./math";
import type { BigBet, BigSplit, Listing, ProvenMoney, ReadData, Venue } from "./types";

export const VENUE_MS = 1_500;
/** A Read aims to be built within this; wallets with no public record are read inline only in what's left, up to
 *  INLINE_MS (lib/moves/proven-backfill.ts onDemand). */
export const READ_BUDGET_MS = 3_000;
export const INLINE_MS = 1_500;
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

interface Stored { /** Read from the venue just now (it answered within VENUE_MS), not from what we hold. */ fresh?: boolean; title: string; eventTitle: string | null; yesLabel: string; noLabel: string; url: string | null; yesPrice: number | null; volume24h: number | null; closeTime: number | null }

/** Fresh from the venue, else the matcher's copy, else what our moves call it. */
async function listing(db: Db, clients: Clients, venue: Venue, id: string): Promise<Stored | null> {
  const fresh: VMarket | undefined = (await within(clients[venue].getMarketsById([id]), new Map<string, VMarket>())).get(id);
  if (fresh) return { fresh: true, title: fresh.title, eventTitle: fresh.eventTitle, yesLabel: fresh.yesLabel, noLabel: fresh.noLabel, url: fresh.url, yesPrice: fresh.yesPrice ?? null, volume24h: fresh.volume24h, closeTime: fresh.closeTime };
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

/** Winning trackers (prediction-market bets, 30+ settled, positive all-time followable return), with that record. */
export async function winningTrackers(db: Db, now: number): Promise<Map<string, { name: string; returnPct: number; settled: number }>> {
  const all = await trackerFollowAll(db, now).catch(() => new Map<string, Record<string, import("@/lib/follow/math").FollowRecord>>());
  const out = new Map<string, { name: string; returnPct: number; settled: number }>();
  for (const t of TRACKERS) {
    const r = all.get(t.slug)?.all;
    if (t.kind === "bets" && r && isWinner(r) && r.staked > 0) out.set(t.slug, { name: t.name, returnPct: r.net / r.staked, settled: r.n });
  }
  return out;
}

type Ids = { polymarket: string | null; kalshi: string | null; inverted: boolean };

/** Every open tracked large position on either listing (Kalshi's turned to the main listing's sides when inverted), with
 *  the trackers it belongs to: stored tags, and the live rules (Top Traders, Top 1%) worked out here. */
async function openPositions(db: Db, ids: Ids): Promise<OpenPosition[]> {
  const conds = [ids.polymarket ? sql`(source = 'polymarket' and market_id = ${ids.polymarket})` : null, ids.kalshi ? sql`(source = 'kalshi' and market_id = ${ids.kalshi})` : null].filter(Boolean) as ReturnType<typeof sql>[];
  if (!conds.length) return [];
  const live = TRACKERS.filter(t => t.kind === "bets" && isLive(t));
  const flags = live.map((t, i) => sql`(${trackerWhere(t)}) as ${sql.raw(`"live_${i}"`)}`);
  const r = await db.execute(sql`select id, source, wallet, outcome_side as side, amount::float as dollars, coalesce(trackers, '{}') as trackers${flags.length ? sql`, ${sql.join(flags, sql`, `)}` : sql``}
    from terminal.moves where hidden_at is null and result is null and (${sql.join(conds, sql` or `)})`);
  return (r.rows as Array<Record<string, unknown>>).map(x => {
    const source = x.source as Venue, side = x.side as "yes" | "no";
    const flip = source === "kalshi" && Boolean(ids.polymarket) && ids.inverted;
    const tags = [...(x.trackers as string[]), ...live.filter((_, i) => x[`live_${i}`] === true).map(t => t.slug)];
    return { id: String(x.id), venue: source, wallet: (x.wallet as string | null) ?? null, side: flip ? (side === "yes" ? "no" : "yes") : side, dollars: Number(x.dollars), trackers: tags };
  });
}

/** Millionaire money on a Polymarket market (lib/millionaire/tiers.ts): open positions and tracked bets, plus the
 *  watchlist's millionaire bets here ($5K+), tiered by the watchlist's all-time pnl (else wallet_pnl's). */
async function marketTiers(db: Db, market: string, walletOpen: ReadonlyArray<{ wallet: string; side: "yes" | "no"; dollars: number }>,
  positions: ReadonlyArray<{ wallet: string | null; side: "yes" | "no"; dollars: number }>, recs: ReadonlyMap<string, { pnl: number | null }>): Promise<MarketTiers> {
  const bets = (await db.execute(sql`select wallet, outcome_side as side, sum(amount)::float as dollars, (sum(amount * price) / nullif(sum(amount), 0))::float as price
    from terminal.millionaire_bets where market_id = ${market} and result is null group by wallet, outcome_side`).catch(() => ({ rows: [] }))).rows as Array<{ wallet: string; side: "yes" | "no"; dollars: number; price: number | null }>;
  const wallets = [...new Set([...walletOpen.map(o => o.wallet), ...positions.map(p => p.wallet).filter((w): w is string => Boolean(w)), ...bets.map(b => b.wallet)])];
  const watch = wallets.length ? (await db.execute(sql`select wallet, pnl::float as pnl from terminal.millionaire_wallets where wallet in (${sql.join(wallets.map(w => sql`${w}`), sql`, `)})`).catch(() => ({ rows: [] }))).rows as Array<{ wallet: string; pnl: number }> : [];
  const pnl = new Map<string, number | null>([...recs].map(([w, r]) => [w, r.pnl]));
  for (const w of watch) pnl.set(w.wallet, Number(w.pnl));
  return tierMoney([...bets.map(b => ({ ...b, dollars: Number(b.dollars), price: b.price === null ? null : Number(b.price) })), ...walletOpen,
    ...positions.filter(p => p.wallet).map(p => ({ wallet: p.wallet!, side: p.side, dollars: p.dollars }))], pnl, shortWallet);
}

/** Proven money (winning trackers and proven wallets), and the big-money split over every open tracked position. */
async function provenAndBig(db: Db, ids: Ids, now: number, clients: Clients | null, started: number, polyAnswered: boolean): Promise<{ proven: ProvenMoney; big: BigSplit; tiers: MarketTiers | null }> {
  const [positions, trackers, follows, open] = await Promise.all([
    openPositions(db, ids),
    winningTrackers(db, now),
    traderFollowAll(db, now),
    ids.polymarket ? db.execute(sql`select wallet, outcome_index, money_in::float as dollars from terminal.trader_open
      where market_id = ${ids.polymarket} and read_at > ${new Date(now - 3 * 3_600_000)} and outcome_index in (0, 1)`) : Promise.resolve({ rows: [] }),
  ]);
  const walletOpen = (open.rows as Array<{ wallet: string; outcome_index: number; dollars: number }>).map(o => ({ wallet: o.wallet, side: (o.outcome_index === 0 ? "yes" : "no") as "yes" | "no", dollars: Number(o.dollars) }));
  const wallets = [...new Set([...positions.map(p => p.wallet).filter((w): w is string => Boolean(w)), ...walletOpen.map(o => o.wallet)])];
  let recs = await walletPnlFor(db, wallets);
  // Wallets with no public record yet go to the front of the backfill; up to INLINE_MAX are read now if the Read's
  // time budget allows (what's left of READ_BUDGET_MS, at most INLINE_MS).
  const missing = wallets.filter(w => !recs.has(w));
  if (missing.length && clients) {
    // Polymarket didn't answer this Read's own market in time: it is slow or out now, so don't wait on it again; the
    // wallets are only queued.
    const left = polyAnswered ? Math.min(INLINE_MS, READ_BUDGET_MS - (Date.now() - started)) : 0;
    const done = await onDemand(db, clients.polymarket, missing, left, now).catch(() => [] as string[]);
    if (done.length) recs = await walletPnlFor(db, wallets);
  }
  const records = new Map([...recs].filter(([, r]) => r.pnl !== null).map(([w, r]) => [w, { closed: r.closed, closedAtLeast: r.closedAtLeast, profit: r.pnl! }]));
  const follow = new Map<string, { returnPct: number; settled: number; winner: boolean }>();
  for (const w of wallets) {
    const f = follows.get(w)?.all;
    if (f && f.n >= MIN_SETTLED && f.staked > 0) follow.set(w, { returnPct: f.net / f.staked, settled: f.n, winner: isWinner(f) });
  }
  // Millionaire money (lib/millionaire/tiers.ts): Polymarket wallets only, by all-time profit; Kalshi is anonymous.
  const tiers = ids.polymarket ? await marketTiers(db, ids.polymarket, walletOpen, positions, recs) : null;
  return { proven: provenFrom({ positions, walletOpen, trackers, records, follow, short: shortWallet }), big: bigSplitOf(positions), tiers };
}

/** Large positions on either listing in the last 24 hours, largest first (up to 8). */
async function bigBets(db: Db, ids: { polymarket: string | null; kalshi: string | null; inverted: boolean }, vol: { polymarket: number | null; kalshi: number | null }, now: number): Promise<BigBet[]> {
  const conds = [ids.polymarket ? sql`(source = 'polymarket' and market_id = ${ids.polymarket})` : null, ids.kalshi ? sql`(source = 'kalshi' and market_id = ${ids.kalshi})` : null].filter(Boolean) as ReturnType<typeof sql>[];
  if (!conds.length) return [];
  const r = await db.execute(sql`select source, outcome_side as side, amount::float as amount, avg_price::float as price, at, m.wallet, new_wallet, wp.pnl::float as pnl
    from terminal.moves m left join terminal.wallet_pnl wp on wp.wallet = m.wallet
    where hidden_at is null and at > ${new Date(now - DAY)} and at <= ${new Date(now)} and (${sql.join(conds, sql` or `)})
    order by amount desc limit 8`);
  return (r.rows as Array<{ source: Venue; side: "yes" | "no"; amount: number; price: number; at: string | Date; wallet: string | null; new_wallet: boolean | null; pnl: number | null }>).map(x => {
    const flip = x.source === "kalshi" && ids.inverted;
    const side: "yes" | "no" = flip ? (x.side === "yes" ? "no" : "yes") : x.side;
    const u = unusualOf({ amount: Number(x.amount), price: Number(x.price), newWallet: x.new_wallet }, vol[x.source]);
    return { venue: x.source, side, amount: Number(x.amount), price: Number(x.price), at: new Date(x.at).getTime(), wallet: x.source === "polymarket" && x.wallet ? shortWallet(x.wallet) : null, tier: x.source === "polymarket" ? tierOf(x.pnl) : null, ...u };
  });
}

/** Everything but the analyst line. */
export async function buildRead(db: Db, clients: Clients, venue: Venue, id: string, now: number): Promise<Omit<ReadData, "line">> {
  const started = Date.now();
  const ids = await pairOf(db, venue, id);
  const [poly, kal] = await Promise.all([
    ids.polymarket ? listing(db, clients, "polymarket", ids.polymarket) : Promise.resolve(null),
    ids.kalshi ? listing(db, clients, "kalshi", ids.kalshi) : Promise.resolve(null),
  ]);
  const main = poly ?? kal;
  if (!main) throw new ReadNotFound("not found");
  const [{ proven, big, tiers }, bets] = await Promise.all([
    provenAndBig(db, { polymarket: poly ? ids.polymarket : null, kalshi: kal ? ids.kalshi : null, inverted: ids.inverted }, now, clients, started, Boolean(poly?.fresh)),
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
    proven, big, tiers, bets, prices: sidePrices(poly?.yesPrice ?? null, kalYesOriented), at: now,
  };
}
