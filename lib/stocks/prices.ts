/* Daily closing prices for the tickers insiders bought, and SPY for the S&P 500 (terminal.stock_closes), from a free
 * daily source: Stooq's CSV (stooq.com/q/d/l), else Yahoo Finance's chart API. Read once a day per ticker, a few
 * a second. Used for "how the stock did 30 / 90 / 180 days after the buy" (lib/stocks/returns.ts) and the company
 * page's price chart. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { stockCloses } from "@/lib/db/schema";

export const SPY = "SPY";
export interface Close { date: string; close: number }

/** Stooq daily CSV: "Date,Open,High,Low,Close,Volume". Pure. */
export function readStooq(csv: string): Close[] {
  const lines = csv.trim().split(/\r?\n/);
  if (!/^date,/i.test(lines[0] ?? "")) return [];
  const head = lines[0]!.toLowerCase().split(","), di = head.indexOf("date"), ci = head.indexOf("close");
  return lines.slice(1).map(l => l.split(",")).map(c => ({ date: c[di] ?? "", close: Number(c[ci]) }))
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && Number.isFinite(x.close) && x.close > 0);
}

/** Yahoo chart JSON: chart.result[0].timestamp[] and indicators.quote[0].close[] (adjclose when present). Pure. */
export function readYahoo(raw: unknown): Close[] {
  const r = (raw as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }>; adjclose?: Array<{ adjclose?: Array<number | null> }> } }> } })?.chart?.result?.[0];
  const ts = r?.timestamp ?? [], cl = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  return ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: cl[i] ?? NaN })).filter(x => Number.isFinite(x.close) && x.close > 0);
}

const UA = "Mozilla/5.0 (compatible; Insidir/1.0; +https://insidir.com)";
async function get(url: string): Promise<Response | null> {
  try { return await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) }); } catch { return null; }
}

/** A ticker's daily closes for about two years; empty when neither source answered. */
export async function fetchCloses(ticker: string): Promise<Close[]> {
  const s = ticker.toLowerCase().replace(/\./g, "-");
  const a = await get(`https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}.us&i=d`);
  const fromStooq = a?.ok ? readStooq(await a.text()) : [];
  const cutoff = new Date(Date.now() - 2 * 366 * 86_400_000).toISOString().slice(0, 10);
  if (fromStooq.length) return fromStooq.filter(c => c.date >= cutoff);
  const b = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.replace(/\./g, "-"))}?range=2y&interval=1d`);
  return b?.ok ? readYahoo(await b.json().catch(() => null)) : [];
}

/** Tickers with an insider buy in the last 400 days whose closes weren't read in the last 20 hours, plus SPY. */
async function dueTickers(db: Db, now: number, limit: number): Promise<string[]> {
  const r = await db.execute(sql`with t as (
      select distinct upper(detail->>'ticker') as ticker from terminal.moves
      where source = 'sec' and detail->>'kind' = 'insider' and detail->>'ticker' is not null and at > ${new Date(now - 400 * 86_400_000)}
      union select ${SPY})
    select t.ticker from t left join (select ticker, max(updated_at) as u from terminal.stock_closes group by ticker) c on c.ticker = t.ticker
    where c.u is null or c.u < ${new Date(now - 20 * 3_600_000)} order by (t.ticker = ${SPY}) desc, c.u asc nulls first limit ${limit}`);
  return (r.rows as Array<{ ticker: string }>).map(x => x.ticker).filter(t => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t));
}

export async function stockPricesOnce(db: Db, now: number, perRun = 40): Promise<{ tickers: number; closes: number; missing: number }> {
  let closes = 0, missing = 0;
  const tickers = await dueTickers(db, now, perRun);
  for (const t of tickers) {
    const l = await fetchCloses(t);
    if (!l.length) { missing++; continue; }
    for (let i = 0; i < l.length; i += 500) {
      const part = l.slice(i, i + 500);
      await db.insert(stockCloses).values(part.map(c => ({ ticker: t, date: c.date, close: c.close, updatedAt: new Date(now) })))
        .onConflictDoUpdate({ target: [stockCloses.ticker, stockCloses.date], set: { close: sql`excluded.close`, updatedAt: new Date(now) } });
    }
    closes += l.length;
    await new Promise(r => setTimeout(r, 400));
  }
  return { tickers: tickers.length, closes, missing };
}

export async function closesFor(db: Db, tickers: readonly string[], fromDate: string): Promise<Map<string, Close[]>> {
  const ts = [...new Set(tickers.map(t => t.toUpperCase()))];
  if (!ts.length) return new Map();
  const r = await db.execute(sql`select ticker, date, close from terminal.stock_closes where ticker in (${sql.join(ts.map(t => sql`${t}`), sql`, `)}) and date >= ${fromDate} order by ticker, date`);
  const out = new Map<string, Close[]>();
  for (const x of r.rows as Array<{ ticker: string; date: string; close: number }>) out.set(x.ticker, [...(out.get(x.ticker) ?? []), { date: x.date, close: Number(x.close) }]);
  return out;
}
