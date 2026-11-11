/* My copies (keeping score): every trade a member tapped Copy on, with their entry, the price now, the wallet they
 * copied and whether it's still in, and what they marked (placed or skipped). Totals count placed copies only: settled
 * ones at their result, open ones at today's price on their venue. This week (since Monday 00:00 ET), this month
 * (since the 1st, ET) and all time, by when they copied. Server only, except the pure totals. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { venuePrices } from "./alert-store";

export interface MyCopy {
  id: number; betId: string; title: string; outcome: string; side: "yes" | "no"; venue: "kalshi" | "polymarket"; at: number;
  status: "copied" | "placed" | "skipped"; amount: number; entry: number; theirPrice: number; now: number | null;
  wallet: string | null; short: string | null; stillIn: boolean | null;
  result: "won" | "lost" | "void" | null; pnl: number | null;
  /** Settled: its P&L; open: at today's price (amount / entry shares × the move); null without a price. */
  value: number | null;
}
export interface Totals { week: number; month: number; all: number; placed: number; open: number }

const ET_PARTS = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23", minute: "2-digit" });
/** Midnight ET that started this week (Monday) and this month, as ms. Pure. */
export function periodStarts(now: number): { week: number; month: number } {
  const p = Object.fromEntries(ET_PARTS.formatToParts(new Date(now)).map(x => [x.type, x.value]));
  const sinceMidnight = (Number(p.hour) * 60 + Number(p.minute)) * 60_000 + (now % 60_000);
  const midnight = now - sinceMidnight;
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(String(p.weekday));
  return { week: midnight - Math.max(0, dow) * 86_400_000, month: midnight - (Number(p.day) - 1) * 86_400_000 };
}

/** A copy's value: settled at its P&L; open at the price now ((now − entry) / entry × amount). Pure. */
export function copyValue(c: Pick<MyCopy, "result" | "pnl" | "amount" | "entry" | "now">): number | null {
  if (c.result) return c.pnl ?? 0;
  if (c.now === null || !(c.entry > 0)) return null;
  return Math.round(((c.now - c.entry) / c.entry) * c.amount * 100) / 100;
}

export function totals(list: readonly MyCopy[], now: number): Totals {
  const { week, month } = periodStarts(now);
  const placed = list.filter(c => c.status === "placed");
  const sum = (from: number) => Math.round(placed.filter(c => c.at >= from).reduce((s, c) => s + (c.value ?? 0), 0) * 100) / 100;
  return { week: sum(week), month: sum(month), all: sum(0), placed: placed.length, open: placed.filter(c => !c.result).length };
}

export async function myCopies(db: Db, userId: string, now: number, limit = 200): Promise<{ list: MyCopy[]; totals: Totals }> {
  const r = await db.execute(sql`select c.*, (select e.kind from terminal.position_events e where e.wallet = c.wallet and e.market_id = c.market_id and e.outcome_side = c.outcome_side
        and e.at > c.created_at and (e.kind = 'exit' or e.held_after <= 0) order by e.at desc limit 1) as out_kind
    from terminal.bet_copies c where c.user_id = ${userId} order by c.created_at desc limit ${limit}`);
  const rows = r.rows as Array<Record<string, unknown>>;
  const prices = await venuePrices(db, rows.filter(x => !x.result).map(x => ({ marketId: String(x.market_id), side: x.outcome_side === "no" ? "no" as const : "yes" as const }))).catch(() => new Map());
  const list: MyCopy[] = rows.map(x => {
    const side = x.outcome_side === "no" ? "no" as const : "yes" as const, venue = x.venue === "kalshi" ? "kalshi" as const : "polymarket" as const;
    const vp = prices.get(`${x.market_id}:${side}`), wallet = x.wallet ? String(x.wallet) : null;
    const c: MyCopy = {
      id: Number(x.id), betId: String(x.bet_id), title: String(x.title), outcome: String(x.outcome), side, venue, at: new Date(String(x.created_at)).getTime(),
      status: x.status === "skipped" ? "skipped" : x.status === "copied" ? "copied" : "placed", amount: Number(x.amount), entry: Number(x.price), theirPrice: Number(x.their_price),
      now: x.result ? null : (venue === "kalshi" ? vp?.kalshi : vp?.polymarket) ?? vp?.polymarket ?? null,
      wallet, short: wallet ? shortWallet(wallet) : null, stillIn: wallet ? !x.out_kind : null,
      result: (x.result as MyCopy["result"]) ?? null, pnl: x.pnl === null || x.pnl === undefined ? null : Number(x.pnl), value: null,
    };
    c.value = copyValue(c);
    return c;
  });
  return { list, totals: totals(list, now) };
}

export async function setCopyStatus(db: Db, userId: string, id: number, status: "placed" | "skipped"): Promise<boolean> {
  const r = await db.execute(sql`update terminal.bet_copies set status = ${status} where id = ${id} and user_id = ${userId} returning id`);
  return r.rows.length > 0;
}

/** Where a copy's market opens: its venue's market page (Kalshi's twin, or the Polymarket market). */
export async function copyLink(db: Db, userId: string, id: number): Promise<string | null> {
  const r = await db.execute(sql`select c.venue, b.url, coalesce((select tw.kalshi_url from terminal.market_twins tw where tw.polymarket_id = c.market_id and tw.status = 'approved'), b.kalshi_url) as kalshi_url
    from terminal.bet_copies c left join terminal.millionaire_bets b on b.id = c.bet_id where c.id = ${id} and c.user_id = ${userId}`);
  const x = r.rows[0] as { venue: string; url: string | null; kalshi_url: string | null } | undefined;
  if (!x) return null;
  return (x.venue === "kalshi" ? x.kalshi_url ?? x.url : x.url ?? x.kalshi_url) ?? null;
}
