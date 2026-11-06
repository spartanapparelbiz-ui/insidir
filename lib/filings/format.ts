/* How filings read on screen: money to the cent as filed, Eastern times with the zone, factual one-line titles. Pure,
 * shared by the server and the browser. No adjectives, no judgement words. */
import { itemLabel } from "./codes";
import type { FiledLine, FilingRow } from "./types";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PRICE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const NUM = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const DAY_Y = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

export const usd = (n: number): string => USD.format(n);
export const signedUsd = (n: number): string => `${n < 0 ? "−" : "+"}${USD.format(Math.abs(n))}`;
export const price = (n: number): string => PRICE.format(n);
export const qty = (n: number): string => NUM.format(n);
/** "4:31:07 PM ET". */
export const etTime = (ms: number): string => `${TIME.format(new Date(ms))} ET`;
/** "Nov 6, 4:31:07 PM ET". */
export const etStamp = (ms: number): string => `${DAY.format(new Date(ms))}, ${etTime(ms)}`;
/** "2026-10-14" → "Oct 14, 2026". */
export const day = (iso: string | null): string => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? DAY_Y.format(new Date(`${iso}T00:00:00Z`)) : "No date");

/** The code-P / code-S dollars on a Form 4 line set, as filed (null lines left out). */
export function codeTotal(lines: readonly FiledLine[], code: "P" | "S"): number {
  const ad = code === "P" ? "A" : "D";
  return Math.round(lines.filter(l => l.code === code && l.ad === ad && l.value !== null).reduce((s, l) => s + l.value!, 0) * 100) / 100;
}

/** "NVDA · Form 4 · P, S" / "NVDA · 8-K · Items 2.02, 9.01" / "NVDA · Form 4/A (amendment)". */
export function filingTitle(f: FilingRow, opts: { codes?: boolean } = {}): string {
  const who = f.ticker ?? f.company, codes = opts.codes ?? true;
  if (f.payload.kind === "8-K") return `${who} · ${f.form}${f.form.endsWith("/A") ? " (amendment)" : ""}${codes && f.payload.items.length ? ` · Items ${f.payload.items.join(", ")}` : ""}`;
  if (f.form === "4/A") return `${who} · Form 4/A (amendment)`;
  return `${who} · Form 4${codes && f.payload.codes.length ? ` · ${f.payload.codes.join(", ")}` : ""}`;
}

/** The second line: who filed and what, in figures as filed. */
export function filingDetail(f: FilingRow): string {
  if (f.payload.kind === "8-K") return f.payload.items.length ? f.payload.items.map(itemLabel).join("; ") : "Items not listed in the EDGAR feed. Open the filing for its contents.";
  const owners = f.payload.owners.map(o => `${o.name} (${o.role})`).join(", ") || "Reporting owner";
  const parts = [owners];
  const p = codeTotal(f.payload.lines, "P"), s = codeTotal(f.payload.lines, "S");
  if (p) parts.push(`P ${usd(p)}`);
  if (s) parts.push(`S ${usd(s)}`);
  const dates = f.payload.lines.map(l => l.date).filter((d): d is string => Boolean(d)).sort();
  if (dates.length) parts.push(`Trade ${day(dates[0]!)}${dates.at(-1) !== dates[0] ? ` to ${day(dates.at(-1)!)}` : ""}`);
  return parts.join(" · ");
}
