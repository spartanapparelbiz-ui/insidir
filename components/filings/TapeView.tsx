"use client";
/* The tape: every Form 4 and 8-K Insidir has stored, newest first, live at the top and infinite back in time (cached
 * id buckets). Filter in place; select a row (click or ↑/↓) to read it as a document on the right. */
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { filterRows } from "@/lib/filings/filter";
import type { FilingRow } from "@/lib/filings/types";
import { FilingCells, FilingDoc } from "./FilingDoc";
import { EMPTY_FILTER, FilterBar, toRowFilter, type FilterState } from "./FilterBar";
import { useLocal } from "./hooks";
import { VTable } from "./VTable";

export const TAPE_HEAD = (
  <>
    <span>Time ET</span><span>Ticker</span><span>Form</span><span className="fl-hide-sm">Codes</span><span>Reporting / items</span>
    <span className="fl-hide-sm">Role</span><span className="fl-n">P / S value</span><span className="fl-n fl-hide-sm">Lag</span>
  </>
);
const rowKey = (f: FilingRow) => f.accession;

export function TapeView({ rows, loadMore, loading, done, held, freshIds, onNote, filterRef }: {
  rows: FilingRow[]; loadMore: () => void; loading: boolean; done: boolean; held: ReadonlySet<string>; freshIds: ReadonlySet<number>;
  onNote: (f: FilingRow) => void; filterRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [filter, setFilter] = useLocal<FilterState>("fl:tape:filter", EMPTY_FILTER);
  const deferred = useDeferredValue(filter);
  const out = useMemo(() => filterRows(rows, toRowFilter(deferred, null, null)), [rows, deferred]);
  const [sel, setSel] = useState<string | null>(null);
  const selected = useMemo(() => out.rows.find(r => r.accession === sel) ?? null, [out.rows, sel]);
  const onSelect = useCallback((f: FilingRow) => setSel(f.accession), []);
  const render = useCallback((f: FilingRow) => <FilingCells f={f} mode="tape" />, []);
  const rowClass = useCallback((f: FilingRow) => (freshIds.has(f.id) ? "fl-tr--new" : ""), [freshIds]);
  const ended = useRef(false);
  ended.current = done;
  return (
    <div className={`fl-split${selected ? " has-sel" : ""}`} data-testid="fl-tape">
      <section className="fl-pane" aria-label="Tape">
        <FilterBar ref={filterRef} value={filter} onChange={setFilter} count={out.rows.length} total={rows.length} ms={out.ms} label="Filter the tape" />
        <VTable rows={out.rows} cols="fl-cols-tape" head={TAPE_HEAD} render={render} rowKey={rowKey} selected={sel} onSelect={onSelect} rowClass={rowClass}
          onEnd={() => { if (!ended.current) loadMore(); }} label="Every stored Form 4 and 8-K"
          empty={rows.length ? "No filings match these filters in what's loaded. Scroll or clear filters." : "No filings stored yet. The poller adds them as EDGAR accepts them."}
          footer={<p className="fl-more">{loading ? "Loading older filings…" : done ? "Start of the tape: every stored filing is loaded." : "Scroll for older filings."}</p>} />
      </section>
      <aside className="fl-pane fl-pane--2" aria-label="Selected filing">
        {selected ? <FilingDoc f={selected} held={Boolean(selected.ticker && held.has(selected.ticker))} onNote={onNote} onClose={() => setSel(null)} />
          : <p className="fl-empty">Select a filing. ↑/↓ move, Enter opens.</p>}
      </aside>
    </div>
  );
}
