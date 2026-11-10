/* The tape: every big move Insidir sees, newest first, in one feed (components/system/Tape.tsx, /api/tape).
 *   bet     a watched wallet (up $100K+, $1M+ marked) puts $1K+ on a side (terminal.millionaire_bets)
 *   trim    a watched wallet sells part of a position; exit: sells out (terminal.position_events)
 *   whale   any Polymarket wallet trades $10K+ (terminal.moves, wallets outside the watchlist), with its profit and record
 *           when known
 *   kalshi  a $5K+ trade on Kalshi (terminal.moves; Kalshi trades are anonymous: no wallet)
 * Each row carries what helps read it: the wallet's tier, all-time profit and won–lost record (trader_records), and the
 * big money in that market over 7 days (the $100K+ wallets', per side for members, the total for visitors).
 * Visitors: rows 60 minutes late (BOARD_DELAY_MS), and never a side, an outcome or a price (the member-only part).
 * Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { isCategory, type CategorySlug } from "@/lib/brand/categories";
import { BOARD_DELAY_MS } from "@/lib/millionaires/queries";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { humanLine } from "@/lib/markets/title";
import { betPath, marketPath } from "@/lib/entities/slug";

export const TAPE_KINDS = ["bet", "trim", "exit", "whale", "kalshi"] as const;
export type TapeKind = typeof TAPE_KINDS[number];
/** "Everything": the wallets we can name. Kalshi (anonymous, many small fills) has its own filter. */
export const MAIN_KINDS: readonly TapeKind[] = ["bet", "trim", "exit", "whale"];
export const isTapeKind = (k: unknown): k is TapeKind => typeof k === "string" && (TAPE_KINDS as readonly string[]).includes(k);

export interface TapeRow {
  id: string; kind: TapeKind; at: number;
  title: string; category: CategorySlug; marketId: string; href: string | null;
  amount: number;
  /** Members only (null for visitors): the side, its name and the price paid (or sold at). */
  side: "yes" | "no" | null; outcome: string | null; price: number | null;
  /** The wallet: "millionaire" ($1M+), "pro" ($100K+), "whale" (any other), null on Kalshi. */
  tier: "millionaire" | "pro" | "whale" | null;
  short: string | null; pnl: number | null; record: { won: number; lost: number } | null; newWallet: boolean | null;
  /** The $100K+ wallets' money in this market over 7 days: per side for members, the total for everyone. */
  market: { total: number; wallets: number; yes: number | null; no: number | null } | null;
  /** Trades folded into this row: the same wallet (or Kalshi market) on the same market and side within 10 minutes. */
  trades: number; firstAt: number;
  /** $25K or more in this row. */
  big: boolean;
}

/** Repeat trades within this window fold into one row. */
export const GROUP_MS = 10 * 60_000;
export const BIG = 25_000;

const DAY = 86_400_000;
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const cat = (c: unknown): CategorySlug => (isCategory(String(c)) ? (String(c) as CategorySlug) : "world");

