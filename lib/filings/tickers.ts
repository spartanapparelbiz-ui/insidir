/* The ticker directory (SEC company_tickers.json, ~10k rows): read once a day, and rewritten only when the file's
 * SHA-256 differs from the last one stored (terminal.sec_seen "tickers:<hash>"), so an unchanged day costs one
 * request and no writes. The browser gets the whole list once (lib/filings/store.ts tickerList) and searches it
 * locally: no database read per keystroke. */
import { createHash } from "node:crypto";
import { eq, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { issuerTickers, secSeen } from "@/lib/db/schema";
import type { SecClient } from "@/lib/stocks/sec";

export const TICKERS_MS = 24 * 3_600_000;
const URL = "https://www.sec.gov/files/company_tickers.json";

/** {"0":{"cik_str":320193,"ticker":"AAPL","title":"Apple Inc."},…} → rows, upper-case tickers, one per ticker. */
export function parseTickers(json: unknown): Array<{ ticker: string; cik: string; title: string }> {
  const out = new Map<string, { ticker: string; cik: string; title: string }>();
  for (const v of Object.values((json ?? {}) as Record<string, unknown>)) {
    const r = v as { cik_str?: unknown; ticker?: unknown; title?: unknown };
    const ticker = String(r?.ticker ?? "").trim().toUpperCase(), cik = String(r?.cik_str ?? "").trim(), title = String(r?.title ?? "").trim();
    if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker) || !/^\d{1,10}$/.test(cik) || !title || out.has(ticker)) continue;
    out.set(ticker, { ticker, cik: String(Number(cik)), title });
  }
  return [...out.values()];
}

export async function tickersOnce(db: Db, sec: SecClient): Promise<{ changed: boolean; rows: number }> {
  const body = await sec.text(URL);
  const key = `tickers:${createHash("sha256").update(body).digest("hex").slice(0, 32)}`;
  const [hit] = await db.select({ key: secSeen.key }).from(secSeen).where(eq(secSeen.key, key));
  if (hit) return { changed: false, rows: 0 };
  const rows = parseTickers(JSON.parse(body));
  if (rows.length < 1000) throw new Error(`company_tickers.json looks short (${rows.length} rows)`);
  await db.transaction(async tx => {
    for (let i = 0; i < rows.length; i += 1000) {
      await tx.insert(issuerTickers).values(rows.slice(i, i + 1000))
        .onConflictDoUpdate({ target: issuerTickers.ticker, set: { cik: sql`excluded.cik`, title: sql`excluded.title` },
          setWhere: sql`(${issuerTickers.cik}, ${issuerTickers.title}) is distinct from (excluded.cik, excluded.title)` });
    }
    await tx.delete(issuerTickers).where(notInArray(issuerTickers.ticker, rows.map(r => r.ticker)));
    await tx.insert(secSeen).values({ key }).onConflictDoNothing();
  });
  return { changed: true, rows: rows.length };
}
