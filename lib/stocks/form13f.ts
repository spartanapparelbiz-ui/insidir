/* Form 13F big-fund adds for the Stocks tab, ported from the stock engine (src/form13f.mjs on
 * codex/social-stock-funnel). A 13F is a quarterly report by an institutional manager of certain long US positions
 * as of quarter end, filed up to 45 days later: not a trade feed, no shorts, no cash, possible confidential
 * omissions. A card compares one fund's latest 13F-HR with its previous one, per CUSIP (share positions only, no
 * options):
 *   added shares × this quarter's reported value per share ≥ FUND_ADD_MIN ($25M by default), a new position counting
 *   in full. Values are dollars for filings made on or after 2023-01-03 and thousands before. */
import { XMLParser } from "fast-xml-parser";
import { companyName } from "./form4";

export const FUND_ADD_MIN = 25_000_000;
export const DOLLAR_VALUES_FROM = "2023-01-03";

const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true, processEntities: true });
type Node = Record<string, unknown>;
const list = <T = unknown>(v: unknown): T[] => (v == null ? [] : Array.isArray(v) ? (v as T[]) : [v as T]);
const text = (v: unknown): string | null => (v == null ? null : typeof v === "object" ? text((v as Node)["#text"]) : String(v).trim() || null);
const number = (v: unknown): number | null => { const s = text(v)?.replace(/,/g, ""); if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
export const cik10 = (c: string | number): string | null => { const b = String(c ?? "").trim().replace(/^0+/, ""); return /^\d{1,10}$/.test(b) ? b.padStart(10, "0") : null; };

/** Funds to follow (CIKs only; the name shown is EDGAR's). INSIDIR_13F_MANAGER_CIKS overrides, at most 25. */
export const DEFAULT_MANAGER_CIKS = ["0001067983", "0001336528", "0001649339", "0001061768", "0001350694", "0001656456"] as const;
export function managerCiks(env: Record<string, string | undefined> = process.env): string[] {
  const raw = (env.INSIDIR_13F_MANAGER_CIKS ?? "").trim();
  return [...new Set((raw ? raw.split(/[,\s]+/) : [...DEFAULT_MANAGER_CIKS]).map(cik10).filter((c): c is string => Boolean(c)))].slice(0, 25);
}

export interface ThirteenF { form: string; accession: string; accessionDashed: string; filedAt: string; acceptedAt: number | null; period: string | null }

/** The 13F-HR filings (originals only: an amendment may restate or only add rows) in a manager's submissions, newest first. */
export function thirteenFFilings(submissions: unknown, limit = 4): ThirteenF[] {
  const r = ((submissions as Node | null)?.filings as Node | undefined)?.recent as Record<string, unknown[]> | undefined;
  if (!r || !Array.isArray(r.form)) return [];
  const out: ThirteenF[] = [];
  for (let i = 0; i < Math.min(r.form.length, 4000) && out.length < limit; i++) {
    if (String(r.form[i]) !== "13F-HR") continue;
    const acc = String(r.accessionNumber?.[i] ?? ""), filed = String(r.filingDate?.[i] ?? ""), period = String(r.reportDate?.[i] ?? "");
    if (!/^\d{10}-\d{2}-\d{6}$/.test(acc) || !/^\d{4}-\d{2}-\d{2}$/.test(filed)) continue;
    const accepted = String(r.acceptanceDateTime?.[i] ?? "");
    out.push({ form: "13F-HR", accession: acc.replace(/-/g, ""), accessionDashed: acc, filedAt: filed,
      acceptedAt: accepted && !Number.isNaN(Date.parse(accepted)) ? Date.parse(accepted) : null, period: /^\d{4}-\d{2}-\d{2}$/.test(period) ? period : null });
  }
  return out;
}

export interface Cover { period: string | null; reportType: string | null; managerName: string | null; tableEntryTotal: number | null; tableValueTotal: number | null; confidentialOmitted: boolean }
const mdy = (v: unknown): string | null => { const s = text(v); const m = s ? /^(\d{2})-(\d{2})-(\d{4})$/.exec(s) : null; return m ? `${m[3]}-${m[1]}-${m[2]}` : s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

export function parsePrimaryDoc(body: string): Cover {
  const root = (xml.parse(body) as Node)?.edgarSubmission as Node | undefined;
  if (!root) throw new Error("Not a 13F primary document");
  const form = (root.formData ?? {}) as Node, cover = (form.coverPage ?? {}) as Node, summary = (form.summaryPage ?? {}) as Node;
  return {
    period: mdy(((root.headerData as Node | undefined)?.filerInfo as Node | undefined)?.periodOfReport) ?? mdy(cover.reportCalendarOrQuarter),
    reportType: text(cover.reportType), managerName: text((cover.filingManager as Node | undefined)?.name),
    tableEntryTotal: number(summary.tableEntryTotal), tableValueTotal: number(summary.tableValueTotal),
    confidentialOmitted: /^(true|y|1)$/i.test(text(summary.isConfidentialOmitted) ?? ""),
  };
}

export interface Holding { issuerName: string; cusip: string; value: number; shares: number | null; shareType: string | null; putCall: string | null }
export function parseInfoTable(body: string): Holding[] {
  const root = (xml.parse(body) as Node)?.informationTable as Node | undefined;
  if (!root) throw new Error("Not a 13F information table");
  const rows: Holding[] = [];
  for (const r of list<Node>(root.infoTable)) {
    const cusip = (text(r.cusip) ?? "").toUpperCase(), value = number(r.value);
    if (!/^[0-9A-Z]{9}$/.test(cusip) || value === null) continue;
    const amt = (r.shrsOrPrnAmt ?? {}) as Node;
    rows.push({ issuerName: (text(r.nameOfIssuer) ?? "Unnamed issuer").slice(0, 200), cusip, value, shares: number(amt.sshPrnamt),
      shareType: text(amt.sshPrnamtType)?.toUpperCase() ?? null, putCall: text(r.putCall)?.toUpperCase() ?? null });
  }
  return rows;
}

/** primary_doc.xml and the likeliest information-table XMLs from a filing's index.json. */
export function pickDocuments(index: unknown): { primary: string | null; tables: string[] } {
  const items = list<Node>(((index as Node | null)?.directory as Node | undefined)?.item).map(x => String(x?.name ?? "")).filter(n => /^[A-Za-z0-9_.-]{1,120}\.xml$/i.test(n));
  const primary = items.find(n => /^primary_doc\.xml$/i.test(n)) ?? null;
  return { primary, tables: items.filter(n => n !== primary).sort((a, b) => Number(/info/i.test(b)) - Number(/info/i.test(a))).slice(0, 4) };
}

export interface Position { issuerName: string; cusip: string; shares: number; value: number }
/** Share positions per CUSIP (options and principal amounts left out), values in dollars. */
export function positions(rows: readonly Holding[], filedAt: string): Map<string, Position> {
  const scale = filedAt >= DOLLAR_VALUES_FROM ? 1 : 1000;
  const out = new Map<string, Position>();
  for (const r of rows) {
    if (r.putCall || (r.shareType && r.shareType !== "SH") || r.shares === null || r.shares <= 0) continue;
    const p = out.get(r.cusip) ?? { issuerName: r.issuerName, cusip: r.cusip, shares: 0, value: 0 };
    p.shares += r.shares; p.value += r.value * scale;
    out.set(r.cusip, p);
  }
  return out;
}

/** True when the parsed rows add up to the cover page's own totals (count, and value within 0.1%). */
export function complete(cover: Cover, rows: readonly Holding[]): boolean {
  if (cover.tableEntryTotal === null || cover.tableValueTotal === null) return false;
  const parsed = rows.reduce((s, r) => s + r.value, 0);
  return cover.tableEntryTotal === rows.length && Math.abs(cover.tableValueTotal - parsed) <= Math.max(rows.length, Math.abs(cover.tableValueTotal) * 0.001);
}

export interface FundAdd {
  cusip: string; issuerName: string; company: string; added: number; addedShares: number; newPosition: boolean;
  prevShares: number; curShares: number; curValue: number; pricePerShare: number;
}

/** What the fund added this quarter versus the previous filing, biggest first. */
export function fundAdds(prev: ReadonlyMap<string, Position>, cur: ReadonlyMap<string, Position>, min = FUND_ADD_MIN): FundAdd[] {
  const out: FundAdd[] = [];
  for (const p of cur.values()) {
    const before = prev.get(p.cusip)?.shares ?? 0;
    const addedShares = p.shares - before;
    if (addedShares <= 0 || p.shares <= 0) continue;
    const pricePerShare = p.value / p.shares;
    const added = Math.round(addedShares * pricePerShare);
    if (added < min) continue;
    out.push({ cusip: p.cusip, issuerName: p.issuerName, company: companyName(p.issuerName), added, addedShares, newPosition: before === 0,
      prevShares: before, curShares: p.shares, curValue: p.value, pricePerShare });
  }
  return out.sort((a, b) => b.added - a.added);
}

export const filingIndex13f = (cik: string, f: ThirteenF): string => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accession}/${f.accessionDashed}-index.htm`;
