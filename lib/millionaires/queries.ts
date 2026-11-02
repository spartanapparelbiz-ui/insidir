/* What the site shows about millionaire bets, all from terminal.millionaire_bets (lib/millionaires/bets.ts) and
 * terminal.watchlist, with "now" prices from terminal.market_info. Visitors see bets live with the side removed on the
 * server (redact): when, how much, the wallet's profit tier and the market are real; which side is never sent. Wallets leave here as their tier and a shortened address, plus the
 * full address only where a member can follow it. Server only. */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { CATEGORY_SLUGS, isCategory, type CategorySlug } from "@/lib/brand/categories";
import { followRecord, MIN_SETTLED, type FollowRecord } from "@/lib/follow/math";
import { trackerFollowAll } from "@/lib/follow/records";
import { memo } from "@/lib/memo";
import { shortWallet, type Tier } from "./watchlist";

/** Visitors see the feed live with the side hidden (redact); the delay is kept for callers that want a late board. */
export const VISITOR_DELAY_MS = 60 * 60_000;
const HOUR = 3_600_000, DAY = 86_400_000;

export interface BoardBet {
  id: string;
  /** Shortened ("0x5668…5839"); `wallet` only for members (to follow). */
  short: string;
  wallet: string | null;
  tier: Tier;
  category: CategorySlug;
  marketId: string;
  title: string;
  event: string;
  /** The wallet's all-time profit (the watchlist's; null once it left the list). */
  pnl: number | null;
  /** What they bought. Null for visitors (redact): the side is the one thing a visitor doesn't get, and its prices
   *  would give it away, so they go too. */
  outcome: string | null;
  side: "yes" | "no" | null;
  amount: number;
  /** The side's average price when the bet was made, and now (null when not read yet), 0..1. */
  priceThen: number | null;
  priceNow: number | null;
  closed: boolean;
  at: number;
  url: string | null;
}

type Row = Record<string, unknown>;
const n = (v: unknown): number => Number(v ?? 0);
const t = (v: unknown): number => new Date(v as string).getTime();

function toBet(r: Row, member: boolean): BoardBet {
  const yes = r.yes_price === null || r.yes_price === undefined ? null : Number(r.yes_price);
  const side = r.outcome_side === "no" ? "no" : "yes";
  const cat = String(r.category);
  return {
    id: String(r.id), short: shortWallet(String(r.wallet)), wallet: member ? String(r.wallet) : null, tier: r.tier === "millionaire" ? "millionaire" : "pro",
    category: isCategory(cat) ? cat : "world", marketId: String(r.market_id), title: String(r.market_title), event: String(r.event_title),
    pnl: r.pnl === null || r.pnl === undefined ? null : n(r.pnl),
    outcome: String(r.outcome), side, amount: n(r.amount), priceThen: n(r.price), priceNow: yes === null ? null : side === "no" ? 1 - yes : yes,
    closed: Boolean(r.closed), at: t(r.at), url: (r.url as string | null) ?? null,
  };
}

export interface BetFilter {
  now: number;
  /** Visitors: VISITOR_DELAY_MS. */
  delayMs?: number;
  limit?: number;
  categories?: readonly string[];
  wallets?: readonly string[];
  tier?: Tier;
  marketId?: string;
  member?: boolean;
  /** Keep the side for a visitor (the free Read's own market only). */
  withSide?: boolean;
  /** Only bets in markets still open. */
  open?: boolean;
  since?: number;
}

/** The newest bets matching the filter, newest first. */
export async function recentBets(db: Db, f: BetFilter): Promise<BoardBet[]> {
  const w: SQL[] = [sql`b.at <= ${new Date(f.now - (f.delayMs ?? 0))}`, sql`b.result is null or b.settled_at > ${new Date(f.now - DAY)}`];
  if (f.since !== undefined) w.push(sql`b.at >= ${new Date(f.since)}`);
  if (f.categories?.length) w.push(sql`b.category in (${sql.join(f.categories.map(c => sql`${c}`), sql`, `)})`);
  if (f.wallets?.length) w.push(sql`b.wallet in (${sql.join(f.wallets.map(x => sql`${x.toLowerCase()}`), sql`, `)})`);
  if (f.tier) w.push(sql`b.tier = ${f.tier}`);
  if (f.marketId) w.push(sql`b.market_id = ${f.marketId}`);
  if (f.open) w.push(sql`b.result is null and (i.closed is null or not i.closed)`);
  const r = await db.execute(sql`select b.*, i.yes_price, coalesce(i.closed, false) as closed, w.pnl from terminal.millionaire_bets b
    left join terminal.market_info i on i.source = b.source and i.market_id = b.market_id
    left join terminal.watchlist w on w.wallet = b.wallet
    where ${sql.join(w.map(x => sql`(${x})`), sql` and `)} order by b.at desc limit ${f.limit ?? 20}`);
  return (r.rows as Row[]).map(x => toBet(x, Boolean(f.member))).map(b => (f.member || f.withSide ? b : redact(b)));
}

