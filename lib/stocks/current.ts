/* The live feed for the forms watchlists alert on besides Forms 3, 4 and 5 (docs/INSIDIR-V3.md §3): 8-K, 10-Q, 10-K and
 * Schedules 13D and 13G, from EDGAR's current-filings Atom feed, one page of each every CURRENT_MS. Each entry names
 * its party's role in the title ("8-K - Rallybio Corp (0001739410) (Filer)"; a Schedule 13D has a "(Subject)" entry
 * for the company and a "(Filed by)" entry for the holder): the company is the Filer or the Subject. Stored in
 * company_filings with EDGAR's own acceptance time, so an alert's latency can be measured from it. A new 10-K or 10-Q
 * also asks for the company's financials to be read again. */
import { XMLParser } from "fast-xml-parser";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { companyFilings } from "@/lib/db/schema";
import { filingIndex, wantCompanies } from "./company";
import type { SecClient } from "./sec";

const n = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
export const CURRENT_MS = n("SEC_CURRENT_MS", 2 * 60_000);
/** The feed's `type` values and the forms each may return (the feed matches by prefix). */
export const CURRENT_FEEDS: ReadonlyArray<{ type: string; forms: readonly string[] }> = [
  { type: "8-K", forms: ["8-K", "8-K/A"] },
  { type: "10-Q", forms: ["10-Q", "10-Q/A"] },
  { type: "10-K", forms: ["10-K", "10-K/A", "10-KT", "10-KT/A"] },
  { type: "SCHEDULE 13D", forms: ["SCHEDULE 13D", "SCHEDULE 13D/A"] },
  { type: "SCHEDULE 13G", forms: ["SCHEDULE 13G", "SCHEDULE 13G/A"] },
];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, trimValues: true });
type Node = Record<string, unknown>;
const list = <T,>(v: unknown): T[] => (v == null ? [] : Array.isArray(v) ? (v as T[]) : [v as T]);
const text = (v: unknown): string => (v && typeof v === "object" ? String((v as Node)["#text"] ?? "") : String(v ?? "")).trim();

export interface CurrentEntry { accession: string; cik: string; form: string; role: string; name: string; acceptedAt: number | null }

/** One feed page → the company entries (Filer or Subject) of the forms asked for, once per accession. Pure. */
export function parseCurrent(xml: string, forms: readonly string[]): CurrentEntry[] {
  const feed = (parser.parse(xml) as Node)?.feed as Node | undefined;
  if (!feed) throw new Error("Invalid SEC Atom feed");
  const out = new Map<string, CurrentEntry>();
  for (const e of list<Node>(feed.entry)) {
    const m = /^(.+?) - (.+) \((\d{10})\) \(([^)]+)\)\s*$/.exec(text(e.title));
    if (!m) continue;
    const [, form, name, cik, role] = m as unknown as [string, string, string, string, string];
    if (!forms.includes(form) || !["Filer", "Subject"].includes(role)) continue;
    const href = list<Node>(e.link).map(l => String(l?.["@_href"] ?? "")).find(h => h.includes("/Archives/edgar/data/")) ?? "";
    const a = /\/Archives\/edgar\/data\/\d+\/(\d{18})\//.exec(href);
    if (!a || out.has(a[1]!)) continue;
    const updated = text(e.updated);
    out.set(a[1]!, { accession: a[1]!, cik: String(Number(cik)), form, role, name, acceptedAt: Number.isNaN(Date.parse(updated)) ? null : Date.parse(updated) });
  }
  return [...out.values()];
}

const url = (type: string) => `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(type).replace(/%20/g, "+")}&output=atom&count=100`;
const etDay = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));

/** One run: a page of each feed; new filings into company_filings. */
export async function currentOnce(db: Db, sec: SecClient, now: number, watched: (ciks: string[]) => Promise<Set<string>> = async () => new Set()): Promise<{ seen: number; added: number; errors: number }> {
  let seen = 0, added = 0, errors = 0;
  for (const f of CURRENT_FEEDS) {
    try {
      const entries = parseCurrent(await sec.text(url(f.type)), f.forms);
      seen += entries.length;
      if (!entries.length) continue;
      const rows = entries.map(e => ({ accession: e.accession, cik: e.cik, form: e.form, filedOn: etDay(e.acceptedAt ?? now), acceptedAt: e.acceptedAt ? new Date(e.acceptedAt) : null,
        url: filingIndex(e.cik, e.accession), seenAt: new Date(now) }));
      const fresh = await db.insert(companyFilings).values(rows).onConflictDoNothing().returning({ accession: companyFilings.accession, cik: companyFilings.cik, form: companyFilings.form });
      added += fresh.length;
      // Financials after a 10-K or 10-Q; anything new from a watched company, so its row (8-K items) fills in.
      const w = await watched(fresh.map(r => r.cik));
      const want = fresh.filter(r => /^10-[KQ]/.test(r.form) || w.has(r.cik)).map(r => r.cik);
      if (want.length) await wantCompanies(db, want, now);
    } catch { errors++; }
  }
  return { seen, added, errors };
}

/** CIKs of companies on any watchlist. */
export async function watchedCompanies(db: Db, ciks: string[]): Promise<Set<string>> {
  if (!ciks.length) return new Set();
  const r = await db.execute(sql`select distinct cik from terminal.sec_watchlist_items where kind = 'company' and cik in (${sql.join(ciks.map(c => sql`${c}`), sql`, `)})`);
  return new Set((r.rows as Array<{ cik: string }>).map(x => x.cik));
}
