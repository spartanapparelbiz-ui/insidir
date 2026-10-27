/* SEC Form 4 insider buys for the Stocks tab, ported from the stock engine (src/sec.mjs, src/insiders.mjs on
 * codex/social-stock-funnel). Pure parsing and the rule for what becomes a card:
 *   an open-market purchase (transaction code P, acquired) of common stock (non-derivative lines), summed per filing,
 *   of INSIDER_BUY_MIN ($100,000) or more, at the price the filer reported. Amendments (4/A) are skipped: they
 *   restate a filing already shown. Values are shares × reported price, exact to the cent; nothing is estimated. */
import { XMLParser } from "fast-xml-parser";

export const INSIDER_BUY_MIN = 100_000;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, parseAttributeValue: false, trimValues: true, processEntities: true });
type Node = Record<string, unknown>;
const list = <T = unknown>(v: unknown): T[] => (v == null ? [] : Array.isArray(v) ? (v as T[]) : [v as T]);
const scalar = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "object") return scalar((v as Node)["#text"] ?? (v as Node).value);
  return String(v).trim() || null;
};
const val = (v: unknown): string | null => scalar((v as Node | null)?.value ?? v);
const flag = (v: unknown): boolean => /^(1|true)$/i.test(val(v) ?? "");
const decimalText = (v: unknown): string | null => { const s = val(v); return s && /^-?\d+(\.\d+)?$/.test(s) ? s : null; };
const num = (v: unknown): number | null => { const s = decimalText(v); if (s === null) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

/** shares × price exactly (BigInt over the filed decimal text), rounded half up to the cent; null when either is missing or the price isn't positive. */
export function filedValue(sharesText: string | null, priceText: string | null): number | null {
  if (sharesText == null || priceText == null) return null;
  const parse = (t: string) => { const [i, f = ""] = t.split("."); return { n: BigInt(i + f), d: f.length }; };
  const a = parse(sharesText), b = parse(priceText);
  if (a.n < 0n || b.n <= 0n) return null;
  const scale = a.d + b.d, product = a.n * b.n;
  if (scale <= 2) return Number(product * 10n ** BigInt(2 - scale)) / 100;
  const div = 10n ** BigInt(scale - 2);
  return Number((product + div / 2n) / div) / 100;
}

/** "2026-10-14", "2026-10-14-05:00", "2026-10-14Z" → "2026-10-14". */
export function xmlDate(v: unknown): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?:Z|[+-]\d{2}:\d{2})?$/.exec(String(v ?? "").trim());
  return m && !Number.isNaN(Date.parse(m[1]!)) ? m[1]! : null;
}

/** EDGAR's Eastern-time stamp ("2026-10-15 15:22:00") as epoch ms. */
export function easternToMs(text: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as [number, number, number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(guess)).map(x => [x.type, x.value]));
  const asNy = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!);
  return guess + (guess - asNy);
}

export interface AtomFiling { accession: string; filerCik: string; indexBase: string; sourceUrl: string; formType: string; publishedAt: number | null }

