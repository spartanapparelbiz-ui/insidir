/* The member home: the homepage's stage sequence, unlocked and live, plus the member's own layer. Real data only; each
 * stage carries one computed sentence as its headline.
 *   hero       today's millionaire money, today's #1 open position (its market's own image, side, in → now, the
 *              wallet's all-time profit, the entry-vs-now history) and the search
 *   disagree   the 3 markets where millionaire money and the price disagree most (lib/brand/pulse.ts disagreements)
 *   election   tonight's races with verified faces (lib/market/races.ts), Election Day only
 *   board      today's millionaire bets
 *   wallets    wallets worth following: their last 10 closed bets (made money / lost), all-time profit, today's bets
 *   gaps       the same bet on Kalshi and Polymarket, and what the gap means per $100 (lib/brand/pulse.ts priceGaps)
 *   desk       their open copies with the result so far, the wallets they follow, pings
 * Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { disagreements, electionDay as isElectionDay, priceGaps, type Disagreement, type PriceGap } from "@/lib/brand/pulse";
import { yourCopies, type YourCopies } from "@/lib/copies/tickets";
import { kpis, leaders, yourDesk, type Leader, type YourDesk } from "@/lib/desk/data";
import { edgeFor, type Edge } from "@/lib/desk/edge";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { artFor, logosOff, type MarketArt } from "@/lib/market/art";
import { electionDay, raceInsight, type ElectionDay } from "@/lib/market/races";
import { decision } from "@/lib/millionaires/decided";
import { marketMoney, recentBets, type BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { isCategory } from "@/lib/brand/categories";
import type { StreamData } from "@/components/system/Stream";

const DAY = 86_400_000;
export interface WalletCard extends Leader { last10: { made: number; lost: number } | null }
export interface Home {
  now: number;
  today: { money: number; bets: number; wallets: number } | null;
  top: { bet: BoardBet; edge: Edge | null; art: MarketArt | null } | null;
  disagree: Disagreement[];
  election: { day: ElectionDay; insight: string | null } | null;
  board: BoardBet[];
  stream: StreamData | null;
  wallets: WalletCard[];
  gaps: PriceGap[];
  desk: YourDesk; copies: YourCopies | null;
  /** Each open copy's price now (its side), by copy id: the result so far. */
  copyNow: Record<number, number>;
  day: { money: number; bets: number } | null;
  insight: { hero: string | null; disagree: string | null; board: string | null; wallets: string | null; gaps: string | null; desk: string | null };
  polledAt: number | null; lastBetAt: number | null;
}

let poly: PolymarketClient | null = null, clients: { kalshi: KalshiClient; polymarket: PolymarketClient } | null = null;
const SPORTS = new Set(["football", "basketball", "baseball", "hockey", "soccer", "tennis", "golf", "racing"]);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const c = (v: number) => `${Math.round(v * 100)}¢`;

/** The last 10 closed positions per wallet (Polymarket's resolved positions, lib/moves: trader_positions): how many made
 *  money (profit above 0), how many lost. */
export async function last10(db: Db, wallets: string[]): Promise<Map<string, { made: number; lost: number }>> {
  if (!wallets.length) return new Map();
  const r = (await db.execute(sql`select wallet, count(*) filter (where pnl > 0)::int as made, count(*) filter (where pnl <= 0)::int as lost from (
      select wallet, pnl, row_number() over (partition by wallet order by resolved_at desc) as n from terminal.trader_positions
      where wallet in (${sql.join(wallets.map(w => sql`${w}`), sql`, `)}) and resolved_at is not null and money_in >= 100) x where n <= 10 group by wallet`)).rows as Array<{ wallet: string; made: number; lost: number }>;
  return new Map(r.map(x => [x.wallet, { made: Number(x.made), lost: Number(x.lost) }]));
}

/** Money by category, hour by hour, over the last 24 hours (the top 5 categories). Null unless it reads as a stream:
 *  2+ categories and money in 6+ of the 24 hours (else it is a spike). */
export async function streamFor(db: Db, now: number, category?: string): Promise<StreamData | null> {
  const rows = (await db.execute(sql`select category, floor(extract(epoch from (at - ${new Date(now - DAY)})) / 3600)::int as h, sum(amount)::float as d
      from terminal.millionaire_bets where tier = 'millionaire' and at > ${new Date(now - DAY)} ${category ? sql`and category = ${category}` : sql``} group by 1, 2`)).rows as Array<{ category: string; h: number; d: number }>;
  const byCat = new Map<string, number[]>();
  for (const r of rows) { if (!isCategory(r.category)) continue; const a = byCat.get(r.category) ?? Array.from({ length: 24 }, () => 0); a[Math.min(23, Math.max(0, Number(r.h)))]! += Number(r.d); byCat.set(r.category, a); }
  const bands = [...byCat.entries()].map(([c, series]) => ({ category: c as never, series, total: series.reduce((t, v) => t + v, 0) })).sort((a, b) => b.total - a.total).slice(0, 5);
  const liveHours = Array.from({ length: 24 }, (_, h) => bands.some(b => (b.series[h] ?? 0) > 0)).filter(Boolean).length;
  return bands.length >= (category ? 1 : 2) && liveHours >= 6 ? { hours: 24, bands } : null;
}