/** Newest first, merged, `limit` rows; `kinds` narrows it. */
export async function tape(db: Db, o: { now: number; member: boolean; limit?: number; kinds?: readonly TapeKind[]; since?: number }): Promise<TapeRow[]> {
  const limit = Math.min(Math.max(o.limit ?? 40, 1), 100), raw = limit * 4;
  const until = new Date(o.now - (o.member ? 0 : BOARD_DELAY_MS)), since = new Date(o.since ?? o.now - DAY);
  const want = (k: TapeKind) => !o.kinds?.length || o.kinds.includes(k);
  const [bets, exits, whales, kalshi] = await Promise.all([
    want("bet") ? db.execute(sql`select b.id, 'bet' as kind, b.at, b.market_title as title, b.category, b.market_id, b.amount, b.outcome_side as side, b.outcome, b.price,
        b.tier, b.wallet, w.pnl, r.won, r.lost, null::boolean as new_wallet
      from terminal.millionaire_bets b left join terminal.watchlist w on w.wallet = b.wallet left join terminal.trader_records r on r.wallet = b.wallet
      where b.at > ${since} and b.at <= ${until} order by b.at desc limit ${raw}`).then(r => r.rows) : Promise.resolve([]),
    want("trim") || want("exit") ? db.execute(sql`select e.id, e.kind, e.at, e.market_title as title, e.category, e.market_id, e.amount, e.outcome_side as side, e.outcome, e.price,
        e.tier, e.wallet, w.pnl, r.won, r.lost, null::boolean as new_wallet
      from terminal.position_events e left join terminal.watchlist w on w.wallet = e.wallet left join terminal.trader_records r on r.wallet = e.wallet
      where e.kind in ('trim', 'exit') and e.at > ${since} and e.at <= ${until} order by e.at desc limit ${raw}`).then(r => r.rows.filter(x => want(String(x.kind) as TapeKind))) : Promise.resolve([]),
    want("whale") ? db.execute(sql`select m.id, 'whale' as kind, m.at, m.market_title as title, m.category, m.market_id, m.amount, m.outcome_side as side, m.outcome, m.avg_price as price,
        'whale' as tier, m.wallet, p.pnl, r.won, r.lost, m.new_wallet
      from terminal.moves m left join terminal.wallet_pnl p on p.wallet = m.wallet left join terminal.trader_records r on r.wallet = m.wallet
      where m.source = 'polymarket' and m.hidden_at is null and m.wallet is not null and m.at > ${since} and m.at <= ${until}
        and not exists (select 1 from terminal.watchlist w where w.wallet = m.wallet)
      order by m.at desc limit ${raw}`).then(r => r.rows) : Promise.resolve([]),
    want("kalshi") ? db.execute(sql`select m.id, 'kalshi' as kind, m.at, m.market_title as title, m.category, m.market_id, m.amount, m.outcome_side as side, m.outcome, m.avg_price as price,
        null as tier, null as wallet, null::float8 as pnl, null::int as won, null::int as lost, null::boolean as new_wallet
      from terminal.moves m where m.source = 'kalshi' and m.hidden_at is null and m.at > ${since} and m.at <= ${until}
      order by m.at desc limit ${raw}`).then(r => r.rows) : Promise.resolve([]),
  ]);
  const all = [...bets, ...exits, ...whales, ...kalshi] as Array<Record<string, unknown>>;
  all.sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime());
  // Fold repeat trades (a wallet splitting one bet into many fills) into one row: same kind, market, wallet and side,
  // each within GROUP_MS of the next. The newest trade gives the row its id and time; amounts add up, the price is
  // the money-weighted average.
  type G = { r: Record<string, unknown>; amount: number; px: number; trades: number; oldest: number };
  const groups: G[] = [], open = new Map<string, G>();
  for (const r of all) {
    const at = new Date(String(r.at)).getTime(), amt = n(r.amount), p = nn(r.price);
    const key = [r.kind, r.market_id, r.wallet ?? "", r.side ?? ""].join("|");
    const g = open.get(key);
    if (g && g.oldest - at <= GROUP_MS) { g.amount += amt; g.px += (p ?? 0) * amt; g.trades += 1; g.oldest = at; continue; }
    const ng = { r, amount: amt, px: (p ?? 0) * amt, trades: 1, oldest: at };
    open.set(key, ng); groups.push(ng);
  }
  const kept = groups.slice(0, limit);
  const rows = kept.map(g => g.r);
  // The big money in each market on the tape (Polymarket markets; the $100K+ wallets, 7 days).
  const ids = [...new Set(rows.filter(r => r.kind !== "kalshi").map(r => String(r.market_id)))];
  const money = new Map<string, { yes: number; no: number; wallets: number }>();
  if (ids.length) {
    const r = await db.execute(sql`select market_id, coalesce(sum(amount) filter (where outcome_side = 'yes'), 0)::float8 as yes,
        coalesce(sum(amount) filter (where outcome_side = 'no'), 0)::float8 as no, count(distinct wallet)::int as wallets
      from terminal.millionaire_bets where at > ${new Date(o.now - 7 * DAY)} and at <= ${until}
        and market_id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)}) group by market_id`).catch(() => ({ rows: [] }));
    for (const x of r.rows as Array<Record<string, unknown>>) money.set(String(x.market_id), { yes: n(x.yes), no: n(x.no), wallets: n(x.wallets) });
  }
  return kept.map(g => {
    const r = g.r, kind = String(r.kind) as TapeKind, id = String(r.id), title = humanLine({ title: String(r.title ?? "") }), mid = String(r.market_id);
    const m = money.get(mid), wallet = r.wallet ? String(r.wallet) : null;
    const tier = r.tier === "millionaire" || r.tier === "pro" || r.tier === "whale" ? r.tier : null;
    return {
      id, kind, at: new Date(String(r.at)).getTime(), title, category: cat(r.category), marketId: mid,
      href: kind === "bet" ? betPath(id) : kind === "kalshi" ? null : marketPath(mid, title),
      amount: g.amount,
      side: o.member ? (r.side === "no" ? "no" : r.side === "yes" ? "yes" : null) : null,
      outcome: o.member && r.outcome ? String(r.outcome) : null,
      price: o.member && r.price !== null && r.price !== undefined && g.amount > 0 ? g.px / g.amount : null,
      tier, short: wallet ? shortWallet(wallet) : null, pnl: nn(r.pnl),
      record: r.won !== null && r.won !== undefined ? { won: n(r.won), lost: n(r.lost) } : null,
      newWallet: r.new_wallet === null || r.new_wallet === undefined ? null : Boolean(r.new_wallet),
      market: m ? { total: m.yes + m.no, wallets: m.wallets, yes: o.member ? m.yes : null, no: o.member ? m.no : null } : null,
      trades: g.trades, firstAt: g.oldest, big: g.amount >= BIG,
    };
  });
}

