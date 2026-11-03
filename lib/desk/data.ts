/* The Desk's data (the member home): read-only queries on existing tables, nothing invented.
 *   KPIs        since midnight ET: millionaire money, millionaire bets, millionaire wallets active, the biggest bet;
 *               each with an hourly series from today's bets (the sparkline).
 *   Flow / tape the newest millionaire-watchlist bets (sides: members), price then and now (market_info).
 *   Leaderboard millionaire wallets active today: all-time profit, $ bet today, bets today, biggest position today.
 *   Your desk   pings (setting + devices), wallets followed, logged copies open and their move in cents since copying.
 * Wallets are a short address, tier and profit only. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { isCategory, type CategorySlug } from "@/lib/brand/categories";
import { electionBoard, type ElectionBoard } from "@/lib/brand/pulse";
import { midnightET, recentBets, type BoardBet } from "@/lib/millionaires/queries";
import { shortWallet } from "@/lib/millionaires/watchlist";

const HOUR = 3_600_000;

export interface Kpi { key: "money" | "bets" | "wallets" | "biggest"; value: number; series: number[]; label: string; detail?: string }
export interface Leader { wallet: string; short: string; pnl: number | null; todayDollars: number; todayBets: number; biggest: { title: string; dollars: number; category: CategorySlug } | null; followed: boolean }
export interface YourDesk { pushOn: boolean; devices: number; following: number; copies: { open: number; settled: number; centsSince: number | null } }
export interface Desk { now: number; kpis: Kpi[]; flow: BoardBet[]; tape: BoardBet[]; leaders: Leader[]; election: ElectionBoard | null; desk: YourDesk; updatedAt: number | null;
  /** The worker's last good poll of Polymarket (worker_heartbeats moves:polymarket): Live means within 5 minutes. */
  polledAt: number | null }

/** Today's KPIs with hourly series (hours since midnight ET, the current one last). A KPI with no data is left out. */
export async function kpis(db: Db, now: number): Promise<Kpi[]> {
  const mid = midnightET(now), hours = Math.max(1, Math.ceil((now - mid) / HOUR));
  const r = (await db.execute(sql`select floor(extract(epoch from (at - ${new Date(mid)})) / 3600)::int as h,
      sum(amount)::float as money, count(*)::int as bets, count(distinct wallet)::int as wallets, max(amount)::float as biggest
    from terminal.millionaire_bets where tier = 'millionaire' and at >= ${new Date(mid)} group by 1 order by 1`)).rows as Array<{ h: number; money: number; bets: number; wallets: number; biggest: number }>;
  const tot = (await db.execute(sql`select coalesce(sum(amount), 0)::float as money, count(*)::int as bets, count(distinct wallet)::int as wallets
    from terminal.millionaire_bets where tier = 'millionaire' and at >= ${new Date(mid)}`)).rows[0] as { money: number; bets: number; wallets: number };
  const big = (await db.execute(sql`select market_title, outcome, amount::float as amount from terminal.millionaire_bets
    where tier = 'millionaire' and at >= ${new Date(mid)} order by amount desc limit 1`)).rows[0] as { market_title: string; outcome: string; amount: number } | undefined;
  const series = (k: "money" | "bets" | "wallets" | "biggest") => Array.from({ length: hours }, (_, h) => Number(r.find(x => x.h === h)?.[k] ?? 0));
  const out: Kpi[] = [];
  if (tot.money > 0) out.push({ key: "money", value: tot.money, series: series("money"), label: "Millionaire money today" });
  if (tot.bets > 0) out.push({ key: "bets", value: tot.bets, series: series("bets"), label: tot.bets === 1 ? "Millionaire bet today" : "Millionaire bets today" });
  if (tot.wallets > 0) out.push({ key: "wallets", value: tot.wallets, series: series("wallets"), label: tot.wallets === 1 ? "Millionaire wallet active" : "Millionaire wallets active" });
  if (big) out.push({ key: "biggest", value: big.amount, series: series("biggest"), label: "Biggest bet", detail: `${big.outcome} · ${big.market_title}` });
  return out;
}

