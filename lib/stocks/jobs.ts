/* The Stocks jobs (worker): Form 4 insider buys every STOCKS_FORM4_MS (2 min) and 13F fund adds every 6 hours.
 * Each SEC filing is read once (terminal.sec_seen). Requests go through one SecClient: SEC_USER_AGENT, under 10 a
 * second. Nothing runs without SEC_USER_AGENT. Congress trades (house disclosures) are not part of this. */
import { inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { secSeen } from "@/lib/db/schema";
import { upsertMoves } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";
import { companyName, filingIndexUrl, indexTimestamp, insiderBuy, ownershipCandidates, parseAtom, parseOwnership, type AtomFiling } from "./form4";
import { cik10, complete, filingIndex13f, fundAdds, managerCiks, parseInfoTable, parsePrimaryDoc, pickDocuments, positions, thirteenFFilings, type Position, type ThirteenF } from "./form13f";
import { fundMove, insiderMove } from "./moves";
import type { SecClient } from "./sec";

const n = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
export const STOCKS_FORM4_MS = n("STOCKS_FORM4_MS", 2 * 60_000);
export const STOCKS_13F_MS = n("STOCKS_13F_MS", 6 * 3_600_000);
/** At most this many new Form 4 filings read per run (two requests each); the rest wait for the next run. */
export const FORM4_PER_RUN = 150;
export const FORM4_PAGES = 5;
/** At most this many cards per 13F filing (biggest adds first). */
export const FUND_ADDS_PER_FILING = 15;

export const stocksIngestOn = (env: Record<string, string | undefined> = process.env): boolean => (env.STOCKS_INGEST ?? "1") !== "0";

async function seen(db: Db, keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  return new Set((await db.select({ key: secSeen.key }).from(secSeen).where(inArray(secSeen.key, keys))).map(r => r.key));
}
const markSeen = (db: Db, key: string) => db.insert(secSeen).values({ key }).onConflictDoNothing();

const atomUrl = (start: number) => `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&output=atom&count=100${start ? `&start=${start}` : ""}`;

/** One Form 4 filing → its insider-buy move, or null when it has none of $100k+. */
export async function readForm4(sec: SecClient, f: AtomFiling): Promise<Move | null> {
  const index = await sec.json(`${f.indexBase}index.json`);
  const filedAt = f.publishedAt ?? indexTimestamp(index) ?? Date.now();
  for (const name of ownershipCandidates(index)) {
    const body = await sec.text(f.indexBase + name);
    if (!body.includes("ownershipDocument")) continue;
    let o;
    try { o = parseOwnership(body); } catch { continue; }
    const buy = insiderBuy(o, f.accession);
    if (!buy) return null;
    const lines = o.lines.filter(l => !l.derivative && l.code === "P" && l.acquiredDisposed === "A").length;
    return insiderMove(buy, filedAt, lines, filingIndexUrl(f.filerCik, f.accession));
  }
  throw new Error(`No ownership XML in ${f.accession}`);
}

/** Pages back through the current-filings feed until a page holds nothing new, then reads the new filings. */
export async function form4Once(db: Db, sec: SecClient): Promise<{ read: number; moves: number; errors: number }> {
  const fresh: AtomFiling[] = [];
  const queued = new Set<string>();
  for (let page = 0; page < FORM4_PAGES && fresh.length < FORM4_PER_RUN; page++) {
    const batch = parseAtom(await sec.text(atomUrl(page * 100))).filter(f => !queued.has(f.accession));
    if (!batch.length) break;
    const known = await seen(db, batch.map(f => `f4:${f.accession}`));
    const unknown = batch.filter(f => !known.has(`f4:${f.accession}`));
    for (const f of unknown) { queued.add(f.accession); fresh.push(f); }
    if (!unknown.length) break;
  }
  let read = 0, errors = 0;
  const out: Move[] = [];
  for (const f of fresh.slice(0, FORM4_PER_RUN)) {
    try {
      // 4/A restates an earlier filing: recorded, never shown.
      const m = f.formType === "4" ? await readForm4(sec, f) : null;
      if (m) out.push(m);
      await markSeen(db, `f4:${f.accession}`);
      read++;
    } catch { errors++; }
  }
  if (out.length) await upsertMoves(db, out);
  return { read, moves: out.length, errors };
}

export async function thirteenFPositions(sec: SecClient, cik: string, f: ThirteenF): Promise<Map<string, Position> | null> {
  const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accession}/`;
  const docs = pickDocuments(await sec.json(`${base}index.json`));
  if (!docs.primary) return null;
  const cover = parsePrimaryDoc(await sec.text(base + docs.primary));
  if (/NOTICE/i.test(cover.reportType ?? "")) return null;
  for (const name of docs.tables) {
    const body = await sec.text(base + name);
    if (!/informationTable/.test(body)) continue;
    const rows = parseInfoTable(body);
    // Only a table that adds up to the cover page's own totals is compared: a partial read would invent adds.
    return complete(cover, rows) ? positions(rows, f.filedAt) : null;
  }
  return null;
}

/** One fund: its latest 13F-HR against the one before, once per filing. */
export async function fundOnce(db: Db, sec: SecClient, cik: string): Promise<number> {
  const id = cik10(cik);
  if (!id) return 0;
  const subs = await sec.json<{ name?: string }>(`https://data.sec.gov/submissions/CIK${id}.json`);
  const [cur, prev] = thirteenFFilings(subs, 2);
  if (!cur || !prev) return 0;
  const key = `13f:${cur.accession}`;
  if ((await seen(db, [key])).size) return 0;
  const [a, b] = [await thirteenFPositions(sec, id, cur), await thirteenFPositions(sec, id, prev)];
  if (!a || !b) { await markSeen(db, key); return 0; }
  const fund = companyName(typeof subs.name === "string" ? subs.name : "A fund");
  const list = fundAdds(b, a).slice(0, FUND_ADDS_PER_FILING).map(x => fundMove(x, fund, id, cur, prev, filingIndex13f(id, cur)));
  if (list.length) await upsertMoves(db, list);
  await markSeen(db, key);
  return list.length;
}

export async function form13fOnce(db: Db, sec: SecClient, env: Record<string, string | undefined> = process.env): Promise<{ funds: number; moves: number; errors: number }> {
  let moves = 0, errors = 0;
  const ciks = managerCiks(env);
  for (const cik of ciks) {
    try { moves += await fundOnce(db, sec, cik); } catch { errors++; }
  }
  return { funds: ciks.length, moves, errors };
}
