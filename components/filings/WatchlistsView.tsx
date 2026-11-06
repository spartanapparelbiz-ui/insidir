"use client";
/* Watchlists (docs/RESEARCH-DESK.md §5): named lists of companies, pinned by ticker, keyed by CIK so a ticker change
 * never breaks a pin. Each change saves the lists as a whole, debounced (one row per list on the server). */
import { useState } from "react";
import { LIMITS } from "@/lib/filings/limits";
import { day } from "@/lib/filings/format";
import type { FilingRow, MemberState, Watchlist } from "@/lib/filings/types";
import type { SaveState } from "./hooks";
import { TickerSearch } from "./TickerSearch";

const STATUS: Record<string, string> = { researching: "Researching", watching: "Watching", passed: "Passed" };

export function WatchlistsView({ lists, setLists, save, rows, journals }: {
  lists: Watchlist[]; setLists: (l: Watchlist[]) => void; save: SaveState; rows: FilingRow[]; journals: MemberState["journals"];
}) {
  const [activeId, setActiveId] = useState<number | null>(lists[0]?.id ?? null);
  const [name, setName] = useState("");
  const active = lists.find(l => l.id === activeId) ?? lists[0] ?? null;
  const status = new Map(journals.map(j => [j.cik, j]));
  const last = (cik: string, form: "4" | "8-K") => rows.find(r => r.cik === cik && r.form.startsWith(form));

  const addList = () => {
    const n = name.trim();
    if (!n || lists.length >= LIMITS.lists || lists.some(l => l.name === n)) return;
    const id = -Date.now();
    setLists([...lists, { id, name: n, items: [] }]);
    setActiveId(id); setName("");
  };
  const update = (l: Watchlist) => setLists(lists.map(x => (x.id === l.id ? l : x)));

  return (
    <section aria-labelledby="fl-wl-h" data-testid="fl-watchlists">
      <div className="fl-head">
        <h2 id="fl-wl-h" className="fl-h2">Watchlists</h2>
        <p className="fl-sub">Every Form 4 and 8-K filed by a company on any of your lists shows up in Alerts.</p>
        <span className="fl-small" role="status">{save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Not saved yet. Retrying on your next change." : ""}</span>
      </div>
      <div className="fl-tabs" role="tablist" aria-label="Your lists">
        {lists.map(l => (
          <button key={l.id} type="button" role="tab" aria-selected={l.id === active?.id} className={`fl-tab${l.id === active?.id ? " is-on" : ""}`} onClick={() => setActiveId(l.id)}>
            {l.name} <span className="fl-small">{l.items.length}</span>
          </button>
        ))}
        <form className="fl-inline" onSubmit={e => { e.preventDefault(); addList(); }}>
          <label className="fl-sr" htmlFor="fl-new-list">New list name</label>
          <input id="fl-new-list" className="fl-input" placeholder="New list" maxLength={LIMITS.listName} value={name} onChange={e => setName(e.target.value)} />
          <button type="submit" className="fl-btn" disabled={!name.trim() || lists.length >= LIMITS.lists}>Add list</button>
        </form>
      </div>

      {!active ? <p className="fl-empty">Make a list, then pin tickers to it.</p> : (
        <>
          <div className="fl-toolbar">
            <TickerSearch label={`Pin a ticker to ${active.name}`} action="Pin" onPick={h => {
              if (active.items.some(i => i.cik === h.cik) || active.items.length >= LIMITS.perList) return;
              update({ ...active, items: [...active.items, { cik: h.cik, ticker: h.ticker }] });
            }} />
            <button type="button" className="fl-btn fl-btn--ghost" onClick={() => {
              const nn = prompt("Rename list", active.name)?.trim();
              if (nn && !lists.some(l => l.name === nn)) update({ ...active, name: nn.slice(0, LIMITS.listName) });
            }}>Rename</button>
            <button type="button" className="fl-btn fl-btn--ghost" onClick={() => {
              if (confirm(`Delete the list "${active.name}"? Your journal notes stay.`)) { setLists(lists.filter(l => l.id !== active.id)); setActiveId(null); }
            }}>Delete list</button>
          </div>
          {!active.items.length ? <p className="fl-empty">Pin a ticker to start. Every Form 4 and 8-K it files will show up in Alerts.</p> : (
            <table className="fl-table" data-testid="fl-watch-table">
              <thead><tr><th scope="col">Ticker</th><th scope="col">Last Form 4 (7 days)</th><th scope="col">Last 8-K (7 days)</th><th scope="col">Your status</th><th scope="col"><span className="fl-sr">Remove</span></th></tr></thead>
              <tbody>
                {active.items.map(i => {
                  const f4 = last(i.cik, "4"), k8 = last(i.cik, "8-K"), j = status.get(i.cik);
                  return (
                    <tr key={i.cik}>
                      <td><a className="fl-link fl-mono" href={`/filings/${encodeURIComponent(i.ticker)}`}>{i.ticker}</a></td>
                      <td>{f4 ? `${day(f4.filedOn)} · ${f4.payload.kind === "4" ? f4.payload.codes.join(", ") : ""}` : "None"}</td>
                      <td>{k8 ? `${day(k8.filedOn)}${k8.payload.kind === "8-K" && k8.payload.items.length ? ` · Items ${k8.payload.items.join(", ")}` : ""}` : "None"}</td>
                      <td>{j?.status ? STATUS[j.status] : "No status"}{j?.notes ? <span className="fl-small"> · {j.notes} notes</span> : null}</td>
                      <td><button type="button" className="fl-btn fl-btn--ghost" aria-label={`Remove ${i.ticker}`} onClick={() => update({ ...active, items: active.items.filter(x => x.cik !== i.cik) })}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
