/* What following a recorded bet on Kalshi would have cost: Kalshi's ask for that side at the moment Insidir saw the bet
 * (terminal.moves.seen_at), from Kalshi's candlesticks on the market's approved twin. A YES buy pays the YES ask; a NO
 * buy pays 1 − the YES bid. Kept in terminal.kalshi_history; the backtests (lib/autopilot/backtest.ts) price at it + 1¢.
 * Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";

const MIN = 60_000;

export interface Candle { end: number; yesAsk: number | null; yesBid: number | null }

const n = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const close = (o: unknown): number | null => {
  if (!o || typeof o !== "object") return null;
  const x = o as Record<string, unknown>;
  const d = n(x.close_dollars), c = n(x.close);
  return d ?? (c === null ? null : c / 100);
};

/** Kalshi's raw candlesticks → ask/bid closes per period. Pure. */
export function readCandles(raw: unknown): Candle[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { candlesticks?: unknown }).candlesticks) ? (raw as { candlesticks: Array<Record<string, unknown>> }).candlesticks : [];
  return list.map(c => ({ end: (n(c.end_period_ts) ?? 0) * 1000, yesAsk: close(c.yes_ask), yesBid: close(c.yes_bid) }))
    .filter(c => c.end > 0).sort((a, b) => a.end - b.end);
}

/** The ask for `side` at `at`: the last period that had closed by then. Nothing later, so no lookahead. Pure. */
export function askAt(candles: readonly Candle[], side: "yes" | "no", at: number): number | null {
  const c = [...candles].reverse().find(x => x.end <= at);
  if (!c) return null;
  const p = side === "yes" ? c.yesAsk : c.yesBid === null ? null : 1 - c.yesBid;
  return p !== null && p > 0 && p < 1 ? Math.round(p * 100) / 100 : null;
}

export interface CandleSource { candles(series: string, ticker: string, fromMs: number, toMs: number, periodMin: 1 | 60): Promise<unknown> }

/** Rows with no ask read before this were possibly a failed request saved as "no price" (fixed Nov 4): read again. */
export const RECHECK_EMPTY_BEFORE = Date.parse("2026-11-05T00:00:00Z");
/** A run's time budget and one candle request's timeout: a run always ends (a hung run held the job for good). */
export const ASKS_RUN_MS = 45_000, CANDLE_TIMEOUT_MS = 10_000;

/** Kalshi asks for recorded bets on twinned markets that don't have one yet, newest first. A bet is stored with no ask
 *  only when Kalshi answered with no candle at that time; a failed or timed-out request stores nothing, so the bet is
 *  read again later instead of counted off Kalshi for good. */
export async function kalshiAsksOnce(db: Db, src: CandleSource, now: number, batch = 200, lanes = 6, o: { runMs?: number; timeoutMs?: number } = {}): Promise<{ read: number; priced: number; failed: number }> {
  const runMs = o.runMs ?? ASKS_RUN_MS, timeoutMs = o.timeoutMs ?? CANDLE_TIMEOUT_MS;
  const r = await db.execute(sql`select m.id, m.outcome_side, m.seen_at, t.kalshi_id from terminal.moves m
      join terminal.market_twins t on t.polymarket_id = m.market_id and t.status = 'approved'
    where m.source = 'polymarket' and m.seen_at is not null and m.at > ${new Date(now - 181 * 86_400_000)}
      and not exists (select 1 from terminal.kalshi_history h where h.move_id = m.id and (h.ask is not null or h.read_at >= ${new Date(RECHECK_EMPTY_BEFORE)}))
    order by m.seen_at desc limit ${batch}`);
  const t0 = Date.now();
  let priced = 0, failed = 0, read = 0, next = 0;
  const list = r.rows as Array<{ id: string; outcome_side: string; seen_at: string; kalshi_id: string }>;
  type Got = { ok: true; raw: unknown } | { ok: false };
  const timed = (p: Promise<unknown>): Promise<Got> =>
    Promise.race([p.then((raw): Got => ({ ok: true, raw }), (): Got => ({ ok: false })), new Promise<Got>(ok => setTimeout(() => ok({ ok: false }), timeoutMs))]);
  // A few bets at once: one at a time left the 180-day fill hours behind; Kalshi's limiter still sets the pace.
  await Promise.all(Array.from({ length: Math.min(lanes, list.length) }, async () => {
    while (next < list.length && Date.now() - t0 < runMs) {
      const x = list[next++]!;
      const at = new Date(x.seen_at).getTime(), series = x.kalshi_id.split("-")[0]!;
      let ask: number | null = null, bad = false;
      for (const [from, to, period] of [[at - 10 * MIN, at + 2 * MIN, 1], [at - 3 * 60 * MIN, at + 60 * MIN, 60]] as const) {
        const got = await timed(src.candles(series, x.kalshi_id, from, to, period));
        if (!got.ok) { bad = true; break; }
        ask = askAt(readCandles(got.raw), x.outcome_side === "no" ? "no" : "yes", at);
        if (ask !== null) break;
      }
      if (bad) { failed++; continue; }
      await db.execute(sql`insert into terminal.kalshi_history (move_id, kalshi_id, ask, read_at) values (${x.id}, ${x.kalshi_id}, ${ask}, ${new Date(now)})
        on conflict (move_id) do update set ask = excluded.ask, read_at = excluded.read_at`);
      read++;
      if (ask !== null) priced++;
    }
  }));
  return { read, priced, failed };
}