/** "One wallet up $11M put $290K on Hawks.": the biggest live (undecided) bet among these. */
export function boardInsight(bets: readonly BoardBet[]): string | null {
  const top = [...bets].filter(b => !decision(b)).sort((a, b) => b.amount - a.amount)[0];
  return top ? `One wallet up ${top.pnl !== null ? dollars(top.pnl) : "$1M+"} put ${dollars(top.amount)} on ${top.outcome}.` : null;
}

/** "0xf031…c80c made money on 10 of its last 10 closed bets.": the best record among wallets with 5+ closed. */
export function walletsInsight(wallets: readonly WalletCard[]): string | null {
  const rate = (w: WalletCard) => w.last10!.made / (w.last10!.made + w.last10!.lost);
  const best = [...wallets].filter(w => w.last10 && w.last10.made + w.last10.lost >= 5).sort((a, b) => rate(b) - rate(a))[0];
  return best ? `${best.short} made money on ${best.last10!.made} of its last ${best.last10!.made + best.last10!.lost} closed bets.` : null;
}

/** Wallets worth following: those that bet today (else in the last 24 hours), with their last 10 closed. */
export async function walletCards(db: Db, now: number, userId: string | null, limit: number): Promise<{ cards: WalletCard[]; today: boolean }> {
  let ls = await leaders(db, now, userId, limit), today = true;
  if (!ls.length) { ls = await leaders(db, now, userId, limit, now - DAY); today = false; }
  const rec = await last10(db, ls.map(l => l.wallet)).catch(() => new Map<string, { made: number; lost: number }>());
  return { cards: ls.map(l => ({ ...l, last10: rec.get(l.wallet) ?? null })), today };
}

export async function homeData(db: Db, userId: string, settings: { alertPush?: boolean }, now: number): Promise<Home> {
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(e => { console.error("home", e instanceof Error ? e.message : e); return d; });
  const [k, flow, pool, ls, el, desk, copies, gaps, polled, last, streamRows] = await Promise.all([
    safe(kpis(db, now), []),
    safe(recentBets(db, { now, limit: 40, member: true, tier: "millionaire", since: now - DAY }), [] as BoardBet[]),
    safe(marketMoney(db, { since: now - DAY, limit: 60, now }), []),
    safe(leaders(db, now, userId, 6).then(l => l.length ? l : leaders(db, now, userId, 6, now - DAY)), [] as Leader[]),
    isElectionDay(now) ? safe(electionDay(db, now, true), null) : Promise.resolve(null),
    safe(yourDesk(db, userId, settings), { pushOn: false, devices: 0, following: 0, copies: { open: 0, settled: 0, centsSince: null } }),
    safe(yourCopies(db, userId, 20), null),
    safe(priceGaps(db, (clients ??= { kalshi: new KalshiClient(), polymarket: new PolymarketClient() }), now), [] as PriceGap[]),
    safe(db.execute(sql`select last_ok_at as at from terminal.worker_heartbeats where job = 'moves:polymarket'`).then(r => (r.rows[0] as { at: string | null } | undefined)?.at ?? null), null),
    safe(db.execute(sql`select max(at) as at from terminal.millionaire_bets`).then(r => (r.rows[0] as { at: string | null }).at), null),
    safe(streamFor(db, now), null),
  ]);
  const v = (key: string) => k.find(x => x.key === key)?.value ?? 0;
  const today = v("money") > 0 ? { money: v("money"), bets: v("bets"), wallets: v("wallets") } : null;
  // Just after midnight ET today can be empty: the last 24 hours, said as such.
  const day = flow.length ? { money: flow.reduce((t, b) => t + b.amount, 0), bets: flow.length } : null;
  const openIds = copies?.list.filter(x => x.result === null).map(x => x.betId) ?? [];
  const nowRows = openIds.length ? await safe(db.execute(sql`select b.id, case when b.outcome_side = 'no' then 1 - i.yes_price else i.yes_price end as p from terminal.millionaire_bets b
      join terminal.market_info i on i.source = b.source and i.market_id = b.market_id where b.id in (${sql.join(openIds.map(x => sql`${x}`), sql`, `)}) and i.yes_price is not null`).then(r => r.rows as Array<{ id: string; p: number }>), []) : [];
  const byBet = new Map(nowRows.map(r => [r.id, Number(r.p)]));
  const copyNow: Record<number, number> = {};
  for (const x of copies?.list ?? []) { const p = byBet.get(x.betId); if (x.result === null && p !== undefined) copyNow[x.id] = p; }
  // Today's #1 open position: the biggest live (undecided) millionaire bet, one per market.
  const live = flow.filter(b => !decision(b) && b.priceNow !== null).sort((a, b) => b.amount - a.amount);
  const top = live[0] ?? null;
  const [edge, art] = top ? await Promise.all([
    safe(edgeFor(db, (poly ??= new PolymarketClient()), top.id, now), null),
    safe(artFor([top.marketId]).then(m => m.get(top.marketId) ?? null), null),
  ]) : [null, null];
  const dis = disagreements(pool).slice(0, 3);
  const stream = streamRows;
  const rec = await safe(last10(db, ls.map(l => l.wallet)), new Map());
  const wallets = ls.map(l => ({ ...l, last10: rec.get(l.wallet) ?? null }));
  const g = gaps[0];
  const openCopies = copies?.list.filter(x => x.result === null) ?? [];
  return {
    now, today, top: top ? { bet: top, edge, art: art && !(logosOff() && SPORTS.has(top.category)) ? art : null } : null,
    copyNow, day, stream, disagree: dis, election: el ? { day: el, insight: raceInsight(el) } : null, board: flow.slice(0, 24), wallets, gaps: gaps.slice(0, 3), desk, copies,
    insight: {
      hero: today ? `Wallets up $1M+ bet ${dollars(today.money)} today.` : day ? `Wallets up $1M+ bet ${dollars(day.money)} in the last 24 hours.` : null,
      disagree: dis[0] ? `Millionaires are ${pct(dis[0].share)} on ${dis[0].outcome}. The price says ${c(dis[0].price)}.` : null,
      board: boardInsight(live),
      wallets: walletsInsight(wallets),
      gaps: g ? `${g.outcome} costs ${c(g.kalshi)} on Kalshi and ${c(g.polymarket)} on Polymarket.` : null,
      desk: openCopies.length ? `You have ${openCopies.length} open ${openCopies.length === 1 ? "copy" : "copies"}.` : null,
    },
    polledAt: polled ? new Date(polled).getTime() : null, lastBetAt: last ? new Date(last).getTime() : null,
  };
}