/* ---------- The whale ticker (components/system/WhaleTicker.tsx, /api/tape/whales): members only ---------- */

export const WHALE_TICKER_MIN = 10_000;
export interface WhaleTick {
  id: string; venue: "polymarket" | "kalshi"; at: number;
  title: string; outcome: string; amount: number;
  /** The side's implied probability when the trade filled, and the same side's price now (market_info); null when unknown. */
  from: number | null; to: number | null;
  /** Our market page (Polymarket), or the market on Kalshi; null when there's neither. */
  href: string | null; external: boolean;
}

/** The newest $10K+ trades in the last 6 hours, both venues: watched wallets' bets, any-wallet whales, Kalshi. */
export async function whaleTicker(db: Db, o: { now: number; limit?: number }): Promise<WhaleTick[]> {
  const limit = Math.min(Math.max(o.limit ?? 24, 1), 60), since = new Date(o.now - 6 * 3_600_000), until = new Date(o.now);
  const r = await db.execute(sql`select x.*, i.yes_price from (
      select b.id, 'polymarket' as venue, b.at, b.market_title as title, b.market_id, b.outcome, b.outcome_side as side, b.price, b.amount, null::text as url
        from terminal.millionaire_bets b where b.at > ${since} and b.at <= ${until} and b.amount >= ${WHALE_TICKER_MIN}
      union all
      select m.id, m.source, m.at, m.market_title, m.market_id, m.outcome, m.outcome_side, m.avg_price, m.amount, m.url
        from terminal.moves m where m.hidden_at is null and m.amount >= ${WHALE_TICKER_MIN} and m.at > ${since} and m.at <= ${until}
          and (m.source = 'kalshi' or (m.source = 'polymarket' and (m.wallet is null or not exists (select 1 from terminal.watchlist w where w.wallet = m.wallet))))
    ) x left join terminal.market_info i on i.source = x.venue and i.market_id = x.market_id
    order by x.at desc limit ${limit}`);
  return (r.rows as Array<Record<string, unknown>>).map(x => {
    const venue = x.venue === "kalshi" ? "kalshi" as const : "polymarket" as const, title = humanLine({ title: String(x.title ?? "") });
    const yes = nn(x.yes_price), side = x.side === "no" ? "no" : "yes";
    const from = nn(x.price), to = yes === null ? null : side === "no" ? 1 - yes : yes;
    const url = x.url ? String(x.url) : null;
    return {
      id: String(x.id), venue, at: new Date(String(x.at)).getTime(), title, outcome: x.outcome ? String(x.outcome) : side === "no" ? "No" : "Yes",
      amount: n(x.amount), from: from !== null && from > 0 && from < 1 ? from : null, to: to !== null && to >= 0 && to <= 1 ? to : null,
      href: venue === "polymarket" ? marketPath(String(x.market_id), title) : url, external: venue === "kalshi" && url !== null,
    };
  });
}

/* ---------- One market's big-wallet move log (the market page's members-only panel) ---------- */

export interface MarketMove { id: string; kind: "bet" | "trim" | "exit"; at: number; amount: number; tier: "millionaire" | "pro" | null; short: string; outcome: string | null; price: number | null }

/** The last 7 days of $1K+ bets, trims and exits by watched wallets on one market, newest first, and how many there
 *  were. Visitors get the count only (the rows name sides). */
export async function marketMoves(db: Db, marketId: string, o: { now: number; member: boolean; limit?: number }): Promise<{ count: number; rows: MarketMove[] }> {
  const since = new Date(o.now - 7 * DAY), until = new Date(o.now);
  const r = await db.execute(sql`select * from (
      select id, 'bet' as kind, at, amount, tier, wallet, outcome, price from terminal.millionaire_bets where market_id = ${marketId} and at > ${since} and at <= ${until}
      union all
      select id, kind, at, amount, tier, wallet, outcome, price from terminal.position_events where market_id = ${marketId} and kind in ('trim', 'exit') and at > ${since} and at <= ${until}
    ) x order by at desc`);
  const all = r.rows as Array<Record<string, unknown>>;
  if (!o.member) return { count: all.length, rows: [] };
  return {
    count: all.length,
    rows: all.slice(0, o.limit ?? 12).map(x => ({
      id: String(x.id), kind: x.kind === "trim" || x.kind === "exit" ? x.kind : "bet", at: new Date(String(x.at)).getTime(), amount: n(x.amount),
      tier: x.tier === "millionaire" || x.tier === "pro" ? x.tier : null, short: shortWallet(String(x.wallet)), outcome: x.outcome ? String(x.outcome) : null, price: nn(x.price),
    })),
  };
}
