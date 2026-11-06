"use client";
/* The positions desk (docs/RESEARCH-DESK.md §8): shares and event contracts the member logs by hand, with each one's
 * SEC paper trail since entry. The browser owns the list and saves it as one document; P&L is arithmetic on the
 * member's own numbers (a mark they type, or the exit / resolution they enter). No broker, no venue account. */
import { useEffect, useMemo, useState } from "react";
import { parseInput, positionPnl, positionProblem } from "@/lib/filings/calc";
import { day, etStamp, filingDetail, filingTitle, price, qty, signedUsd } from "@/lib/filings/format";
import { LIMITS } from "@/lib/filings/limits";
import type { FilingRow, Position } from "@/lib/filings/types";
import { CalcLine } from "./Bits";
import { EvCalculator } from "./EvCalculator";
import { api, useTickers } from "./hooks";
import { TickerSearch } from "./TickerSearch";

const blank = (kind: Position["kind"]): Draft => ({ kind, tickers: [], venue: kind === "event" ? "kalshi" : null, label: "", side: kind === "equity" ? "long" : "yes",
  quantity: "", entryPrice: "", entryDate: "", fees: "", note: "" });
interface Draft { kind: Position["kind"]; tickers: string[]; venue: Position["venue"]; label: string; side: Position["side"]; quantity: string; entryPrice: string; entryDate: string; fees: string; note: string }
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}`);

export function PositionsDesk({ positions, save }: { positions: Position[]; save: (p: Position[]) => Promise<string | null> }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);

  const add = async () => {
    if (!draft) return;
    const isEvent = draft.kind === "event";
    const entry = parseInput(draft.entryPrice);
    const p: Position = {
      id: newId(), kind: draft.kind, tickers: draft.tickers, venue: isEvent ? draft.venue : null, label: isEvent ? draft.label.trim() : null, side: draft.side,
      quantity: parseInput(draft.quantity) ?? NaN, entryPrice: entry === null ? NaN : isEvent ? entry / 100 : entry, entryDate: draft.entryDate,
      fees: parseInput(draft.fees) ?? 0, exitPrice: null, resolution: null, closedOn: null, note: draft.note.trim(),
    };
    const problem = positionProblem(p) ?? (positions.length >= LIMITS.positions ? "You have the most positions a desk holds." : null);
    if (problem) { setError(problem); return; }
    const err = await save([p, ...positions]);
    if (err) setError(err); else { setDraft(null); setError(null); }
  };
  const close = (p: Position, patch: Partial<Position>) => void save(positions.map(x => (x.id === p.id ? { ...x, ...patch, closedOn: new Date().toISOString().slice(0, 10) } : x)));

  return (
    <section aria-labelledby="fl-pos-h" data-testid="fl-positions">
      <div className="fl-head">
        <h2 id="fl-pos-h" className="fl-h2">Positions</h2>
        <p className="fl-sub">Log what you hold by hand: shares or event contracts. Each position lists every Form 4 and 8-K filed for its companies since you entered. Insidir never connects to a broker or a venue account.</p>
        <div className="fl-inline">
          <button type="button" className="fl-btn" onClick={() => setDraft(blank("equity"))}>Log shares</button>
          <button type="button" className="fl-btn" onClick={() => setDraft(blank("event"))}>Log an event contract</button>
        </div>
      </div>
      {draft ? <PositionForm d={draft} set={setDraft} onSave={add} onCancel={() => { setDraft(null); setError(null); }} error={error} /> : null}

      {!positions.length ? <p className="fl-empty">No positions logged.</p> : (
        <table className="fl-table" data-testid="fl-pos-table">
          <thead><tr><th scope="col">Position</th><th scope="col">Side</th><th scope="col" className="fl-num">Qty</th><th scope="col" className="fl-num">Entry</th><th scope="col">Your mark</th><th scope="col" className="fl-num">P&amp;L</th><th scope="col"><span className="fl-sr">Actions</span></th></tr></thead>
          <tbody>
            {positions.map(p => {
              const isEvent = p.kind === "event";
              const typed = parseInput(marks[p.id] ?? "");
              const mark = typed === null ? null : isEvent ? typed / 100 : typed;
              const pnl = positionPnl(p, mark);
              const closed = p.exitPrice !== null || p.resolution !== null;
              return (
                <tr key={p.id}>
                  <td>
                    <button type="button" className="fl-link fl-linkbtn" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
                      {isEvent ? `${p.venue === "kalshi" ? "Kalshi" : p.venue === "polymarket" ? "Polymarket" : "Other"}: ${p.label}` : p.tickers[0]}
                    </button>
                    <span className="fl-small"> {isEvent && p.tickers.length ? `Linked: ${p.tickers.join(", ")} · ` : ""}since {day(p.entryDate)}{closed ? ` · closed ${day(p.closedOn)}` : ""}</span>
                  </td>
                  <td>{p.side}</td>
                  <td className="fl-num">{qty(p.quantity)}</td>
                  <td className="fl-num">{isEvent ? `${Math.round(p.entryPrice * 100)}¢` : price(p.entryPrice)}</td>
                  <td>{closed ? (p.resolution ? `Resolved ${p.resolution}` : price(p.exitPrice!)) : (
                    <label><span className="fl-sr">Your mark for this position</span>
                      <input className="fl-input fl-input--num" inputMode="decimal" placeholder={isEvent ? "¢" : "$"} value={marks[p.id] ?? ""} onChange={e => setMarks(m => ({ ...m, [p.id]: e.target.value }))} /></label>
                  )}</td>
                  <td className="fl-num fl-mono">{pnl === null ? "Type a mark" : signedUsd(pnl)}</td>
                  <td>
                    {!closed ? <CloseControls p={p} onClose={patch => close(p, patch)} /> : null}
                    <button type="button" className="fl-btn fl-btn--ghost" onClick={() => { if (confirm("Delete this position?")) void save(positions.filter(x => x.id !== p.id)); }}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {positions.length ? <CalcLine /> : null}
      {open ? <PaperTrail p={positions.find(p => p.id === open)!} /> : null}
      <EvCalculator />
    </section>
  );
}

function PositionForm({ d, set, onSave, onCancel, error }: { d: Draft; set: (d: Draft) => void; onSave: () => void; onCancel: () => void; error: string | null }) {
  const isEvent = d.kind === "event";
  const up = (patch: Partial<Draft>) => set({ ...d, ...patch });
  return (
    <form className="fl-form" onSubmit={e => { e.preventDefault(); onSave(); }} data-testid="fl-pos-form">
      <h3 className="fl-h3">{isEvent ? "Log an event contract" : "Log shares"}</h3>
      {isEvent ? (
        <div className="fl-grid">
          <label className="fl-field">Venue
            <select className="fl-input" value={d.venue ?? "kalshi"} onChange={e => up({ venue: e.target.value as Position["venue"] })}>
              <option value="kalshi">Kalshi</option><option value="polymarket">Polymarket</option><option value="other">Other</option>
            </select></label>
          <label className="fl-field">Contract, as you'd name it<input className="fl-input" maxLength={200} value={d.label} onChange={e => up({ label: e.target.value })} /></label>
          <label className="fl-field">Side<select className="fl-input" value={d.side} onChange={e => up({ side: e.target.value as Position["side"] })}><option value="yes">Yes</option><option value="no">No</option></select></label>
        </div>
      ) : (
        <div className="fl-grid">
          <label className="fl-field">Side<select className="fl-input" value={d.side} onChange={e => up({ side: e.target.value as Position["side"] })}><option value="long">Long</option><option value="short">Short</option></select></label>
        </div>
      )}
      <div className="fl-field">
        <span>{isEvent ? "Companies whose filings matter to this contract (optional)" : "Ticker"}</span>
        <TickerSearch label={isEvent ? "Link a ticker" : "Pick the ticker"} action={isEvent ? "Link" : "Pick"} onPick={h => up({ tickers: isEvent ? [...new Set([...d.tickers, h.ticker])].slice(0, 10) : [h.ticker] })} />
        {d.tickers.length ? <p className="fl-inline">{d.tickers.map(t => <span key={t} className="fl-chip">{t} <button type="button" className="fl-x" aria-label={`Remove ${t}`} onClick={() => up({ tickers: d.tickers.filter(x => x !== t) })}>×</button></span>)}</p> : null}
      </div>
      <div className="fl-grid">
        <label className="fl-field">{isEvent ? "Contracts" : "Shares"}<input className="fl-input fl-input--num" inputMode="decimal" value={d.quantity} onChange={e => up({ quantity: e.target.value })} /></label>
        <label className="fl-field">{isEvent ? "Entry price (¢)" : "Entry price ($ per share)"}<input className="fl-input fl-input--num" inputMode="decimal" value={d.entryPrice} onChange={e => up({ entryPrice: e.target.value })} /></label>
        <label className="fl-field">Entry date<input className="fl-input" type="date" value={d.entryDate} onChange={e => up({ entryDate: e.target.value })} /></label>
        <label className="fl-field">Fees ($ total, optional)<input className="fl-input fl-input--num" inputMode="decimal" value={d.fees} onChange={e => up({ fees: e.target.value })} /></label>
      </div>
      <label className="fl-field">Note (optional)<input className="fl-input" maxLength={2000} value={d.note} onChange={e => up({ note: e.target.value })} /></label>
      {error ? <p className="fl-error" role="alert">{error}</p> : null}
      <div className="fl-inline"><button type="submit" className="fl-btn">Save position</button><button type="button" className="fl-btn fl-btn--ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function CloseControls({ p, onClose }: { p: Position; onClose: (patch: Partial<Position>) => void }) {
  const [v, setV] = useState("");
  if (p.kind === "event") {
    return (
      <label className="fl-inline"><span className="fl-small">Resolved</span>
        <select className="fl-input" value="" onChange={e => e.target.value && onClose({ resolution: e.target.value as Position["resolution"] })}>
          <option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option><option value="void">Void</option>
        </select></label>
    );
  }
  return (
    <form className="fl-inline" onSubmit={e => { e.preventDefault(); const x = parseInput(v); if (x !== null && x > 0) onClose({ exitPrice: x }); }}>
      <label><span className="fl-sr">Exit price</span><input className="fl-input fl-input--num" inputMode="decimal" placeholder="Exit $" value={v} onChange={e => setV(e.target.value)} /></label>
      <button type="submit" className="fl-btn fl-btn--ghost" disabled={parseInput(v) === null}>Close</button>
    </form>
  );
}

/** Every stored Form 4 and 8-K for the position's companies from 90 days before entry, with the member's own entry
 *  and exit on the same timeline (marked as theirs). */
function PaperTrail({ p }: { p: Position }) {
  const t = useTickers(true);
  const [rows, setRows] = useState<FilingRow[] | null>(null);
  const ciks = useMemo(() => p.tickers.map(x => t.byTicker.get(x)?.cik).filter((c): c is string => Boolean(c)), [p.tickers, t.byTicker]);
  useEffect(() => {
    if (!t.ready) return;
    let live = true;
    void Promise.all(ciks.map(c => api<{ filings: FilingRow[] }>(`/api/filings/company/${c}`).then(r => r.filings).catch(() => [] as FilingRow[])))
      .then(all => { if (live) setRows(all.flat()); });
    return () => { live = false; };
  }, [ciks, t.ready]);
  const from = new Date(Date.parse(`${p.entryDate}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  type Item = { at: string; key: string; you: boolean; title: string; sub: string; url?: string };
  const items: Item[] = [
    { at: p.entryDate, key: "entry", you: true, title: "Your entry", sub: `${p.side} ${qty(p.quantity)} at ${p.kind === "event" ? `${Math.round(p.entryPrice * 100)}¢` : price(p.entryPrice)}` },
    ...(p.closedOn ? [{ at: p.closedOn, key: "exit", you: true, title: "Your close", sub: p.resolution ? `Resolved ${p.resolution}` : `Exit at ${price(p.exitPrice ?? 0)}` }] : []),
    ...(rows ?? []).filter(f => f.filedOn >= from).map(f => ({ at: f.filedOn, key: f.accession, you: false, title: filingTitle(f), sub: `${filingDetail(f)} · accepted ${etStamp(f.acceptedAt)}`, url: f.url })),
  ].sort((a, b) => b.at.localeCompare(a.at) || Number(a.you) - Number(b.you));
  return (
    <section className="fl-trail" aria-label="Paper trail" data-testid="fl-trail">
      <h3 className="fl-h3">Paper trail{p.tickers.length ? `: ${p.tickers.join(", ")}` : ""}</h3>
      {!p.tickers.length ? <p className="fl-empty">Link a company to this contract to see its filings here.</p> : rows === null ? <p className="fl-small">Loading…</p> : (
        <ol className="fl-timeline">
          {items.map(i => (
            <li key={i.key} className={`fl-timeline__item${i.you ? " is-you" : ""}`}>
              <span className="fl-small">{day(i.at)}</span>
              <span>{i.title}{i.you ? <span className="fl-chip">you</span> : null}</span>
              <span className="fl-small">{i.sub}</span>
              {i.url ? <a className="fl-link" href={i.url} target="_blank" rel="noopener noreferrer">sec.gov ↗</a> : null}
            </li>
          ))}
        </ol>
      )}
      <p className="fl-small">Filings since {day(from)} that Insidir has stored.</p>
    </section>
  );
}
