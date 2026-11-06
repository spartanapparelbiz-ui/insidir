/* Parsing for the filings poller (lib/filings/ingest.ts). Pure: no network, no database.
 *
 * 8-K: everything a card needs is in the EDGAR current-filings Atom entry (form, company, CIK, accession, acceptance
 * time and the item lines in its summary), so an 8-K costs zero requests beyond the feed itself.
 * Form 4: the ownership XML is read by lib/stocks/history.ts readOwnership; here it is cut down to the compact payload
 * that is stored once and sent to every member. */
import { XMLParser } from "fast-xml-parser";
import type { Owner, Ownership } from "@/lib/stocks/form4";
import type { FiledLine, Form4Payload, FormType } from "./types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, trimValues: true, processEntities: true });
type Node = Record<string, unknown>;
const list = <T = unknown>(v: unknown): T[] => (v == null ? [] : Array.isArray(v) ? (v as T[]) : [v as T]);
const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") return text((v as Node)["#text"]);
  return String(v).trim();
};

/** "YYYY-MM-DD" in New York for an instant. */
export function easternDate(ms: number): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** The decimal item numbers listed in an 8-K summary ("Item 2.02: Results…<br>Item 9.01: …"), in order, once each. */
export function eightKItems(summary: string): string[] {
  const out: string[] = [];
  for (const m of summary.replace(/<[^>]*>/g, " ").matchAll(/\bItem\s+(\d{1,2}\.\d{2})\b/gi)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

export interface EightKEntry { accession: string; cik: string; company: string; form: Extract<FormType, "8-K" | "8-K/A">; acceptedAt: number; filedOn: string; url: string; items: string[] }

/** The current-filings Atom feed for type=8-K: 8-K and 8-K/A only (the type filter is a prefix match), once per
 *  accession, only entries pointing at an EDGAR archive path on www.sec.gov. */
export function parse8kAtom(xml: string): EightKEntry[] {
  const feed = (parser.parse(xml) as Node)?.feed as Node | undefined;
  if (!feed) throw new Error("Invalid SEC Atom feed");
  const seen = new Set<string>(), out: EightKEntry[] = [];
  for (const entry of list<Node>(feed.entry)) {
    const title = text(entry.title);
    const term = list<Node>(entry.category).map(c => String(c?.["@_term"] ?? "")).find(Boolean) ?? "";
    const t = /^\s*(8-K(?:\/A)?)\s+-\s+(.+?)\s+\((\d{1,10})\)\s+\(([^)]+)\)\s*$/i.exec(title);
    const form = (term || t?.[1] || "").toUpperCase();
    if (form !== "8-K" && form !== "8-K/A") continue;
    const href = list<Node>(entry.link).map(l => String(l?.["@_href"] ?? "")).find(h => h.includes("/Archives/edgar/data/"));
    if (!href || !t) continue;
    let url: URL;
    try { url = new URL(href, "https://www.sec.gov"); } catch { continue; }
    if (url.protocol !== "https:" || url.hostname !== "www.sec.gov") continue;
    const m = /^\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//.exec(url.pathname);
    if (!m || seen.has(m[2]!)) continue;
    const updated = text(entry.updated) || text(entry.published);
    const acceptedAt = Date.parse(updated);
    if (Number.isNaN(acceptedAt)) continue;
    seen.add(m[2]!);
    const summary = text(entry.summary);
    const filed = /Filed:\s*(?:<\/b>)?\s*(\d{4}-\d{2}-\d{2})/i.exec(summary)?.[1];
    out.push({ accession: m[2]!, cik: String(Number(t[3])), company: t[2]!.trim(), form: form as "8-K" | "8-K/A", acceptedAt,
      filedOn: filed ?? easternDate(acceptedAt), url: url.toString(), items: eightKItems(summary) });
  }
  return out;
}

/** The relationship as filed: officer title, Director, 10% owner, other (joined with " · "). */
export function filedRole(o: Owner): string {
  const parts = [o.isOfficer ? (o.officerTitle?.trim() || "Officer") : null, o.isDirector ? "Director" : null, o.isTenPercentOwner ? "10% owner" : null,
    o.otherText?.trim() || null].filter((p): p is string => Boolean(p));
  return parts.length ? [...new Set(parts)].join(" · ") : "Reporting owner";
}

/** An ownership document → the payload stored for every member. Non-derivative lines are kept as filed; derivative
 *  lines are counted (their codes still appear in `codes`). */
export function form4Payload(o: Ownership): Form4Payload {
  const lines = o.lines.filter(l => !l.derivative && l.code).map((l): FiledLine => ({
    code: l.code!, ad: l.acquiredDisposed === "A" || l.acquiredDisposed === "D" ? l.acquiredDisposed : null,
    date: l.date, shares: l.shares, price: l.price, value: l.value,
  }));
  return {
    kind: "4",
    owners: o.owners.map(ow => ({ cik: ow.cik && /^\d{1,10}$/.test(ow.cik) ? String(Number(ow.cik)) : null, name: ow.name, role: filedRole(ow) })),
    lines,
    codes: [...new Set(o.lines.map(l => l.code).filter((c): c is string => Boolean(c)))].sort(),
    derivativeLines: o.lines.filter(l => l.derivative).length,
  };
}
