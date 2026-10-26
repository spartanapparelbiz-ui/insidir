/* SEC history for profiles and "why this matters" (docs/INSIDIR-V2.md §6, Stocks):
 *   insider trades  every open-market buy (P) and sale (S) of stock on each Form 4 the Stocks job reads, plus the
 *                   EDGAR history of each insider who made a $100k+ buy ("owner") and of their company ("issuer"),
 *                   up to HISTORY_YEARS back. A history is complete from `completeSince` on: every Form 4 filed from
 *                   that date has been read.
 *   funds           each tracked fund's last FUND_QUARTERS 13F-HRs, read in full (tables that add up to the cover).
 * Every row keeps the filing it came from. Nothing is estimated: values are shares × the reported price. */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { fundFilings, fundHoldings, funds, insiderTrades, secHistory } from "@/lib/db/schema";
import { companyName, filingIndexUrl, indexTimestamp, ownershipCandidates, parseOwnership, roleWord, type Ownership } from "./form4";
import { cik10, filingIndex13f, thirteenFFilings } from "./form13f";
import type { SecClient } from "./sec";

export const HISTORY_YEARS = 10;
export const OWNER_MAX_FILINGS = 300;
export const ISSUER_MAX_FILINGS = 600;
/** Filings read per history run (two requests each), shared by every queued history. */
export const HISTORY_PER_RUN = 60;
export const FUND_QUARTERS = 8;

export type TradeRow = typeof insiderTrades.$inferInsert;

/** A Form 4's open-market buys and sales of stock (non-derivative P acquired / S disposed), one row per line and
 *  reporting owner with a CIK. Amendments are left out: they restate a filing. */
export function tradeRows(o: Ownership, accession: string, filedAt: number, url: string): TradeRow[] {
  if (/\/A$/i.test(o.documentType)) return [];
  const out: TradeRow[] = [];
  const company = companyName(o.issuerName);
  o.lines.forEach((l, line) => {
    if (l.derivative || l.value === null || l.shares === null || l.shares <= 0 || l.price === null) return;
    const code = l.code === "P" && l.acquiredDisposed === "A" ? "P" : l.code === "S" && l.acquiredDisposed === "D" ? "S" : null;
    if (!code) return;
    for (const owner of o.owners) {
      if (!owner.cik || !/^\d{1,10}$/.test(owner.cik)) continue;
      out.push({ accession, line, ownerCik: String(Number(owner.cik)), ownerName: owner.name, role: roleWord(owner), issuerCik: String(Number(o.issuerCik)),
        company, ticker: o.ticker, code, tradeDate: l.date, shares: l.shares, price: l.price, value: l.value, filedAt: new Date(filedAt), url });
    }
  });
  return out;
}

export async function saveTrades(db: Db, list: readonly TradeRow[]): Promise<void> {
  for (let i = 0; i < list.length; i += 500) await db.insert(insiderTrades).values(list.slice(i, i + 500)).onConflictDoNothing();
}

/** A filing's ownership document and when it reached EDGAR; null when it has no ownership XML. */
export async function readOwnership(sec: SecClient, indexBase: string): Promise<{ ownership: Ownership; filedAt: number | null } | null> {
  const index = await sec.json(`${indexBase}index.json`);
  for (const name of ownershipCandidates(index)) {
    const body = await sec.text(indexBase + name);
    if (!body.includes("ownershipDocument")) continue;
    try { return { ownership: parseOwnership(body), filedAt: indexTimestamp(index) }; } catch { continue; }
  }
  return null;
}

/** Form 4 originals in a submissions file (an insider's or a company's), newest first, back to `sinceDate`. */
export function form4List(submissions: unknown, sinceDate: string, max: number): Array<{ accession: string; filedOn: string }> {
  const r = ((submissions as Record<string, unknown> | null)?.filings as Record<string, unknown> | undefined)?.recent as Record<string, unknown[]> | undefined;
  if (!r || !Array.isArray(r.form)) return [];
  const out: Array<{ accession: string; filedOn: string }> = [];
  for (let i = 0; i < r.form.length && out.length < max; i++) {
    if (String(r.form[i]) !== "4") continue;
    const acc = String(r.accessionNumber?.[i] ?? ""), filed = String(r.filingDate?.[i] ?? "");
    if (!/^\d{10}-\d{2}-\d{6}$/.test(acc) || !/^\d{4}-\d{2}-\d{2}$/.test(filed) || filed < sinceDate) continue;
    out.push({ accession: acc.replace(/-/g, ""), filedOn: filed });
  }
  return out.sort((a, b) => b.filedOn.localeCompare(a.filedOn));
}

/** Queues an insider's and a company's EDGAR history (each once). */
export async function queueHistory(db: Db, items: ReadonlyArray<{ kind: "owner" | "issuer"; cik: string; name: string | null }>): Promise<void> {
  for (const it of items) await db.insert(secHistory).values({ kind: it.kind, cik: String(Number(it.cik)), name: it.name }).onConflictDoNothing();
}

const yearsAgo = (now: number, y: number) => new Date(now - y * 365.25 * 86_400_000).toISOString().slice(0, 10);

