/* The ticker tape (components/terminal/Chrome.tsx): one line of real data, shared by everyone (no sides of open
 * positions, so it is the same for visitors and members), cached 60 seconds.
 *   markets  today's (ET) most-bet markets by $1M+ / Pro money: the YES price now, and its direction since the first
 *            of today's bets (▲ up, ▼ down, ■ flat or unknown)
 *   finals   markets the $1M+ wallets bet that settled today, with the outcome that won
 *   total    dollars bet by $1M+ wallets today
 * Nothing real to show: an empty tape (the bar says so). Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { getDb, hasDatabase } from "@/lib/db";
import { memo } from "@/lib/memo";

export interface TickerItem { kind: "market" | "final" | "total"; text: string; price?: number | null; dir?: "up" | "down" | "flat"; href?: string | null }
export interface Ticker { items: TickerItem[]; fetchedAt: number }

const ET_DAY_START = sql`(date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York')`;
const short = (s: string, n = 44) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export async function readTicker(db: Db, now: number): Promise<Ticker> {
  const markets = (await db.execute(sql`
    with today as (select market_id, max(market_title) as title, sum(amount)::float as dollars,
        (array_agg(case when outcome_side = 'yes' then price else 1 - price end order by at asc))[1] as first_yes
      from terminal.millionaire_bets where at >= ${ET_DAY_START} group by market_id)
    select t.market_id, t.title, t.dollars, t.first_yes, i.yes_price, coalesce(i.closed, false) as closed
    from today t left join terminal.market_info i on i.source = 'polymarket' and i.market_id = t.market_id
    order by t.dollars desc limit 8`)).rows as Array<{ market_id: string; title: string; dollars: number; first_yes: number | null; yes_price: number | null; closed: boolean }>;
  const finals = (await db.execute(sql`
    select market_id, max(market_title) as title,
      max(case when result = 'won' then outcome end) as winner
    from terminal.millionaire_bets where settled_at >= ${ET_DAY_START} and result in ('won', 'lost')
    group by market_id order by max(settled_at) desc limit 4`)).rows as Array<{ market_id: string; title: string; winner: string | null }>;
  const total = Number(((await db.execute(sql`select coalesce(sum(amount), 0)::float as n from terminal.millionaire_bets
    where tier = 'millionaire' and at >= ${ET_DAY_START}`)).rows[0] as { n?: number } | undefined)?.n ?? 0);

  const items: TickerItem[] = [];
  if (total > 0) items.push({ kind: "total", text: `${usd(total)} BET BY $1M+ WALLETS TODAY` });
  for (const m of markets) {
    // A market without a price now isn't shown (the tape never prints a dash where a price should be).
    if (m.closed || m.yes_price === null) continue;
    const p = m.yes_price === null ? null : Number(m.yes_price), f = m.first_yes === null ? null : Number(m.first_yes);
    const dir = p === null || f === null || Math.round(p * 100) === Math.round(f * 100) ? "flat" : p > f ? "up" : "down";
    items.push({ kind: "market", text: short(m.title), price: p, dir, href: null });
  }
  for (const f of finals) if (f.winner) items.push({ kind: "final", text: `FINAL ${short(f.title, 36)}: ${f.winner}` });
  return { items, fetchedAt: now };
}

/** "$4.2M", "$412K". */
function usd(v: number): string {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

/** The tape for the chrome: cached 60 seconds, empty without a database or on an error. */
export async function tickerNow(now = Date.now()): Promise<Ticker> {
  if (!hasDatabase()) return { items: [], fetchedAt: now };
  return memo("terminal:ticker", 60_000, () => readTicker(getDb(), now)).catch(() => ({ items: [], fetchedAt: now }));
}