/** Millionaire wallets active today, by dollars bet today. */
export async function leaders(db: Db, now: number, userId: string | null, limit = 12): Promise<Leader[]> {
  const mid = new Date(midnightET(now));
  const r = (await db.execute(sql`with today as (
      select wallet, market_id, max(market_title) as title, max(category) as category, sum(amount)::float as dollars, count(*)::int as n
      from terminal.millionaire_bets where tier = 'millionaire' and at >= ${mid} group by wallet, market_id)
    select t.wallet, max(w.pnl)::float as pnl, sum(t.dollars)::float as today, sum(t.n)::int as bets,
      (array_agg(t.title order by t.dollars desc))[1] as big_title, max(t.dollars)::float as big_dollars,
      (array_agg(t.category order by t.dollars desc))[1] as big_cat
    from today t left join terminal.watchlist w on w.wallet = t.wallet group by t.wallet order by today desc limit ${limit}`)).rows as Array<Record<string, unknown>>;
  const follows = userId ? new Set(((await db.execute(sql`select target from terminal.follows where user_id = ${userId} and kind = 'trader'`)).rows as Array<{ target: string }>).map(x => x.target.toLowerCase())) : new Set<string>();
  return r.map(x => ({
    wallet: String(x.wallet), short: shortWallet(String(x.wallet)), pnl: x.pnl === null ? null : Number(x.pnl), todayDollars: Number(x.today), todayBets: Number(x.bets),
    biggest: x.big_title ? { title: String(x.big_title), dollars: Number(x.big_dollars), category: isCategory(x.big_cat) ? x.big_cat : "markets" } : null,
    followed: follows.has(String(x.wallet).toLowerCase()),
  }));
}

/** Pings, follows and logged copies (open, and how far their prices moved since copying, in cents, on average). */
export async function yourDesk(db: Db, userId: string, settings: { alertPush?: boolean }): Promise<YourDesk> {
  const [dev, fol, cop] = await Promise.all([
    db.execute(sql`select count(*)::int as n from terminal.push_subscriptions where user_id = ${userId}`),
    db.execute(sql`select count(*)::int as n from terminal.follows where user_id = ${userId} and kind = 'trader'`),
    db.execute(sql`select count(*) filter (where c.result is null)::int as open, count(*) filter (where c.result is not null)::int as settled,
        avg((case when c.outcome_side = 'yes' then i.yes_price else 1 - i.yes_price end) - c.price) filter (where c.result is null and i.yes_price is not null)::float as moved
      from terminal.bet_copies c left join terminal.market_info i on i.source = 'polymarket' and i.market_id = c.market_id where c.user_id = ${userId}`),
  ]);
  const devices = Number((dev.rows[0] as { n: number }).n), c = cop.rows[0] as { open: number; settled: number; moved: number | null };
  return { pushOn: Boolean(settings.alertPush) && devices > 0, devices, following: Number((fol.rows[0] as { n: number }).n),
    copies: { open: Number(c.open), settled: Number(c.settled), centsSince: c.moved === null ? null : Math.round(Number(c.moved) * 100) } };
}

export async function deskData(db: Db, userId: string, settings: { alertPush?: boolean }, now: number, election: boolean): Promise<Desk> {
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(e => { console.error("desk", e instanceof Error ? e.message : e); return d; });
  const [k, flow, ls, el, desk, last, polled] = await Promise.all([
    safe(kpis(db, now), [] as Kpi[]),
    safe(recentBets(db, { now, limit: 40, member: true, tier: "millionaire" }), [] as BoardBet[]),
    safe(leaders(db, now, userId), [] as Leader[]),
    election ? safe(electionBoard(db, now, true), null) : Promise.resolve(null),
    safe(yourDesk(db, userId, settings), { pushOn: false, devices: 0, following: 0, copies: { open: 0, settled: 0, centsSince: null } }),
    safe(db.execute(sql`select max(last_at) as at from terminal.millionaire_bets`).then(r => (r.rows[0] as { at: string | null }).at), null),
    safe(db.execute(sql`select last_ok_at as at from terminal.worker_heartbeats where job = 'moves:polymarket'`).then(r => (r.rows[0] as { at: string | null } | undefined)?.at ?? null), null),
  ]);
  return { now, kpis: k, flow, tape: flow.slice(0, 20), leaders: ls, election: el, desk, updatedAt: last ? new Date(last).getTime() : null, polledAt: polled ? new Date(polled).getTime() : null };
}
