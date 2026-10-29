/* CUSIP → ticker for what funds add (13F lists CUSIPs, prices are by ticker), from OpenFIGI's free mapping API
 * (api.openfigi.com/v3/mapping: up to 10 ids a request and 25 requests a minute without a key). Only US-listed
 * common shares are kept; a CUSIP with none is stored as null and asked again after 30 days. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { cusipTickers } from "@/lib/db/schema";

const DAY = 86_400_000;

/** One mapping answer per CUSIP asked, in order: the first US composite ticker of a share, else null. Pure. */
export function readFigi(raw: unknown, asked: number): Array<string | null> {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: asked }, (_, i) => {
    const data = (list[i] as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
    const pick = data.find(d => d.exchCode === "US" && /share|common|adr|reit|etp/i.test(String(d.securityType ?? d.securityType2 ?? ""))) ?? data.find(d => d.exchCode === "US");
    const t = typeof pick?.ticker === "string" ? pick.ticker.toUpperCase().replace(/\//g, ".") : null;
    return t && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t) ? t : null;
  });
}

/** Maps fund-add CUSIPs that aren't mapped yet (perRun requests of 10). */
export async function cusipOnce(db: Db, now: number, perRun = 5): Promise<number> {
  const r = await db.execute(sql`select distinct m.detail->>'cusip' as cusip from terminal.moves m
    left join terminal.cusip_tickers c on c.cusip = m.detail->>'cusip'
    where m.source = 'sec' and m.detail->>'kind' = 'fund' and m.at > ${new Date(now - 200 * DAY)}
      and (c.cusip is null or (c.ticker is null and c.checked_at < ${new Date(now - 30 * DAY)})) limit ${perRun * 10}`);
  const todo = (r.rows as Array<{ cusip: string | null }>).map(x => x.cusip).filter((c): c is string => Boolean(c && /^[0-9A-Z]{9}$/.test(c)));
  let n = 0;
  for (let i = 0; i < todo.length; i += 10) {
    const part = todo.slice(i, i + 10);
    let res: Response | null = null;
    try {
      res = await fetch("https://api.openfigi.com/v3/mapping", {
        method: "POST", headers: { "Content-Type": "application/json", ...(process.env.OPENFIGI_KEY ? { "X-OPENFIGI-APIKEY": process.env.OPENFIGI_KEY } : {}) },
        body: JSON.stringify(part.map(c => ({ idType: "ID_CUSIP", idValue: c }))), signal: AbortSignal.timeout(10_000),
      });
    } catch { break; }
    if (!res.ok) break;
    const got = readFigi(await res.json().catch(() => null), part.length);
    for (let k = 0; k < part.length; k++) {
      await db.insert(cusipTickers).values({ cusip: part[k]!, ticker: got[k] ?? null, checkedAt: new Date(now) })
        .onConflictDoUpdate({ target: cusipTickers.cusip, set: { ticker: got[k] ?? null, checkedAt: new Date(now) } });
      n++;
    }
    await new Promise(r => setTimeout(r, 2600));
  }
  return n;
}
