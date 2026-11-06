"use client";
/* The filter bar over every filing table: free text, form family, transaction code, a dollar threshold and (on the
 * alert feed) filing velocity. Filtering runs in the browser over cached derived fields (lib/filings/filter.ts); the
 * bar prints the row count and how long the last pass took, measured, not claimed. Settings persist per browser. */
import { forwardRef } from "react";
import { parseInput } from "@/lib/filings/calc";
import type { FormFamily, RowFilter } from "@/lib/filings/filter";
import { Kbd } from "./Bits";

/** What the bar stores (serializable). */
export interface FilterState { q: string; forms: FormFamily[]; codes: Array<"P" | "S">; min: string; velocity: boolean }
export const EMPTY_FILTER: FilterState = { q: "", forms: [], codes: [], min: "", velocity: false };

export function toRowFilter(s: FilterState, ciks: ReadonlySet<string> | null, velocityCiks: ReadonlySet<string> | null): RowFilter {
  const min = parseInput(s.min);
  return { q: s.q, forms: s.forms, codes: s.codes, minUsd: min !== null && min > 0 ? min : null, ciks, velocity: s.velocity ? velocityCiks ?? new Set() : null };
}

const toggle = <T,>(list: readonly T[], v: T): T[] => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

export const FilterBar = forwardRef<HTMLInputElement, {
  value: FilterState; onChange: (v: FilterState) => void; count: number; total: number; ms: number; velocity?: boolean; label: string;
}>(function FilterBar({ value: v, onChange, count, total, ms, velocity, label }, ref) {
  const chip = (on: boolean, text: string, click: () => void, tone = "") =>
    <button type="button" className={`fl-chip${tone}`} aria-pressed={on} onClick={click}>{text}</button>;
  return (
    <div className="fl-filters" role="search" aria-label={label}>
      <label className="fl-search">
        <span className="fl-sr">Filter rows</span>
        <input ref={ref} className="fl-in" type="search" placeholder="Filter: ticker, owner, role, code" value={v.q} onChange={e => onChange({ ...v, q: e.target.value })} spellCheck={false} />
      </label>
      <span className="fl-filters__sep" />
      {chip(v.forms.includes("4"), "Form 4", () => onChange({ ...v, forms: toggle(v.forms, "4") }))}
      {chip(v.forms.includes("8-K"), "8-K", () => onChange({ ...v, forms: toggle(v.forms, "8-K") }), " fl-chip--k")}
      <span className="fl-filters__sep" />
      {chip(v.codes.includes("P"), "Code P", () => onChange({ ...v, codes: toggle(v.codes, "P") }), " fl-chip--p")}
      {chip(v.codes.includes("S"), "Code S", () => onChange({ ...v, codes: toggle(v.codes, "S") }), " fl-chip--s")}
      <label className="fl-field fl-field--row"><span className="fl-label">Min $</span>
        <input className="fl-in fl-in--n" inputMode="decimal" value={v.min} onChange={e => onChange({ ...v, min: e.target.value })} aria-label="Minimum code P or S dollars" /></label>
      {velocity ? chip(v.velocity, "Velocity only", () => onChange({ ...v, velocity: !v.velocity })) : null}
      {v.q || v.forms.length || v.codes.length || v.min || v.velocity ? <button type="button" className="fl-x" onClick={() => onChange(EMPTY_FILTER)}>Clear</button> : null}
      <span className="fl-filters__meta" aria-live="polite">{count.toLocaleString("en-US")} / {total.toLocaleString("en-US")} rows · {ms.toFixed(1)} ms <Kbd k="F" /></span>
    </div>
  );
});
