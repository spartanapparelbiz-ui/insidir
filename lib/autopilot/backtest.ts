/* A rule's backtest over the last BACKTEST_DAYS: every big Polymarket bet Insidir recorded (terminal.moves), run
 * through the rule as if it had been on, in time order, with nothing from the future:
 *   - the wallet counts as proven only if, from the positions it had settled BEFORE that bet (terminal.trader_positions),
 *     it was already up $1M+ with 30+ settled; wallets the screen leaves out (market makers, high frequency,
 *     arbitrage) are left out
 *   - "first entry" and "2+ wallets agree" look only at earlier bets
 *   - the price is Kalshi's ask for that side when Insidir first saw the bet (terminal.kalshi_history, from Kalshi's
 *     candlesticks on the market's approved twin) + 1¢; the price guard compares it with what the wallet paid; the daily
 *     and weekly caps apply. A bet with no Kalshi twin, or no Kalshi offer then, can't be followed on Kalshi: it is
 *     left out and counted (offKalshi)
 *   - each bet is held to settlement; losses count in full; unsettled ones are left out of the result and counted open
 * Kalshi's fees aren't taken off. Past results, not a promise. */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { mismatch, stakeLeft, tooLate, type Move, type RuleSpec } from "./rules";

export const BACKTEST_DAYS = 180;
const DAY = 86_400_000;

export interface BtRow {
  id: string; wallet: string; marketId: string; side: "yes" | "no"; category: string; url: string | null;
  title: string; eventTitle: string; outcome: string; amount: number; theirPrice: number; seenPrice: number; at: number;
  result: "won" | "lost" | "void" | null;
  /** Point in time: proven from what had settled before `at`; the wallet's first bet on this market and side. */
  provenThen: boolean; settledThen: number; firstEntry: boolean;
  /** Kalshi's ask for this side when Insidir saw it; null: not on Kalshi (no twin or no offer). */
  kalshiAsk: number | null;
}

export interface Backtest {
  days: number; from: number | null; to: number;
  bets: number; won: number; lost: number; void: number; open: number;
  staked: number; net: number; roi: number | null; winRate: number | null;
  tooLate: number; capped: number; offKalshi: number; maxDrawdown: number;
  /** Cumulative net by settled bet, at most 60 points: [ms, net]. */
  curve: Array<[number, number]>;
}

/** The same-side count each row would have seen: distinct proven-then wallets on its market and side in the hour up
 *  to it (itself included). Rows must be in time order. Pure. */
export function sameSideCounts(rows: readonly BtRow[]): number[] {
  return rows.map((r, i) => {
    const w = new Set<string>();
    for (let j = i; j >= 0 && rows[j]!.at >= r.at - 3_600_000; j--) {
      const x = rows[j]!;
      if (x.marketId === r.marketId && x.side === r.side && x.provenThen) w.add(x.wallet);
    }
    return w.size;
  });
}

const weekOf = (ms: number) => Math.floor((ms / DAY + 3) / 7); // weeks starting Monday (UTC)

export interface BacktestOptions {
  /** Price at Kalshi's ask (default), or at the market's price when Insidir saw it. */
  at?: "kalshi" | "seen";
  /** Only rows this keeps (an entry-price band, a category…), applied after the rule. */
  where?: (r: BtRow, entry: number) => boolean;
}