/** One run: lists new histories, then reads up to `budget` of their pending filings, newest first. */
export async function historyOnce(db: Db, sec: SecClient, now: number, budget = HISTORY_PER_RUN): Promise<{ read: number; done: number; errors: number }> {
  let read = 0, done = 0, errors = 0;
  const open = await db.select().from(secHistory)
    .where(sql`${secHistory.completeSince} is null or jsonb_array_length(${secHistory.pending}) > 0`).orderBy(secHistory.queuedAt).limit(20);
  for (const h of open) {
    if (read >= budget) break;
    let pending = h.pending;
    let completeSince = h.completeSince;
    const where = and(eq(secHistory.kind, h.kind), eq(secHistory.cik, h.cik));
    if (completeSince === null && !pending.length) {
      // First pass: the list of Form 4s to read.
      try {
        const subs = await sec.json<{ name?: string }>(`https://data.sec.gov/submissions/CIK${cik10(h.cik)}.json`);
        pending = form4List(subs, yearsAgo(now, HISTORY_YEARS), h.kind === "owner" ? OWNER_MAX_FILINGS : ISSUER_MAX_FILINGS);
        completeSince = pending.length ? null : new Date(now).toISOString().slice(0, 10);
        await db.update(secHistory).set({ pending, completeSince, name: h.name ?? (typeof subs.name === "string" ? subs.name : null), updatedAt: new Date(now) }).where(where);
      } catch { errors++; continue; }
    }
    while (pending.length && read < budget) {
      const f = pending[0]!;
      try {
        const base = `https://www.sec.gov/Archives/edgar/data/${Number(h.cik)}/${f.accession}/`;
        const got = await readOwnership(sec, base);
        if (got) await saveTrades(db, tradeRows(got.ownership, f.accession, got.filedAt ?? Date.parse(`${f.filedOn}T21:00:00Z`), filingIndexUrl(h.cik, f.accession)));
      } catch { errors++; break; } // retried next run; the history stays incomplete until it is read
      read++;
      pending = pending.slice(1);
      completeSince = f.filedOn;
      await db.update(secHistory).set({ pending, completeSince: pending.length ? null : completeSince, updatedAt: new Date(now) }).where(where);
    }
    if (!pending.length) {
      await db.update(secHistory).set({ completeSince: completeSince ?? new Date(now).toISOString().slice(0, 10), updatedAt: new Date(now) }).where(where);
      done++;
    }
  }
  return { read, done, errors };
}

/** When each history is complete from (null while still being read). */
export async function historyCoverage(db: Db, kind: "owner" | "issuer", ciks: readonly string[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(ciks.map(c => String(Number(c))))];
  if (!ids.length) return new Map();
  const rs = await db.select({ cik: secHistory.cik, since: secHistory.completeSince, pending: secHistory.pending }).from(secHistory)
    .where(and(eq(secHistory.kind, kind), inArray(secHistory.cik, ids)));
  return new Map(rs.map(r => [r.cik, r.pending.length ? null : r.since]));
}

/* ---------- funds ---------- */

/** One fund: its name, how many 13F-HR quarters EDGAR lists, and one more of its last FUND_QUARTERS filings read in full. */
export async function fundHistoryOnce(db: Db, sec: SecClient, cik: string, now: number,
  read: (cik: string, f: ReturnType<typeof thirteenFFilings>[number]) => Promise<Map<string, { issuerName: string; cusip: string; shares: number; value: number }> | null>): Promise<number> {
  const id = cik10(cik);
  if (!id) return 0;
  const subs = await sec.json<{ name?: string }>(`https://data.sec.gov/submissions/CIK${id}.json`);
  const all = thirteenFFilings(subs, 4000);
  const short = String(Number(id));
  const name = companyName(typeof subs.name === "string" ? subs.name : "A fund");
  await db.insert(funds).values({ cik: short, name, quartersOnFile: all.length, updatedAt: new Date(now) })
    .onConflictDoUpdate({ target: funds.cik, set: { name, quartersOnFile: all.length, updatedAt: new Date(now) } });
  const recent = all.slice(0, FUND_QUARTERS);
  if (!recent.length) return 0;
  const have = new Set((await db.select({ a: fundFilings.accession }).from(fundFilings).where(eq(fundFilings.fundCik, short))).map(r => r.a));
  const next = recent.find(f => !have.has(f.accession));
  if (!next) return 0;
  const pos = await read(id, next);
  if (!pos) {
    // Incomplete or a notice: recorded with no holdings so it isn't read again, and never compared.
    await db.insert(fundFilings).values({ fundCik: short, accession: next.accession, period: next.period, filedOn: next.filedAt, url: filingIndex13f(id, next), complete: false }).onConflictDoNothing();
    return 0;
  }
  await db.transaction(async tx => {
    await tx.insert(fundFilings).values({ fundCik: short, accession: next.accession, period: next.period, filedOn: next.filedAt, url: filingIndex13f(id, next), complete: true }).onConflictDoNothing();
    const list = [...pos.values()].map(p => ({ fundCik: short, accession: next.accession, cusip: p.cusip, company: companyName(p.issuerName), shares: p.shares, value: Math.round(p.value) }));
    for (let i = 0; i < list.length; i += 500) await tx.insert(fundHoldings).values(list.slice(i, i + 500)).onConflictDoNothing();
  });
  return 1;
}