/** A bet as a visitor gets it: everything but the side (and the prices that would give the side away). */
export const redact = (b: BoardBet): BoardBet => ({ ...b, outcome: null, side: null, priceThen: null, priceNow: null, wallet: null });

export interface Pulse {
  /** Millionaire-tier bets in the window, and which window it is (the last hour, or today when the hour had none). */
  count: number;
  window: "hour" | "day";
  wallets: number;
  millionaires: number;
  /** Dollars millionaire-tier wallets bet in the last 24 hours. */
  today: number;
}

/** The live counter and the watchlist's size. */
export function pulse(db: Db, now: number): Promise<Pulse> {
  return memo(`mil:pulse`, 30_000, async () => {
    const r = (await db.execute(sql`select
        count(*) filter (where tier = 'millionaire' and at > ${new Date(now - HOUR)})::int as hour,
        count(*) filter (where tier = 'millionaire' and at > ${new Date(now - DAY)})::int as day,
        coalesce(sum(amount) filter (where tier = 'millionaire'), 0)::float as today,
        (select count(*)::int from terminal.watchlist) as wallets,
        (select count(*)::int from terminal.watchlist where tier = 'millionaire') as millionaires
      from terminal.millionaire_bets where at > ${new Date(now - DAY)}`)).rows[0] as Row;
    const hour = n(r.hour);
    return { count: hour || n(r.day), window: hour ? "hour" : "day", wallets: n(r.wallets), millionaires: n(r.millionaires), today: n(r.today) };
  });
}

export interface CategoryLive {
  slug: CategorySlug;
  /** Millionaire-tier and Pro-tier dollars in the window. */
  millionaire: number;
  pro: number;
  bets: number;
  /** Distinct open markets with watchlist bets in the window. */
  markets: number;
}

/** Categories with live markets: watchlist bets in open markets over the last day (`window` "day"), or the last week
 *  when nothing at all was bet today, biggest millionaire money first. */
export function liveCategories(db: Db, now: number): Promise<{ window: "day" | "week"; list: CategoryLive[] }> {
  return memo(`mil:cats`, 60_000, async () => {
    for (const [window, ms] of [["day", DAY], ["week", 7 * DAY]] as const) {
      const r = await db.execute(sql`select b.category,
          coalesce(sum(b.amount) filter (where b.tier = 'millionaire'), 0)::float as millionaire,
          coalesce(sum(b.amount) filter (where b.tier = 'pro'), 0)::float as pro,
          count(*)::int as bets, count(distinct b.market_id)::int as markets
        from terminal.millionaire_bets b left join terminal.market_info i on i.source = b.source and i.market_id = b.market_id
        where b.at > ${new Date(now - ms)} and b.result is null and (i.closed is null or not i.closed)
        group by b.category`);
      const list = (r.rows as Row[]).filter(x => isCategory(x.category)).map(x => ({ slug: x.category as CategorySlug, millionaire: n(x.millionaire), pro: n(x.pro), bets: n(x.bets), markets: n(x.markets) }))
        .sort((a, b) => b.millionaire - a.millionaire || b.pro - a.pro);
      if (list.length) return { window, list };
    }
    return { window: "day" as const, list: [] };
  });
}

export interface MarketMoney {
  marketId: string;
  title: string;
  event: string;
  category: CategorySlug;
  /** Per tier, per side: dollars and distinct wallets. */
  millionaire: Record<"yes" | "no", { dollars: number; wallets: number }>;
  pro: Record<"yes" | "no", { dollars: number; wallets: number }>;
  yesLabel: string;
  noLabel: string;
  priceNow: number | null;
  last: number;
}

const sides = () => ({ yes: { dollars: 0, wallets: 0 }, no: { dollars: 0, wallets: 0 } });

