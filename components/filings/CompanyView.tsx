"use client";
/* The company report (docs/RESEARCH-DESK.md §6), terminal split: the company's filings and the selected filing as a
 * document on the left; the member's private journal on the right. Notes anchor to a filing (N, or "+ Note"); an
 * anchor opens its filing on the left. Editing a note keeps its earlier versions (the last LIMITS.noteRevisions).
 * The journal saves optimistically as one document per company, debounced, guarded by its version. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { day, etStamp, usd } from "@/lib/filings/format";
import { LIMITS } from "@/lib/filings/limits";
import type { AnomalyRow, FilingRow, Journal, JournalNote, ThesisStatus } from "@/lib/filings/types";
import { FilingCells, FilingDoc } from "./FilingDoc";
import { Kbd } from "./Bits";
import { api, useDebouncedSave, useHotkeys, type SaveState } from "./hooks";
import { VTable } from "./VTable";

const STATUSES: Array<[ThesisStatus, string]> = [["researching", "Researching"], ["watching", "Watching"], ["passed", "Passed"]];
type Anchor = JournalNote["anchor"];
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${performance.now().toString(36)}`);
const rowKey = (f: FilingRow) => f.accession;
const HEAD = <><span>Date</span><span>Form</span><span>Codes</span><span>Reporting / items</span><span className="fl-n">P / S value</span></>;
const anchorOf = (f: FilingRow): Anchor => ({ kind: "filing", ref: f.accession, label: `${f.form} · ${f.filedOn}`, url: f.url });

export function CompanyView({ cik, ticker, title, pinned, onPin, onJournal, held, journalRef, noteFor }: {
  cik: string; ticker: string; title: string; pinned: boolean; onPin: () => void; onJournal: (j: Journal) => void; held: boolean;
  journalRef: React.RefObject<HTMLTextAreaElement | null>; noteFor: string | null;
}) {
  const [data, setData] = useState<{ filings: FilingRow[]; anomalies: AnomalyRow[]; journal: Journal | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Anchor>(null);
  const load = useCallback(async () => {
    try { setData(await api(`/api/filings/company/${cik}`, { method: "GET" })); setError(null); } catch (e) { setError((e as Error).message); }
  }, [cik]);
  useEffect(() => { void load(); }, [load]);
  // Arriving from "+ Note" elsewhere (?note=<accession>): open that filing and anchor the composer to it.
  useEffect(() => {
    const f = noteFor ? data?.filings.find(x => x.accession === noteFor) : null;
    if (f) { setSel(f.accession); setAnchor(anchorOf(f)); journalRef.current?.focus(); }
  }, [data, noteFor, journalRef]);
  const filings = data?.filings ?? [];
  const selected = useMemo(() => filings.find(f => f.accession === sel) ?? filings[0] ?? null, [filings, sel]);
  const note = useCallback((f: FilingRow) => { setAnchor(anchorOf(f)); journalRef.current?.focus(); }, [journalRef]);
  useHotkeys({ n: () => { if (selected) note(selected); } });
  const render = useCallback((f: FilingRow) => <FilingCells f={f} mode="co" />, []);
  const onSelect = useCallback((f: FilingRow) => setSel(f.accession), []);

  return (
    <div className="fl-split fl-split--doc" data-testid="fl-company">
      <section className="fl-pane" aria-label="Public records">
        <div className="fl-pane__bar">
          <span className="fl-tk">{ticker}</span><h2 className="fl-h">{title}</h2>
          <a className="fl-link fl-faint fl-mono" href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}`} target="_blank" rel="noopener noreferrer">CIK {cik} ↗</a>
          <button type="button" className="fl-btn fl-btn--ghost" onClick={onPin} disabled={pinned}>{pinned ? "On a watchlist" : "Pin"}</button>
        </div>
        {data?.anomalies.length ? (
          <div className="fl-filters">
            <span className="fl-label">Stream</span>
            {data.anomalies.slice(0, 4).map(a => <span key={a.id} className="fl-tag" title={`Detected ${etStamp(a.detectedAt)}`}>{a.kind} {a.windowStart.slice(5)}{a.total !== null ? ` · ${usd(a.total)}` : ""}</span>)}
          </div>
        ) : null}
        <div className="fl-co-list">
          <VTable rows={filings} cols="fl-cols-co" head={HEAD} render={render} rowKey={rowKey} selected={selected?.accession ?? null} onSelect={onSelect} label={`${ticker} filings`}
            empty={error ?? (data ? `No Form 4 or 8-K stored for ${ticker} yet. Insidir keeps every one filed from the day collection started.` : "Loading…")} />
        </div>
        <div className="fl-co-doc">{selected ? <FilingDoc f={selected} held={held} onNote={note} /> : null}</div>
      </section>
      <aside className="fl-pane fl-pane--2" aria-label="Your journal">
        {data ? <JournalPanel key={`${cik}:${data.journal?.version ?? 0}`} cik={cik} ticker={ticker} initial={data.journal} anchor={anchor} clearAnchor={() => setAnchor(null)}
          onSaved={onJournal} onConflict={load} openAnchor={ref => setSel(ref)} composer={journalRef} /> : <p className="fl-empty">Loading your journal…</p>}
      </aside>
    </div>
  );
}

function JournalPanel({ cik, ticker, initial, anchor, clearAnchor, onSaved, onConflict, openAnchor, composer }: {
  cik: string; ticker: string; initial: Journal | null; anchor: Anchor; clearAnchor: () => void; onSaved: (j: Journal) => void; onConflict: () => void;
  openAnchor: (accession: string) => void; composer: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [j, setJ] = useState<Journal>(initial ?? { cik, ticker, status: null, history: [], notes: [], version: 0, updatedAt: 0 });
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [revsOpen, setRevsOpen] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  // The stored version and a not-yet-saved pass reason live in refs: a save in flight or coalesced edits must not send
  // a stale version (409) or drop the reason.
  const version = useRef(initial?.version ?? 0);
  const pendingReason = useRef<string | null>(null);

  const persist = useCallback(async (next: Journal & { reason: string | null }) => {
    setSave("saving");
    try {
      const r = await api<{ journal: Journal }>(`/api/filings/journal/${cik}`, { method: "PUT", body: JSON.stringify({ ticker, status: next.status, reason: next.reason, notes: next.notes, version: version.current }) });
      version.current = r.journal.version;
      pendingReason.current = null;
      setJ(cur => ({ ...cur, version: r.journal.version, history: r.journal.history, updatedAt: r.journal.updatedAt }));
      onSaved(r.journal); setSave("saved"); setMsg(null);
    } catch (e) {
      setSave("error"); setMsg((e as Error).message);
      if ((e as { status?: number }).status === 409) onConflict();
    }
  }, [cik, ticker, onSaved, onConflict]);
  const saver = useDebouncedSave(persist, 700);
  const commit = (next: Journal, why: string | null = null) => {
    if (why !== null) pendingReason.current = why;
    setJ(next);
    saver.queue({ ...next, reason: pendingReason.current });
  };

  const add = () => {
    const body = draft.trim();
    if (!body || j.notes.length >= LIMITS.notesPerCompany) return;
    const now = Date.now();
    commit({ ...j, notes: [{ id: newId(), body: body.slice(0, LIMITS.noteChars), anchor, pinned: false, createdAt: now, updatedAt: now }, ...j.notes] });
    setDraft(""); clearAnchor();
  };
  const saveEdit = () => {
    if (!editing) return;
    const body = editing.body.trim().slice(0, LIMITS.noteChars);
    const now = Date.now();
    commit({ ...j, notes: j.notes.map(n => (n.id !== editing.id || n.body === body || !body ? n
      : { ...n, body, updatedAt: now, revisions: [...(n.revisions ?? []), { body: n.body, at: now }].slice(-LIMITS.noteRevisions) })) });
    setEditing(null);
  };
  const notes = [...j.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);

  return (
    <div className="fl-doc" data-testid="fl-journal">
      <div className="fl-pane__bar">
        <h2 className="fl-h">Journal <span className="fl-faint">· private</span></h2>
        <span className="fl-faint fl-mono" role="status">{save === "saving" || saver.pending ? "saving" : save === "saved" ? "saved" : ""}</span>
      </div>
      <div className="fl-section fl-row-gap">
        <div className="fl-seg" role="radiogroup" aria-label="Your status on this company">
          {STATUSES.map(([s, label]) => (
            <button key={s} type="button" role="radio" aria-checked={j.status === s} className="fl-seg__b"
              onClick={() => {
                if (s === "passed" && j.status !== "passed") { setAsking(true); return; }
                setAsking(false);
                commit({ ...j, status: j.status === s ? null : s });
              }}>{label}</button>
          ))}
        </div>
        {j.history.length ? <details><summary className="fl-faint fl-mono">history · {j.history.length}</summary>
          <ol className="fl-history">{[...j.history].reverse().map((h, i) => <li key={i}>{new Date(h.at).toISOString().slice(0, 16).replace("T", " ")}Z {h.from ?? "none"} → {h.to ?? "none"}{h.reason ? ` · "${h.reason}"` : ""}</li>)}</ol>
        </details> : null}
      </div>
      {asking ? (
        <form className="fl-section fl-row-gap" onSubmit={e => { e.preventDefault(); setAsking(false); commit({ ...j, status: "passed" }, reason.trim() || null); setReason(""); }}>
          <label className="fl-field"><span className="fl-label">Why you passed (optional, kept in history)</span>
            <input className="fl-in" maxLength={LIMITS.reason} value={reason} onChange={e => setReason(e.target.value)} autoFocus /></label>
          <button type="submit" className="fl-btn">Mark passed</button>
          <button type="button" className="fl-btn fl-btn--ghost" onClick={() => { setAsking(false); setReason(""); }}>Cancel</button>
        </form>
      ) : null}

      <form className="fl-section" onSubmit={e => { e.preventDefault(); add(); }}>
        {anchor ? <p className="fl-row-gap"><span className="fl-anchor">⌖ {anchor.label}</span><button type="button" className="fl-x" aria-label="Remove anchor" onClick={clearAnchor}>✕</button></p> : null}
        <label className="fl-sr" htmlFor={`fl-note-${cik}`}>New note</label>
        <textarea ref={composer} id={`fl-note-${cik}`} className="fl-in fl-in--area" maxLength={LIMITS.noteChars} placeholder="Write a note. Only you can see it. ⌘↵ to add."
          value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }} />
        <div className="fl-row-gap">
          <button type="submit" className="fl-btn" disabled={!draft.trim()}>Add note</button>
          <span className="fl-faint"><Kbd k="J" /> write · <Kbd k="N" /> note on the open filing</span>
          {msg ? <span className="fl-error">{msg}</span> : null}
        </div>
      </form>

      <div className="fl-pane__scroll">
        {!notes.length ? <p className="fl-empty">No notes yet. Press N on a filing to write beside it.</p> : (
          <ul className="fl-notes">
            {notes.map(n => (
              <li key={n.id} className={`fl-note${n.pinned ? " fl-note--pin" : ""}`} data-testid="fl-note">
                <div className="fl-note__meta">
                  {n.anchor ? <button type="button" className="fl-anchor fl-x" onClick={() => n.anchor && openAnchor(n.anchor.ref)} title="Open this filing">⌖ {n.anchor.label}</button> : null}
                  <span className="fl-faint fl-mono">{day(new Date(n.createdAt).toISOString().slice(0, 10))}{n.updatedAt !== n.createdAt ? " · edited" : ""}</span>
                  {n.pinned ? <span className="fl-tag">pinned</span> : null}
                </div>
                {editing?.id === n.id ? (
                  <form onSubmit={e => { e.preventDefault(); saveEdit(); }}>
                    <textarea className="fl-in fl-in--area" value={editing.body} maxLength={LIMITS.noteChars} autoFocus aria-label="Edit note"
                      onChange={e => setEditing({ id: n.id, body: e.target.value })} onKeyDown={e => { if (e.key === "Escape") setEditing(null); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); } }} />
                    <div className="fl-row-gap"><button type="submit" className="fl-btn">Save</button><button type="button" className="fl-btn fl-btn--ghost" onClick={() => setEditing(null)}>Cancel</button></div>
                  </form>
                ) : <p className="fl-note__body">{n.body}</p>}
                {revsOpen === n.id && n.revisions?.length ? (
                  <ol className="fl-revs" aria-label="Earlier versions">{[...n.revisions].reverse().map((r, i) => <li key={i}><span className="fl-mono fl-faint">replaced {etStamp(r.at)}</span>{"\n"}{r.body}</li>)}</ol>
                ) : null}
                <div className="fl-note__acts">
                  <button type="button" className="fl-x" onClick={() => setEditing({ id: n.id, body: n.body })}>Edit</button>
                  {n.revisions?.length ? <button type="button" className="fl-x" aria-expanded={revsOpen === n.id} onClick={() => setRevsOpen(revsOpen === n.id ? null : n.id)}>Versions · {n.revisions.length}</button> : null}
                  <button type="button" className="fl-x" onClick={() => commit({ ...j, notes: j.notes.map(x => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)) })}>{n.pinned ? "Unpin" : "Pin"}</button>
                  <button type="button" className="fl-x" onClick={() => { if (confirm("Delete this note and its versions?")) commit({ ...j, notes: j.notes.filter(x => x.id !== n.id) }); }}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