/** Runs the rule over the rows (any order). Pure. */
export function backtest(spec: RuleSpec, input: readonly BtRow[], now: number, days = BACKTEST_DAYS, opts: BacktestOptions = {}): Backtest {
  const rows = input.filter(r => r.at > now - days * DAY && r.at <= now).sort((a, b) => a.at - b.at);
  const same = sameSideCounts(rows);
  const spentDay = new Map<number, number>(), spentWeek = new Map<number, number>();
  const out: Backtest = { days, from: rows[0]?.at ?? null, to: now, bets: 0, won: 0, lost: 0, void: 0, open: 0, staked: 0, net: 0, roi: null, winRate: null, tooLate: 0, capped: 0, offKalshi: 0, maxDrawdown: 0, curve: [] };
  const settled: Array<{ at: number; pnl: number }> = [];
  rows.forEach((r, i) => {
    const m: Move = { id: r.id, wallet: r.wallet, kind: r.firstEntry ? "open" : "add", marketId: r.marketId, side: r.side, outcome: r.outcome, title: r.title, eventTitle: r.eventTitle,
      category: r.category, url: r.url, amount: r.amount, price: r.theirPrice, at: r.at, proven: r.provenThen, settled: r.settledThen, sameSide: same[i]! };
    if (mismatch(spec, m)) return;
    const price = opts.at === "seen" ? r.seenPrice : r.kalshiAsk;
    if (price === null) { out.offKalshi++; return; }
    if (opts.where && !opts.where(r, Math.min(0.99, price + 0.01))) return;
    if (tooLate(spec, r.theirPrice, price)) { out.tooLate++; return; }
    const d = Math.floor(r.at / DAY), w = weekOf(r.at);
    const stake = stakeLeft(spec, spentDay.get(d) ?? 0, spentWeek.get(w) ?? 0);
    const entry = Math.min(0.99, Math.round((price + 0.01) * 100) / 100);
    const contracts = Math.floor(stake / entry + 1e-9);
    if (contracts < 1) { out.capped++; return; }
    const cost = contracts * entry;
    spentDay.set(d, (spentDay.get(d) ?? 0) + cost); spentWeek.set(w, (spentWeek.get(w) ?? 0) + cost);
    out.bets++;
    if (r.result === null) { out.open++; return; }
    out[r.result]++;
    if (r.result === "void") return;
    out.staked += cost;
    settled.push({ at: r.at, pnl: r.result === "won" ? contracts - cost : -cost });
  });
  let run = 0, peak = 0;
  for (const s of settled) { run += s.pnl; peak = Math.max(peak, run); out.maxDrawdown = Math.max(out.maxDrawdown, peak - run); }
  out.net = Math.round(run * 100) / 100;
  out.staked = Math.round(out.staked * 100) / 100;
  out.maxDrawdown = Math.round(out.maxDrawdown * 100) / 100;
  out.roi = out.staked > 0 ? out.net / out.staked : null;
  out.winRate = out.won + out.lost > 0 ? out.won / (out.won + out.lost) : null;
  const step = Math.max(1, Math.ceil(settled.length / 60));
  let acc = 0;
  settled.forEach((s, i) => { acc += s.pnl; if (i % step === step - 1 || i === settled.length - 1) out.curve.push([s.at, Math.round(acc * 100) / 100]); });
  return out;
}

/** The backtest's key: the parts of the rule that change its result. */
export function specKey(spec: RuleSpec): string {
  const { quiet: _q, ...rest } = spec;
  return createHash("sha1").update(JSON.stringify(rest)).digest("hex").slice(0, 16);
}

const EXCLUDED = new Set(["market maker", "high frequency", "arbitrage"]);

/** The last `days` of recorded big Polymarket bets, with point-in-time proven flags. */
export async function backtestRows(db: Db, now: number, days = BACKTEST_DAYS): Promise<BtRow[]> {
  const r = await db.execute(sql`
    with m as (
      select id, wallet, market_id, outcome_side, category, url, market_title, event_title, outcome, amount, avg_price, seen_price, at, result
      from terminal.moves
      where source = 'polymarket' and hidden_at is null and seen_src = 'history' and seen_price is not null and avg_price > 0
        and at > ${new Date(now - days * DAY)} and wallet in (select wallet from terminal.trader_records)
    )
    select m.*, p.pnl_then, p.settled_then, w.exclusion, h.ask as kalshi_ask,
      not exists (select 1 from terminal.moves e where e.wallet = m.wallet and e.market_id = m.market_id and e.outcome_side = m.outcome_side and e.at < m.at) as first_entry
    from m
    left join lateral (select coalesce(sum(tp.pnl), 0)::float as pnl_then, count(*)::int as settled_then
      from terminal.trader_positions tp where tp.wallet = m.wallet and tp.resolved_at < m.at) p on true
    left join terminal.watchlist w on w.wallet = m.wallet
    left join terminal.kalshi_history h on h.move_id = m.id`);
  return (r.rows as Array<Record<string, unknown>>).map(x => {
    const settledThen = Number(x.settled_then ?? 0);
    return {
      id: String(x.id), wallet: String(x.wallet), marketId: String(x.market_id), side: x.outcome_side === "no" ? "no" as const : "yes" as const, category: String(x.category),
      url: x.url ? String(x.url) : null, title: String(x.market_title), eventTitle: String(x.event_title), outcome: String(x.outcome), amount: Number(x.amount),
      theirPrice: Number(x.avg_price), seenPrice: Number(x.seen_price), at: new Date(String(x.at)).getTime(),
      result: x.result === "won" || x.result === "lost" || x.result === "void" ? x.result : null,
      provenThen: Number(x.pnl_then ?? 0) >= 1_000_000 && settledThen >= 30 && !EXCLUDED.has(String(x.exclusion ?? "")),
      settledThen, firstEntry: x.first_entry === true, kalshiAsk: x.kalshi_ask === null || x.kalshi_ask === undefined ? null : Number(x.kalshi_ask),
    };
  });
}