/** Watchlist money per market (all bets still open), for the given market ids or the top markets in some categories. */
export async function marketMoney(db: Db, opts: { marketIds?: readonly string[]; categories?: readonly string[]; since?: number; limit?: number; now: number }): Promise<MarketMoney[]> {
  const w: SQL[] = [sql`b.result is null`];
  if (opts.marketIds) { if (!opts.marketIds.length) return []; w.push(sql`b.market_id in (${sql.join(opts.marketIds.map(x => sql`${x}`), sql`, `)})`); }
  if (opts.categories?.length) w.push(sql`b.category in (${sql.join(opts.categories.map(c => sql`${c}`), sql`, `)})`);
  if (opts.since !== undefined) w.push(sql`b.at > ${new Date(opts.since)}`);
  if (!opts.marketIds) w.push(sql`(i.closed is null or not i.closed)`);
  const r = await db.execute(sql`select b.market_id, b.tier, b.outcome_side,
      max(b.market_title) as title, max(b.event_title) as event, max(b.category) as category,
      coalesce(max(b.yes_label), max(case when b.outcome_side = 'yes' then b.outcome end)) as yes_label,
      coalesce(max(b.no_label), max(case when b.outcome_side = 'no' then b.outcome end)) as no_label,
      sum(b.amount)::float as dollars, count(distinct b.wallet)::int as wallets, max(b.at) as last, max(i.yes_price) as yes_price
    from terminal.millionaire_bets b left join terminal.market_info i on i.source = b.source and i.market_id = b.market_id
    where ${sql.join(w.map(x => sql`(${x})`), sql` and `)}
    group by b.market_id, b.tier, b.outcome_side`);
  const by = new Map<string, MarketMoney>();
  for (const x of r.rows as Row[]) {
    const id = String(x.market_id), cat = String(x.category);
    let m = by.get(id);
    if (!m) {
      m = { marketId: id, title: String(x.title), event: String(x.event), category: isCategory(cat) ? cat : "world", millionaire: sides(), pro: sides(),
        yesLabel: "Yes", noLabel: "No", priceNow: x.yes_price === null ? null : n(x.yes_price), last: 0 };
      by.set(id, m);
    }
    const side = x.outcome_side === "no" ? "no" : "yes";
    m[x.tier === "millionaire" ? "millionaire" : "pro"][side] = { dollars: n(x.dollars), wallets: n(x.wallets) };
    if (x.yes_label) m.yesLabel = String(x.yes_label);
    if (x.no_label) m.noLabel = String(x.no_label);
    m.last = Math.max(m.last, t(x.last));
  }
  for (const m of by.values()) Object.assign(m, outcomeNames(m.title, m.yesLabel, m.noLabel));
  const total = (m: MarketMoney) => m.millionaire.yes.dollars + m.millionaire.no.dollars + (m.pro.yes.dollars + m.pro.no.dollars) / 10;
  return [...by.values()].sort((a, b) => total(b) - total(a)).slice(0, opts.limit ?? 50);
}

/** Both outcome names for a market. When only one is known (the venue's names weren't read and only one side was bet
 *  on), a "A vs. B" title names the other; a binary market is "Yes" / "No". Never "Yes" next to a team name. */
export function outcomeNames(title: string, yes: string, no: string): { yesLabel: string; noLabel: string } {
  const isDefault = (l: string, d: string) => !l || l === d;
  if (!isDefault(yes, "Yes") && !isDefault(no, "No")) return { yesLabel: yes, noLabel: no };
  if (isDefault(yes, "Yes") && isDefault(no, "No")) return { yesLabel: "Yes", noLabel: "No" };
  const vs = /^(?:[^:]*:\s*)?(.+?)\s+vs\.?\s+(.+?)(?::.*)?$/i.exec(title.trim());
  const known = isDefault(yes, "Yes") ? no : yes;
  if (vs) {
    const [a, b] = [vs[1]!.trim(), vs[2]!.trim()];
    const other = known.toLowerCase() === a.toLowerCase() ? b : known.toLowerCase() === b.toLowerCase() ? a : null;
    if (other) return isDefault(yes, "Yes") ? { yesLabel: other, noLabel: no } : { yesLabel: yes, noLabel: other };
  }
  return isDefault(yes, "Yes") ? { yesLabel: "Other side", noLabel: no } : { yesLabel: yes, noLabel: "Other side" };
}

/** The side most of a tier's money is on, when at least MIN_SPLIT_WALLETS wallets are in (else null: no split). */
export const MIN_SPLIT_WALLETS = 3;
export function leaningSide(t: MarketMoney["millionaire"]): "yes" | "no" | null {
  if (t.yes.wallets + t.no.wallets < MIN_SPLIT_WALLETS) return null;
  return t.yes.dollars >= t.no.dollars ? "yes" : "no";
}

export interface Position { short: string; wallet: string; tier: Tier; side: "yes" | "no"; outcome: string; dollars: number; price: number; at: number; /** The wallet's all-time profit (null once it left the watchlist). */ pnl: number | null }

