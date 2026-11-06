"use client";
/* The position desk (docs/RESEARCH-DESK.md §8): shares and event contracts logged by hand, mapped against each
 * company's EDGAR timeline. Left: the ledger and the logger. Right: the selected position's paper trail (the member's
 * own entries and every stored Form 4 / 8-K since 90 days before entry) and the EV calculator. The browser owns the
 * list and saves it as one document (optimistic, rolled back if refused). P&L is arithmetic on the member's own
 * numbers, never coloured. No broker, no venue account. */
import { useEffect, useMemo, useState } from "react";
import { parseInput, positionPnl, positionProblem } from "@/lib/filings/calc";
import { day, etStamp, filingDetail, price, qty, signedUsd } from "@/lib/filings/format";
import { LIMITS } from "@/lib/filings/limits";
import type { FilingRow, Position } from "@/lib/filings/types";
import { CalcLine, CodeBadge, FormBadge, ItemBadge } from "./Bits";
import { EvCalculator } from "./EvCalculator";
import { api, useTickers } from "./hooks";
import { TickerSearch } from "./TickerSearch";

interface Draft { kind: Position["kind"]; tickers: string[]; venue: Position["venue"]; label: string; side: Position["side"]; quantity: string; entryPrice: string; entryDate: string; fees: string; note: string }
const blank = (kind: Position["kind"]): Draft => ({ kind, tickers: [], venue: kind === "event" ? "kalshi" : null, label: "", side: kind === "equity" ? "long" : "yes",
  quantity: "", entryPrice: "", entryDate: "", fees: "", note: "" });
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}`);
const VENUE = { kalshi: "Kalshi", polymarket: "Polymarket", other: "Other" } as const;
const entryText = (p: Position) => (p.kind === "event" ? `${Math.round(p.entryPrice * 100)}¢` : price(p.entryPrice));

export function PositionsDesk({ positions, save }: { positions: Position[]; save: (p: Position[]) => Promise<string | null> }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<string | null>(positions[0]?.id ?? null);
  const selected = positions.find(p => p.id === sel) ?? null;

  const add = async () => {
    if (!draft) return;
    const isEvent = draft.kind === "event";
    const entry = parseInput(draft.entryPrice);
    const p: Position = {
      id: newId(), kind: draft.kind, tickers: draft.tickers, venue: isEvent ? draft.venue : null, label: isEvent ? draft.label.trim() : null, side: draft.side,
      quantity: parseInput(draft.quantity) ?? Number.NaN, entryPrice: entry === null ? Number.NaN : isEvent ? entry / 100 : entry, entryDate: draft.entryDate,
      fees: parseInput(draft.fees) ?? 0, exitPrice: null, resolution: null, closedOn: null, note: draft.note.trim(),
    };
    const problem = positionProblem(p) ?? (positions.length >= LIMITS.positions ? "The desk holds 500 positions. Delete closed ones first." : null);
    if (problem) { setError(problem); return; }
    setDraft(null); setError(null); setSel(p.id);
    const err = await save([p, ...positions]);
    if (err) setError(err);
  };
  const close = (p: Position, patch: Partial<Position>) => void save(positions.map(x => (x.id === p.id ? { ...x, ...patch, closedOn: new Date().toISOString().slice(0, 10) } : x)));

  return (
    <div className="fl-split" data-testid="fl-positions">
      <section className="fl-pane" aria-label="Position ledger">
        <div className="fl-pane__bar">
          <h2 className="fl-h">Position desk</h2>
          <span className="fl-faint">Logged by hand. Insidir never connects to a broker or a venue account.</span>
          <button type="button" className="fl-btn fl-btn--ghost" onClick={() => setDraft(blank("equity"))}>+ Shares</button>
          <button type="button" className="fl-btn fl-btn--ghost" onClick={() => setDraft(blank("event"))}>+ Event contract</button>
        </div>
        {draft ? <PositionForm d={draft} set={setDraft} onSave={() => void add()} onCancel={() => { setDraft(null); setError(null); }} error={error} /> : error ? <p className="fl-section fl-error" role="alert">{error}</p> : null}
        <div className="fl-pane__scroll">
          {!positions.length ? <p className="fl-empty">No positions logged. Add shares or an event contract to map it against EDGAR.</p> : (
            <table className="fl-lines" data-testid="fl-pos-table">
              <thead><tr><th scope="col">Position</th><th scope="col">Side</th><th scope="col" className="fl-n">Qty</th><th scope="col" className="fl-n">Entry</th><th scope="col">Your mark</th><th scope="col" className="fl-n">P&amp;L</th><th scope="col"><span className="fl-sr">Close or delete</span></th></tr></thead>
              <tbody>
                {positions.map(p => {
                  const isEvent = p.kind === "event";
                  const typed = parseInput(marks[p.id] ?? "");
                  const pnl = positionPnl(p, typed === null ? null : isEvent ? typed / 100 : typed);
                  const closed = p.exitPrice !== null || p.resolution !== null;
                  return (
                    <tr key={p.id} aria-selected={p.id === sel} className={p.id === sel ? "fl-tr-sel" : undefined}>
                      <td><button type="button" className="fl-linkbtn fl-tk" onClick={() => setSel(p.id)}>{isEvent ? `${VENUE[p.venue ?? "other"]}: ${p.label}` : p.tickers[0]}</button>
                        <span className="fl-faint fl-mono"> {day(p.entryDate)}{closed ? ` → ${day(p.closedOn)}` : ""}</span></td>
                      <td className="fl-mono">{p.side}</td>
                      <td className="fl-n">{qty(p.quantity)}</td>
                      <td className="fl-n">{entryText(p)}</td>
                      <td>{closed ? <span className="fl-mono fl-dim">{p.resolution ? `resolved ${p.resolution}` : price(p.exitPrice!)}</span> : (
                        <label><span className="fl-sr">Your mark</span><input className="fl-in fl-in--n" inputMode="decimal" placeholder={isEvent ? "¢" : "$"} value={marks[p.id] ?? ""} onChange={e => setMarks(m => ({ ...m, [p.id]: e.target.value }))} /></label>)}</td>
                      <td className="fl-n">{pnl === null ? <span className="fl-faint">–</span> : signedUsd(pnl)}</td>
                      <td className="fl-row-gap">
                        {!closed ? <CloseControls p={p} onClose={patch => close(p, patch)} /> : null}
                        <button type="button" className="fl-x" aria-label="Delete position" onClick={() => { if (confirm("Delete this position?")) void save(positions.filter(x => x.id !== p.id)); }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="fl-section"><CalcLine /></div>
        </div>
      </section>
      <aside className="fl-pane fl-pane--2" aria-label="Paper trail and calculator">
        <div className="fl-pane__scroll">
          {selected ? <PaperTrail p={selected} /> : <p className="fl-empty">Select a position to map it against EDGAR.</p>}
          <EvCalculator />
        </div>
      </aside>
    </div>
  );
}

function PositionForm({ d, set, onSave, onCancel, error }: { d: Draft; set: (d: Draft) => void; onSave: () => void; onCancel: () => void; error: string | null }) {
  const isEvent = d.kind === "event";
  const up = (patch: Partial<Draft>) => set({ ...d, ...patch });
  return (
    <form className="fl-section" onSubmit={e => { e.preventDefault(); onSave(); }} data-testid="fl-pos-form" aria-label={isEvent ? "Log an event contract" : "Log shares"}>
      <div className="fl-grid">
        {isEvent ? (
          <>
            <label className="fl-field"><span className="fl-label">Venue</span>
              <select className="fl-in" value={d.venue ?? "kalshi"} onChange={e => up({ venue: e.target.value as Position["venue"] })}><option value="kalshi">Kalshi</option><option value="polymarket">Polymarket</option><option value="other">Other</option></select></label>
            <label className="fl-field"><span className="fl-label">Contract, as you name it</span><input className="fl-in" maxLength={200} value={d.label} onChange={e => up({ label: e.target.value })} /></label>
            <label className="fl-field"><span className="fl-label">Side</span><select className="fl-in" value={d.side} onChange={e => up({ side: e.target.value as Position["side"] })}><option value="yes">Yes</option><option value="no">No</option></select></label>
          </>
        ) : (
          <label className="fl-field"><span className="fl-label">Side</span><select className="fl-in" value={d.side} onChange={e => up({ side: e.target.value as Position["side"] })}><option value="long">Long</option><option value="short">Short</option></select></label>
        )}
        <div className="fl-field"><span className="fl-label">{isEvent ? "Linked companies (optional)" : "Ticker"}</span>
          <TickerSearch label={isEvent ? "Link a ticker" : "Pick the ticker"} action={isEvent ? "Link" : "Pick"} onPick={h => up({ tickers: isEvent ? [...new Set([...d.tickers, h.ticker])].slice(0, 10) : [h.ticker] })} />
          {d.tickers.length ? <span className="fl-row-gap">{d.tickers.map(t => <span key={t} className="fl-tag">{t} <button type="button" className="fl-x" aria-label={`Remove ${t}`} onClick={() => up({ tickers: d.tickers.filter(x => x !== t) })}>✕</button></span>)}</span> : null}
        </div>
        <label className="fl-field"><span className="fl-label">{isEvent ? "Contracts" : "Shares"}</span><input className="fl-in fl-in--n" inputMode="decimal" value={d.quantity} onChange={e => up({ quantity: e.target.value })} /></label>
        <label className="fl-field"><span className="fl-label">{isEvent ? "Entry (¢)" : "Entry ($/share)"}</span><input className="fl-in fl-in--n" inputMode="decimal" value={d.entryPrice} onChange={e => up({ entryPrice: e.target.value })} /></label>
        <label className="fl-field"><span className="fl-label">Entry date</span><input className="fl-in" type="date" value={d.entryDate} onChange={e => up({ entryDate: e.target.value })} /></label>
        <label className="fl-field"><span className="fl-label">Fees $ (optional)</span><input className="fl-in fl-in--n" inputMode="decimal" value={d.fees} onChange={e => up({ fees: e.target.value })} /></label>
      </div>
      <label className="fl-field"><span className="fl-label">Note (optional)</span><input className="fl-in" maxLength={2000} value={d.note} onChange={e => up({ note: e.target.value })} /></label>
      {error ? <p className="fl-error" role="alert">{error}</p> : null}
      <div className="fl-row-gap"><button type="submit" className="fl-btn">Save position</button><button type="button" className="fl-btn fl-btn--ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function CloseControls({ p, onClose }: { p: Position; onClose: (patch: Partial<Position>) => void }) {
  const [v, setV] = useState("");
  if (p.kind === "event") {
    return (
      <label><span className="fl-sr">Resolved as</span>
        <select className="fl-in" value="" onChange={e => e.target.value && onClose({ resolution: e.target.value as Position["resolution"] })}>
          <option value="">Resolve…</option><option value="yes">Yes</option><option value="no">No</option><option value="void">Void</option>
        </select></label>
    );
  }
  return (
    <form className="fl-row-gap" onSubmit={e => { e.preventDefault(); const x = parseInput(v); if (x !== null && x > 0) onClose({ exitPrice: x }); }}>
      <label><span className="fl-sr">Exit price</span><input className="fl-in fl-in--n" inputMode="decimal" placeholder="Exit $" value={v} onChange={e => setV(e.target.value)} /></label>
      <button type="submit" className="fl-x" disabled={parseInput(v) === null}>Close</button>
    </form>
  );
}

/** The member's entries and every stored Form 4 / 8-K for the linked companies, one timeline, theirs marked as theirs. */
function PaperTrail({ p }: { p: Position }) {
  const t = useTickers(true);
  const [rows, setRows] = useState<FilingRow[] | null>(null);
  const ciks = useMemo(() => p.tickers.map(x => t.byTicker.get(x)?.cik).filter((c): c is string => Boolean(c)), [p.tickers, t.byTicker]);
  useEffect(() => {
    if (!t.ready) return;
    let live = true;
    setRows(null);
    void Promise.all(ciks.map(c => api<{ filings: FilingRow[] }>(`/api/filings/company/${c}`, { method: "GET" }).then(r => r.filings).catch(() => [] as FilingRow[])))
      .then(all => { if (live) setRows(all.flat()); });
    return () => { live = false; };
  }, [ciks, t.ready]);
  const from = new Date(Date.parse(`${p.entryDate}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  type Item = { at: string; key: string; you: boolean; f?: FilingRow; text: string };
  const items: Item[] = [
    { at: p.entryDate, key: "entry", you: true, text: `Your entry · ${p.side} ${qty(p.quantity)} at ${entryText(p)}` },
    ...(p.closedOn ? [{ at: p.closedOn, key: "exit", you: true, text: p.resolution ? `Resolved ${p.resolution}` : `Your exit at ${price(p.exitPrice ?? 0)}` }] : []),
    ...(rows ?? []).filter(f => f.filedOn >= from).map(f => ({ at: f.filedOn, key: f.accession, you: false, f, text: filingDetail(f) })),
  ].sort((a, b) => b.at.localeCompare(a.at) || Number(a.you) - Number(b.you));
  return (
    <section aria-label="Paper trail" data-testid="fl-trail">
      <div className="fl-pane__bar"><h3 className="fl-h">Paper trail · {p.tickers.join(", ") || "no company linked"}</h3><span className="fl-faint fl-mono">since {from}</span></div>
      {!p.tickers.length ? <p className="fl-empty">Link a company to this contract to map its filings.</p> : rows === null ? <p className="fl-empty">Loading EDGAR timeline…</p> : (
        <ol className="fl-trail">
          {items.map(i => (
            <li key={i.key}>
              <span className="fl-mono fl-faint">{i.at}</span>
              <span className={`fl-trail__dot${i.you ? " fl-trail__dot--you" : ""}`} aria-hidden="true" />
              <span>
                {i.f ? <span className="fl-row-gap"><span className="fl-tk">{i.f.ticker}</span><FormBadge form={i.f.form} />
                  {i.f.payload.kind === "4" ? i.f.payload.codes.map(c => <CodeBadge key={c} code={c} />) : i.f.payload.items.map(x => <ItemBadge key={x} item={x} />)}
                  <a className="fl-x" href={i.f.url} target="_blank" rel="noopener noreferrer" aria-label="Open on sec.gov">↗</a></span> : <span className="fl-tag fl-tag--hold">you</span>}
                <span className="fl-dim"> {i.text}</span>
                {i.f ? <span className="fl-faint fl-mono"> · accepted {etStamp(i.f.acceptedAt)}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