/** The current-filings Atom feed (getcurrent&type=4), Form 4 and 4/A only, once per accession. */
export function parseAtom(xml: string): AtomFiling[] {
  const feed = (parser.parse(xml) as Node)?.feed as Node | undefined;
  if (!feed) throw new Error("Invalid SEC Atom feed");
  const seen = new Set<string>(), out: AtomFiling[] = [];
  for (const entry of list<Node>(feed.entry)) {
    const title = scalar(entry.title) ?? "";
    // getcurrent&type=4 is a prefix search (424B prospectuses too): keep only real Form 4s.
    const type = (scalar(entry["filing-type"]) ?? /^\s*([A-Z0-9][A-Z0-9 /]*?)\s+[-:–—]\s/i.exec(title)?.[1] ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    if (type !== "4" && type !== "4/A") continue;
    const href = list<Node>(entry.link).map(l => String(l?.["@_href"] ?? "")).find(h => h.includes("/Archives/edgar/data/"));
    if (!href) continue;
    let url: URL;
    try { url = new URL(href, "https://www.sec.gov"); } catch { continue; }
    if (url.protocol !== "https:" || url.hostname !== "www.sec.gov") continue;
    const m = /^\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//.exec(url.pathname);
    if (!m || seen.has(m[2]!)) continue;
    seen.add(m[2]!);
    const updated = scalar(entry.updated) ?? scalar(entry.published);
    out.push({ accession: m[2]!, filerCik: m[1]!, indexBase: `https://www.sec.gov/Archives/edgar/data/${m[1]}/${m[2]}/`, sourceUrl: url.toString(), formType: type,
      publishedAt: updated && !Number.isNaN(Date.parse(updated)) ? Date.parse(updated) : null });
  }
  return out;
}

export interface Owner { cik: string | null; name: string; isDirector: boolean; isOfficer: boolean; isTenPercentOwner: boolean; officerTitle: string | null; otherText: string | null }
export interface Line { code: string | null; acquiredDisposed: string | null; derivative: boolean; date: string | null; shares: number | null; price: number | null; value: number | null; security: string | null }
export interface Ownership { issuerCik: string; issuerName: string; ticker: string | null; documentType: string; owners: Owner[]; lines: Line[] }

export function parseOwnership(xml: string): Ownership {
  const root = (parser.parse(xml) as Node)?.ownershipDocument as Node | undefined;
  if (!root || !root.issuer) throw new Error("Not a valid ownershipDocument");
  const issuer = root.issuer as Node;
  const issuerCik = scalar(issuer.issuerCik);
  if (!/^\d{1,10}$/.test(issuerCik ?? "")) throw new Error("Missing issuer CIK");
  const owners: Owner[] = list<Node>(root.reportingOwner).map(o => {
    const id = (o?.reportingOwnerId ?? {}) as Node, rel = (o?.reportingOwnerRelationship ?? {}) as Node;
    return { cik: scalar(id.rptOwnerCik), name: scalar(id.rptOwnerName) ?? "Reporting owner", isDirector: flag(rel.isDirector), isOfficer: flag(rel.isOfficer),
      isTenPercentOwner: flag(rel.isTenPercentOwner), officerTitle: scalar(rel.officerTitle), otherText: scalar(rel.otherText) };
  });
  const lines: Line[] = [];
  for (const [derivative, key, table] of [[false, "nonDerivativeTransaction", root.nonDerivativeTable], [true, "derivativeTransaction", root.derivativeTable]] as const) {
    for (const t of list<Node>((table as Node | undefined)?.[key])) {
      const amounts = (t?.transactionAmounts ?? {}) as Node;
      lines.push({
        code: val((t?.transactionCoding as Node | undefined)?.transactionCode)?.toUpperCase() ?? null,
        acquiredDisposed: val(amounts.transactionAcquiredDisposedCode)?.toUpperCase() ?? null,
        derivative, date: xmlDate(val(t?.transactionDate)), security: val(t?.securityTitle),
        shares: num(amounts.transactionShares), price: num(amounts.transactionPricePerShare),
        value: filedValue(decimalText(amounts.transactionShares), decimalText(amounts.transactionPricePerShare)),
      });
    }
  }
  return { issuerCik: issuerCik!, issuerName: scalar(issuer.issuerName) ?? "Unknown issuer", ticker: scalar(issuer.issuerTradingSymbol)?.toUpperCase() ?? null,
    documentType: val(root.documentType) ?? "4", owners, lines };
}

/** The XML documents of a filing's index.json worth trying, likeliest first. */
export function ownershipCandidates(index: unknown): string[] {
  const items = list<Node>(((index as Node | null)?.directory as Node | undefined)?.item);
  return items.map(i => String(i?.name ?? "")).filter(n => /^[a-zA-Z0-9_.-]+\.xml$/i.test(n) && !/^(FilingSummary|Financial_Report|MetaLinks|xsl)/i.test(n))
    .sort((a, b) => Number(!/^(primary_doc|ownership|form4|wk-form4|doc4)/i.test(a)) - Number(!/^(primary_doc|ownership|form4|wk-form4|doc4)/i.test(b))).slice(0, 6);
}
/** When the filing reached EDGAR: the index page's last-modified stamp (Eastern time). */
export function indexTimestamp(index: unknown): number | null {
  const items = list<Node>(((index as Node | null)?.directory as Node | undefined)?.item);
  const stamp = items.find(i => /-index\.html?$/i.test(String(i?.name ?? "")))?.["last-modified"] ?? items[0]?.["last-modified"];
  return easternToMs(stamp as string | undefined);
}

/* ---------- what the card says ---------- */

const CHIEF: Array<[RegExp, string]> = [
  [/\b(chief executive|ceo)\b/i, "CEO"], [/\b(chief financial|cfo)\b/i, "CFO"], [/\b(chief operating|coo)\b/i, "COO"],
  [/\bexecutive chair(man|woman|person)?\b/i, "Executive Chair"], [/\bchair(man|woman|person)?\b/i, "Chair"], [/\bpresident\b/i, "President"],
];

/** "The CEO", "A director", "An executive", "A 10% owner": the filed relationship, never the person's name. */
export function roleWord(o: Owner | undefined): string {
  if (!o) return "An insider";
  const title = `${o.officerTitle ?? ""} ${o.otherText ?? ""}`;
  for (const [re, word] of CHIEF) if (re.test(title) && !/\bvice\b/i.test(title)) return `The ${word}`;
  if (o.isOfficer) return "An executive";
  if (o.isDirector) return "A director";
  if (o.isTenPercentOwner) return "A 10% owner";
  return "An insider";
}

const SUFFIX = /[\s,]+(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|lp|l\.p|n\.v|s\.a|ag|se|holdings?|\/[a-z]{2}\/?)\.?$/i;
const KEEP_UPPER = /^(?:[A-Z]{1,3}|[A-Z]+&[A-Z]+|[A-Z]\.[A-Z.]+)$/;
/** "NVIDIA CORP" → "Nvidia", "Apple Inc." → "Apple", "AT&T INC." → "AT&T", "JPMORGAN CHASE & CO" → "Jpmorgan Chase". */
/** 13F issuer names carry share-class and listing notes: "CHEVRON CORP NEW", "ALPHABET INC CAP STK CL A". */
const NOISE = /[\s,]+(new|del|com|cap stk|class [a-c]|cl [a-c]|ord|shs|sponsored adr|adr)\.?$/i;
export function companyName(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 5 && (SUFFIX.test(s) || NOISE.test(s)); i++) s = s.replace(NOISE, "").replace(SUFFIX, "").replace(/[\s,&]+$/, "").trim();
  if (!s) return raw.trim();
  if (/[a-z]/.test(s)) return s;
  return s.split(" ").map(w => (KEEP_UPPER.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");
}

export interface InsiderBuy {
  accession: string; issuerCik: string; issuerName: string; company: string; ticker: string | null;
  role: string; ownerName: string; ownerCik: string | null;
  amount: number; shares: number; avgPrice: number; firstDate: string | null; lastDate: string | null;
}

/** The filing's open-market buys summed, when they reach the minimum; null otherwise. */
export function insiderBuy(o: Ownership, accession: string, min = INSIDER_BUY_MIN): InsiderBuy | null {
  if (/\/A$/i.test(o.documentType)) return null;
  const buys = o.lines.filter(l => !l.derivative && l.code === "P" && l.acquiredDisposed === "A" && l.value !== null && l.shares !== null && l.shares > 0);
  const amount = Math.round(buys.reduce((s, l) => s + l.value!, 0) * 100) / 100;
  if (!buys.length || amount < min) return null;
  const shares = buys.reduce((s, l) => s + l.shares!, 0);
  const dates = buys.map(l => l.date).filter((d): d is string => Boolean(d)).sort();
  const owner = o.owners[0];
  return {
    accession, issuerCik: o.issuerCik, issuerName: o.issuerName, company: companyName(o.issuerName), ticker: o.ticker,
    role: roleWord(owner), ownerName: owner?.name ?? "Reporting owner", ownerCik: owner?.cik ?? null,
    amount, shares, avgPrice: Math.round((amount / shares) * 10_000) / 10_000, firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null,
  };
}

/** The filing's index page on EDGAR (what "See the SEC filing" opens). */
export const filingIndexUrl = (cik: string, accession18: string): string =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession18}/${accession18.slice(0, 10)}-${accession18.slice(10, 12)}-${accession18.slice(12)}-index.htm`;
