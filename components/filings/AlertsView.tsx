"use client";
/* Watchlists and their alert feed (docs/RESEARCH-DESK.md §5), split three ways: the lists rail (pin, unpin, new list,
 * rename, delete; all optimistic), the watched companies' Form 4 and 8-K feed with its filters (dollar threshold,
 * form, code, velocity), and the selected filing as a document. W focuses the pin field. */
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { filterRows, mergeRows } from "@/lib/filings/filter";
import { LIMITS } from "@/lib/filings/limits";
import type { FilingRow, Watchlist } from "@/lib/filings/types";
import { FilingCells, FilingDoc } from "./FilingDoc";
import { EMPTY_FILTER, FilterBar, toRowFilter, type FilterState } from "./FilterBar";
import { useLocal, type SaveState } from "./hooks";
import { TAPE_HEAD } from "./TapeView";
import { TickerSearch } from "./TickerSearch";
import { VTable } from "./VTable";

const rowKey = (f: FilingRow) => f.accession;

export function AlertsView({ lists, setLists, save, history, live, seenId, markSeen, velocityCiks, held, freshIds, onNote, pinRef, filterRef, journals }: {
  lists: Watchlist[]; setLists: (l: Watchlist[]) => void; save: SaveState; history: FilingRow[]; live: FilingRow[]; seenId: number;
  markSeen: (id: number) => void; velocityCiks: ReadonlySet<string>; held: ReadonlySet<string>; freshIds: ReadonlySet<number>;
  onNote: (f: FilingRow) => void; pinRef: React.RefObject<HTMLInputElement | null>; filterRef: React.RefObject<HTMLInputElement | null>;
  journals: ReadonlyMap<string, string | null>;
}) {
  const [listId, setListId] = useLocal<number | "all">("fl:alerts:list", "all");
  const [filter, setFilter] = useLocal<FilterState>("fl:alerts:filter", EMPTY_FILTER);
  const [name, setName] = useState("");
  const active = listId === "all" ? null : lists.find(l => l.id === listId) ?? null;
  const allCiks = useMemo(() => new Set(lists.flatMap(l => l.items.map(i => i.cik))), [lists]);
  const scope = useMemo(() => (active ? new Set(active.items.map(i => i.cik)) : allCiks), [active, allCiks]);
  const rows = useMemo(() => mergeRows(history, live.filter(f => allCiks.has(f.cik))), [history, live, allCiks]);
  const deferred = useDeferredValue(filter);
  const out = useMemo(() => filterRows(rows, toRowFilter(deferred, scope, velocityCiks)), [rows, deferred, scope, velocityCiks]);
  const [sel, setSel] = useState<string | null>(null);
  const selected = useMemo(() => out.rows.find(r => r.accession === sel) ?? null, [out.rows, sel]);
  const unread = rows.filter(r => r.id > seenId).length;
  const onSelect = useCallback((f: FilingRow) => setSel(f.accession), []);
  const render = useCallback((f: FilingRow) => <FilingCells f={f} mode="tape" />, []);
  const rowClass = useCallback((f: FilingRow) => `${f.id > seenId ? "fl-tr--unread" : ""}${freshIds.has(f.id) ? " fl-tr--new" : ""}`, [seenId, freshIds]);

  const target = active ?? lists[0] ?? null;
  const pin = (cik: string, ticker: string) => {
    if (!target) { setLists([{ id: -Date.now(), name: "Core", items: [{ cik, ticker }] }]); return; }
    if (target.items.some(i => i.cik === cik) || target.items.length >= LIMITS.perList) return;
    setLists(lists.map(l => (l.id === target.id ? { ...l, items: [...l.items, { cik, ticker }] } : l)));
  };
  const addList = () => {
    const n = name.trim();
    if (!n || lists.length >= LIMITS.lists || lists.some(l => l.name === n)) return;
    const id = -Date.now();
    setLists([...lists, { id, name: n.slice(0, LIMITS.listName), items: [] }]);
    setListId(id); setName("");
  };
  const items = active ? active.items : [...new Map(lists.flatMap(l => l.items).map(i => [i.cik, i])).values()];

  return (
    <div className={`fl-split fl-split--rail${selected ? " has-sel" : ""}`} data-testid="fl-alerts">
      <nav className="fl-pane fl-pane--2" aria-label="Watchlists" data-testid="fl-watchlists">
        <div className="fl-pane__bar"><h2 className="fl-h">Watchlists</h2><span className="fl-faint fl-mono" role="status">{save === "saving" ? "saving" : save === "error" ? "not saved" : ""}</span></div>
        <div className="fl-section">
          <TickerSearch ref={pinRef} label={`Pin to ${target?.name ?? "a new list"}`} action="Pin" hint="W" onPick={h => pin(h.cik, h.ticker)} />
        </div>
        <div className="fl-pane__scroll">
          <div className="fl-section fl-row-gap" role="group" aria-label="Lists">
            <button type="button" className="fl-chip" aria-pressed={listId === "all"} onClick={() => setListId("all")}>All lists · {allCiks.size}</button>
            {lists.map(l => <button key={l.id} type="button" className="fl-chip" aria-pressed={l.id === listId} onClick={() => setListId(l.id)}>{l.name} · {l.items.length}</button>)}
          </div>
          <div className="fl-section">
            {!items.length ? <p className="fl-faint">Pin a ticker. Every Form 4 and 8-K it files lands in this feed within about a minute of reaching Insidir.</p> : (
              <ul className="fl-notes" aria-label="Pinned companies">
                {items.map(i => {
                  const status = journals.get(i.cik);
                  return (
                    <li key={i.cik} className="fl-row-gap fl-tk">
                      <a className="fl-link" href={`/filings/${encodeURIComponent(i.ticker)}`}>{i.ticker}</a>
                      {status ? <span className="fl-tag">{status}</span> : null}
                      {active ? <button type="button" className="fl-x" aria-label={`Unpin ${i.ticker}`} onClick={() => setLists(lists.map(l => (l.id === active.id ? { ...l, items: l.items.filter(x => x.cik !== i.cik) } : l)))}>✕</button> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <form className="fl-section fl-row-gap" onSubmit={e => { e.preventDefault(); addList(); }}>
            <label className="fl-sr" htmlFor="fl-new-list">New list name</label>
            <input id="fl-new-list" className="fl-in" placeholder="New list" maxLength={LIMITS.listName} value={name} onChange={e => setName(e.target.value)} />
            <button type="submit" className="fl-btn fl-btn--ghost" disabled={!name.trim() || lists.length >= LIMITS.lists}>Add</button>
          </form>
          {active ? (
            <div className="fl-section fl-row-gap">
              <button type="button" className="fl-btn fl-btn--ghost" onClick={() => { const n = prompt("Rename list", active.name)?.trim(); if (n && !lists.some(l => l.name === n)) setLists(lists.map(l => (l.id === active.id ? { ...l, name: n.slice(0, LIMITS.listName) } : l))); }}>Rename</button>
              <button type="button" className="fl-btn fl-btn--ghost" onClick={() => { if (confirm(`Delete "${active.name}"? Your journal stays.`)) { setLists(lists.filter(l => l.id !== active.id)); setListId("all"); } }}>Delete list</button>
            </div>
          ) : null}
        </div>
      </nav>
      <section className="fl-pane" aria-label="Alert feed">
        <div className="fl-pane__bar">
          <h2 className="fl-h">Alerts · {active?.name ?? "all lists"}</h2>
          <span className="fl-faint fl-mono">7 days · {unread} unread</span>
          {unread ? <button type="button" className="fl-btn fl-btn--ghost" onClick={() => markSeen(Math.max(...rows.map(r => r.id)))}>Mark read</button> : null}
        </div>
        <FilterBar ref={filterRef} value={filter} onChange={setFilter} count={out.rows.length} total={rows.length} ms={out.ms} velocity label="Filter alerts" />
        <VTable rows={out.rows} cols="fl-cols-tape" head={TAPE_HEAD} render={render} rowKey={rowKey} selected={sel} onSelect={onSelect} rowClass={rowClass} label="Watched companies' filings"
          empty={!allCiks.size ? "Pin tickers on the left; their filings appear here." : rows.length ? "No alerts match these filters." : "No Form 4 or 8-K from your watchlists in the last 7 days."} />
      </section>
      <aside className="fl-pane fl-pane--2" aria-label="Selected filing">
        {selected ? <FilingDoc f={selected} held={Boolean(selected.ticker && held.has(selected.ticker))} onNote={onNote} onClose={() => setSel(null)} />
          : <p className="fl-empty">Select an alert to read the filing.</p>}
      </aside>
    </div>
  );
}