/** Each watchlist wallet's open money in one market (members only), biggest first. */
export async function positions(db: Db, marketId: string): Promise<Position[]> {
  const r = await db.execute(sql`select b.wallet, max(b.tier) as tier, b.outcome_side, max(b.outcome) as outcome, sum(b.amount)::float as dollars,
      (sum(b.amount) / nullif(sum(b.amount / nullif(b.price, 0)), 0))::float as price, max(b.at) as at, max(w.pnl)::float as pnl
    from terminal.millionaire_bets b left join terminal.watchlist w on w.wallet = b.wallet
    where b.market_id = ${marketId} and b.result is null group by b.wallet, b.outcome_side order by dollars desc limit 25`);
  return (r.rows as Row[]).map(x => ({ short: shortWallet(String(x.wallet)), wallet: String(x.wallet), tier: x.tier === "millionaire" ? "millionaire" : "pro",
    side: x.outcome_side === "no" ? "no" : "yes", outcome: String(x.outcome), dollars: n(x.dollars), price: n(x.price), at: t(x.at), pnl: x.pnl === null ? null : n(x.pnl) }));
}

export interface Proof {
  /** What the record follows: the millionaire bets once MIN_SETTLED of them settled, else the best tracker's record. */
  kind: "millionaire" | "tracker";
  label: string;
  record: FollowRecord;
}

/** The one stat the landing shows: real settled results at $100 a bet. Null when neither has a record yet. */
export function proof(db: Db, now: number): Promise<Proof | null> {
  return memo("mil:proof", 5 * 60_000, async () => {
    const r = await db.execute(sql`select price, result from terminal.millionaire_bets where tier = 'millionaire' and result in ('won', 'lost')`);
    const mil = followRecord((r.rows as Row[]).map(x => ({ price: n(x.price), result: x.result as "won" | "lost" })));
    if (mil.n >= MIN_SETTLED) return { kind: "millionaire", label: "millionaire bet", record: mil };
    const all = await trackerFollowAll(db, now).catch(() => null);
    const shots = all?.get("underdog-hunters" as never)?.all;
    if (shots && shots.n >= MIN_SETTLED) return { kind: "tracker", label: "Long Shots bet", record: shots };
    return null;
  });
}

export interface TopWallet { short: string; wallet: string; tier: Tier; pnl: number; dollars: number; bets: number; last: BoardBet | null }

/** The watchlist wallets putting the most into these categories over the last 30 days. */
export async function topWallets(db: Db, categories: readonly string[], now: number, limit = 3): Promise<TopWallet[]> {
  const cats = categories.length ? categories : CATEGORY_SLUGS;
  const r = await db.execute(sql`select b.wallet, max(w.tier) as tier, max(w.pnl)::float as pnl, sum(b.amount)::float as dollars, count(*)::int as bets
    from terminal.millionaire_bets b join terminal.watchlist w on w.wallet = b.wallet
    where b.at > ${new Date(now - 30 * DAY)} and b.category in (${sql.join(cats.map(c => sql`${c}`), sql`, `)})
    group by b.wallet order by max(case when w.tier = 'millionaire' then 1 else 0 end) desc, dollars desc limit ${limit}`);
  const out: TopWallet[] = [];
  for (const x of r.rows as Row[]) {
    const wallet = String(x.wallet);
    const [last] = await recentBets(db, { now, wallets: [wallet], limit: 1, member: true });
    out.push({ short: shortWallet(wallet), wallet, tier: x.tier === "millionaire" ? "millionaire" : "pro", pnl: n(x.pnl), dollars: n(x.dollars), bets: n(x.bets), last: last ?? null });
  }
  return out;
}

/** A wallet's all-time profit from the watchlist (for "A +$2.4M wallet just bet…"). */
export async function walletPnls(db: Db, wallets: readonly string[]): Promise<Map<string, number>> {
  if (!wallets.length) return new Map();
  const r = await db.execute(sql`select wallet, pnl from terminal.watchlist where wallet in (${sql.join(wallets.map(w => sql`${w.toLowerCase()}`), sql`, `)})`);
  return new Map((r.rows as Row[]).map(x => [String(x.wallet), n(x.pnl)]));
}

/** Bets today per category (the building screen's "37 bets in NFL today"). */
export async function betsToday(db: Db, categories: readonly string[], now: number): Promise<Map<string, number>> {
  if (!categories.length) return new Map();
  const r = await db.execute(sql`select category, count(*)::int as bets from terminal.millionaire_bets
    where at > ${new Date(now - DAY)} and category in (${sql.join(categories.map(c => sql`${c}`), sql`, `)}) group by category`);
  return new Map((r.rows as Row[]).map(x => [String(x.category), n(x.bets)]));
}