/** The wallet constellation (/wallets): each millionaire wallet that bet in the window is a star (sized by the money it
 *  put in, placed in its main category's sector, nearer the centre the bigger its all-time profit), and two stars are
 *  joined when they bet the same market, a solid line on the same side and a dashed one against each other. Real rows
 *  only: terminal.millionaire_bets and the watchlist's profit. */
export interface Constellation {
  stars: Array<{ wallet: string; short: string; pnl: number | null; money: number; category: string; bets: number }>;
  links: Array<{ a: string; b: string; same: boolean; title: string }>;
  /** The market most of them share, for the headline. */
  shared: { title: string; wallets: number; same: boolean } | null;
}
export async function constellation(db: Db, since: number, limit = 40): Promise<Constellation> {
  const rows = (await db.execute(sql`select b.wallet, b.market_id, max(b.market_title) as title, max(b.category) as category, b.outcome_side as side,
      sum(b.amount)::float as money, count(*)::int as n, max(w.pnl)::float as pnl
    from terminal.millionaire_bets b left join terminal.watchlist w on w.wallet = b.wallet
    where b.tier = 'millionaire' and b.at >= ${new Date(since)} group by b.wallet, b.market_id, b.outcome_side`)).rows as Array<{ wallet: string; market_id: string; title: string; category: string; side: string; money: number; n: number; pnl: number | null }>;
  const byWallet = new Map<string, { money: number; bets: number; pnl: number | null; cats: Map<string, number> }>();
  for (const r of rows) {
    const w = byWallet.get(r.wallet) ?? { money: 0, bets: 0, pnl: r.pnl === null ? null : Number(r.pnl), cats: new Map() };
    w.money += Number(r.money); w.bets += Number(r.n); w.cats.set(r.category, (w.cats.get(r.category) ?? 0) + Number(r.money));
    byWallet.set(r.wallet, w);
  }
  const top = [...byWallet.entries()].sort((a, b) => b[1].money - a[1].money).slice(0, limit);
  const keep = new Set(top.map(([w]) => w));
  const stars = top.map(([wallet, w]) => ({ wallet, short: `${wallet.slice(0, 6)}…${wallet.slice(-4)}`, pnl: w.pnl, money: w.money, bets: w.bets,
    category: [...w.cats.entries()].sort((a, b) => b[1] - a[1])[0]![0] }));
  const byMarket = new Map<string, { title: string; sides: Array<{ wallet: string; side: string }> }>();
  for (const r of rows) {
    if (!keep.has(r.wallet)) continue;
    const m = byMarket.get(r.market_id) ?? { title: r.title, sides: [] };
    if (!m.sides.some(s => s.wallet === r.wallet && s.side === r.side)) m.sides.push({ wallet: r.wallet, side: r.side });
    byMarket.set(r.market_id, m);
  }
  const links: Constellation["links"] = [];
  let shared: Constellation["shared"] = null;
  for (const m of byMarket.values()) {
    const ws = [...new Set(m.sides.map(s => s.wallet))];
    if (ws.length < 2) continue;
    const sideOf = (w: string) => m.sides.find(s => s.wallet === w)!.side;
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) links.push({ a: ws[i]!, b: ws[j]!, same: sideOf(ws[i]!) === sideOf(ws[j]!), title: m.title });
    const same = new Set(m.sides.map(s => s.side)).size === 1;
    if (!shared || ws.length > shared.wallets) shared = { title: m.title, wallets: ws.length, same };
  }
  return { stars, links: links.slice(0, 120), shared };
}
