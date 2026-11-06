/* Client-side filtering for the terminal (docs/RESEARCH-DESK.md): pure, allocation-light, shared by every table.
 * Each row's derived fields (search text, code-P and code-S dollars, owners) are computed once and kept in a WeakMap,
 * so re-filtering thousands of rows on each keystroke is a tight loop over cached values, not a re-parse. */
import { codeTotal } from "./format";
import type { FilingRow, FormType } from "./types";

/** Tape page size: ids b×TAPE_BUCKET … b×TAPE_BUCKET + TAPE_BUCKET − 1 form bucket b. */
export const TAPE_BUCKET = 200;
export const bucketOf = (id: number): number => Math.floor(id / TAPE_BUCKET);

export interface Derived {
  /** Lower-case haystack: ticker, company, owners, roles, codes, items. */
  text: string;
  p: number;
  s: number;
  owners: string;
  codes: string[];
}

const cache = new WeakMap<FilingRow, Derived>();
export function derive(f: FilingRow): Derived {
  const hit = cache.get(f);
  if (hit) return hit;
  const pl = f.payload;
  const owners = pl.kind === "4" ? pl.owners.map(o => o.name).join(", ") : "";
  const roles = pl.kind === "4" ? pl.owners.map(o => o.role).join(" ") : "";
  const codes = pl.kind === "4" ? pl.codes : [];
  const d: Derived = {
    text: `${f.ticker ?? ""} ${f.company} ${owners} ${roles} ${codes.join(" ")} ${pl.kind === "8-K" ? pl.items.join(" ") : ""} ${f.form}`.toLowerCase(),
    p: pl.kind === "4" ? codeTotal(pl.lines, "P") : 0,
    s: pl.kind === "4" ? codeTotal(pl.lines, "S") : 0,
    owners, codes,
  };
  cache.set(f, d);
  return d;
}

export type FormFamily = "4" | "8-K";
export interface RowFilter {
  /** Free text over ticker, company, owner, role, codes and items. Space-separated terms must all match. */
  q: string;
  /** Form families to show; empty = all. Amendments follow their family. */
  forms: FormFamily[];
  /** Show only filings carrying one of these transaction codes; empty = any. */
  codes: Array<"P" | "S">;
  /** Minimum code-P or code-S dollars on the filing; null = no minimum (8-Ks pass only without a minimum). */
  minUsd: number | null;
  /** Only these companies (watchlist); null = every company. */
  ciks: ReadonlySet<string> | null;
  /** Only companies with a filing-velocity match; null = no velocity filter. */
  velocity: ReadonlySet<string> | null;
}
export const NO_FILTER: RowFilter = { q: "", forms: [], codes: [], minUsd: null, ciks: null, velocity: null };

const family = (form: FormType): FormFamily => (form.startsWith("8-K") ? "8-K" : "4");

export function matches(f: FilingRow, flt: RowFilter, terms: readonly string[]): boolean {
  if (flt.ciks && !flt.ciks.has(f.cik)) return false;
  if (flt.velocity && !flt.velocity.has(f.cik)) return false;
  if (flt.forms.length && !flt.forms.includes(family(f.form))) return false;
  const d = derive(f);
  if (flt.codes.length && !flt.codes.some(c => d.codes.includes(c))) return false;
  if (flt.minUsd !== null && Math.max(d.p, d.s) < flt.minUsd) return false;
  for (const t of terms) if (!d.text.includes(t)) return false;
  return true;
}

/** The rows that pass, in their incoming order, and how long the pass took (for the status bar). */
export function filterRows(rows: readonly FilingRow[], flt: RowFilter): { rows: FilingRow[]; ms: number } {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const terms = flt.q.toLowerCase().split(/\s+/).filter(Boolean);
  const plain = !terms.length && !flt.forms.length && !flt.codes.length && flt.minUsd === null && !flt.ciks && !flt.velocity;
  const out = plain ? rows.slice() : rows.filter(f => matches(f, flt, terms));
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { rows: out, ms: Math.round((t1 - t0) * 10) / 10 };
}

/** Rows by id, newest first, one per id (live feed rows merged into loaded tape pages). */
export function mergeRows(a: readonly FilingRow[], b: readonly FilingRow[]): FilingRow[] {
  const by = new Map<number, FilingRow>();
  for (const r of a) by.set(r.id, r);
  for (const r of b) by.set(r.id, r);
  return [...by.values()].sort((x, y) => y.id - x.id);
}
