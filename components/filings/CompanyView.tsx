"use client";
/* The company report (docs/RESEARCH-DESK.md §6): official records on the left, the member's private journal on the
 * right. "+ Note" on any filing or Stream match opens the composer anchored to it. The journal saves as one document
 * per company, debounced, guarded by its version so two tabs can't overwrite each other silently. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LIMITS } from "@/lib/filings/limits";
import { day, etStamp, usd } from "@/lib/filings/format";
import type { AnomalyRow, FilingRow, Journal, JournalNote, ThesisStatus } from "@/lib/filings/types";
import { FilingItem } from "./Bits";
import { api, useDebouncedSave, type SaveState } from "./hooks";

const STATUSES: Array<[ThesisStatus, string]> = [["researching", "Researching"], ["watching", "Watching"], ["passed", "Passed"]];
type Anchor = JournalNote["anchor"];
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${performance.now().toString(36)}`);

export function CompanyView({ cik, ticker, title, pinned, onPin, onJournal, held }: {
  cik: string; ticker: string; title: string; pinned: boolean; onPin: () => void; onJournal: (j: Journal) => void; held: boolean;
}) {
  const [data, setData] = useState<{ filings: FilingRow[]; anomalies: AnomalyRow[]; journal: Journal | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<"all" | "4" | "8-K">("all");
  const [onlyP, setOnlyP] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>(null);

  const load = useCallback(async () => {
    try { setData(await api(`/api/filings/company/${cik}`)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [cik]);
  useEffect(() => { void load(); }, [load]);

  const filings = useMemo(() => (data?.filings ?? []).filter(f => (form === "all" || f.form.startsWith(form)) && (!onlyP || (f.payload.kind === "4" && f.payload.codes.includes("P")))), [data, form, onlyP]);

  return (
    <div className="fl-company" data-testid="fl-company">
      <header className="fl-company__head">
        <div>
          <h2 className="fl-h2"><span className="fl-mono">{ticker}</span> {title}</h2>
          <p className="fl-small">SEC CIK {cik} · <a className="fl-link" href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}`} target="_blank" rel="noopener noreferrer">All filings on EDGAR ↗</a></p>
        </div>
        <button type="button" className="fl-btn" onClick={onPin} disabled={pinned}>{pinned ? "On a watchlist" : "Pin to watchlist"}</button>
      </header>

      <div className="fl-split">
        <section className="fl-split__main" aria-labelledby="fl-rec-h">
          <h3 id="fl-rec-h" className="fl-h3">Public records</h3>
          <div className="fl-filters" role="group" aria-label="Filter filings">
            {(["all", "4", "8-K"] as const).map(f => <button key={f} type="button" className={`fl-tab${form === f ? " is-on" : ""}`} aria-pressed={form === f} onClick={() => setForm(f)}>{f === "all" ? "All" : f === "4" ? "Form 4" : "8-K"}</button>)}
            <label className="fl-toggle"><input type="checkbox" checked={onlyP} onChange={e => setOnlyP(e.target.checked)} />Code P only</label>
          </div>
          {error ? <p className="fl-empty">{error}</p> : !data ? <p className="fl-small">Loading…</p> : (
            <>
              {data.anomalies.length ? (
                <ul className="fl-list">
                  {data.anomalies.map(a => (
                    <li key={a.id} className="fl-row">
                      <div className="fl-row__main">
                        <p className="fl-row__title"><span className="fl-kind">{a.kind === "cluster" ? "Cluster" : a.kind === "whale" ? "Whale purchase" : "Filing velocity"}</span> {day(a.windowStart)} to {day(a.windowEnd)}{a.total !== null ? ` · ${usd(a.total)} as filed` : ""}</p>
                        <p className="fl-row__meta">Matched {etStamp(a.detectedAt)} · rule v{a.ruleVersion}</p>
                      </div>
                      <div className="fl-row__side"><button type="button" className="fl-btn fl-btn--ghost" onClick={() => setAnchor({ kind: "anomaly", ref: String(a.id), label: `${a.kind} ${a.windowStart}`, url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4` })}>+ Note</button></div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!filings.length ? <p className="fl-empty">No Form 4 or 8-K stored for {ticker} yet{form !== "all" || onlyP ? " with these filters" : ""}. Insidir keeps every one filed from the day collection started.</p> : (
                <ul className="fl-list">
                  {filings.map(f => <FilingItem key={f.id} f={f} held={held} action={
                    <button type="button" className="fl-btn fl-btn--ghost" onClick={() => setAnchor({ kind: "filing", ref: f.accession, label: `Form ${f.form} · ${f.filedOn}`, url: f.url })}>+ Note</button>} />)}
                </ul>
              )}
            </>
          )}
        </section>
        <aside className="fl-split__side" aria-labelledby="fl-j-h">
          {data ? <JournalPanel key={`${cik}:${data.journal?.version ?? 0}`} cik={cik} ticker={ticker} initial={data.journal} anchor={anchor} clearAnchor={() => setAnchor(null)} onSaved={onJournal} onConflict={load} /> : null}
        </aside>
      </div>
    </div>
  );
}

export function JournalPanel({ cik, ticker, initial, anchor, clearAnchor, onSaved, onConflict }: {
  cik: string; ticker: string; initial: Journal | null; anchor: Anchor; clearAnchor: () => void; onSaved: (j: Journal) => void; onConflict: () => void;
}) {
  const [j, setJ] = useState<Journal>(initial ?? { cik, ticker, status: null, history: [], notes: [], version: 0, updatedAt: 0 });
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  // The stored version and a not-yet-saved pass reason live in refs: a save in flight or coalesced edits must not
  // send a stale version (409) or drop the reason.
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
      setSave("error");
      setMsg((e as Error).message);
      if ((e as { status?: number }).status === 409) onConflict();
    }
  }, [cik, ticker, onSaved, onConflict]);
  const saver = useDebouncedSave(persist, 800);
  const commit = (next: Journal, why: string | null = null) => {
    if (why !== null) pendingReason.current = why;
    setJ(next);
    saver.queue({ ...next, reason: pendingReason.current });
  };

  const addNote = () => {
    const body = draft.trim();
    if (!body || j.notes.length >= LIMITS.notesPerCompany) return;
    const now = Date.now();
    commit({ ...j, notes: [{ id: newId(), body: body.slice(0, LIMITS.noteChars), anchor, pinned: false, createdAt: now, updatedAt: now }, ...j.notes] });
    setDraft(""); clearAnchor();
  };
  const notes = [...j.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);

  return (
    <div className="fl-journal" data-testid="fl-journal">
      <h3 id="fl-j-h" className="fl-h3">Your journal <span className="fl-small">private to you</span></h3>
      <div className="fl-seg" role="radiogroup" aria-label="Your status on this company">
        {STATUSES.map(([s, label]) => (
          <button key={s} type="button" role="radio" aria-checked={j.status === s} className={`fl-seg__btn${j.status === s ? " is-on" : ""}`}
            onClick={() => {
              if (s === "passed" && j.status !== "passed") { setAsking(true); return; }
              setAsking(false);
              commit({ ...j, status: j.status === s ? null : s });
            }}>{label}</button>
        ))}
      </div>
      {asking ? (
        <form className="fl-compose" onSubmit={e => { e.preventDefault(); setAsking(false); commit({ ...j, status: "passed" }, reason.trim() || null); setReason(""); }}>
          <label className="fl-field">Why you passed (optional, kept in your status history)
            <input className="fl-input" maxLength={LIMITS.reason} value={reason} onChange={e => setReason(e.target.value)} autoFocus />
          </label>
          <div className="fl-inline">
            <button type="submit" className="fl-btn">Mark passed</button>
            <button type="button" className="fl-btn fl-btn--ghost" onClick={() => { setAsking(false); setReason(""); }}>Cancel</button>
          </div>
        </form>
      ) : null}
      {j.history.length ? (
        <details className="fl-history"><summary>Status history ({j.history.length})</summary>
          <ol>{[...j.history].reverse().map((h, i) => <li key={i} className="fl-small">{h.from ?? "None"} → {h.to ?? "None"} · {etStamp(h.at)}{h.reason ? ` · "${h.reason}"` : ""}</li>)}</ol>
        </details>
      ) : null}

      <form className="fl-compose" onSubmit={e => { e.preventDefault(); addNote(); }}>
        {anchor ? <p className="fl-chip">Beside: {anchor.label} <button type="button" className="fl-x" aria-label="Remove anchor" onClick={clearAnchor}>×</button></p> : null}
        <label className="fl-sr" htmlFor={`fl-note-${cik}`}>New note</label>
        <textarea id={`fl-note-${cik}`} className="fl-input fl-textarea" rows={4} maxLength={LIMITS.noteChars} placeholder="Write a note. Only you can see it." value={draft} onChange={e => setDraft(e.target.value)} />
        <div className="fl-inline">
          <button type="submit" className="fl-btn" disabled={!draft.trim()}>Add note</button>
          <span className="fl-small" role="status">{save === "saving" || saver.pending ? "Saving…" : save === "saved" ? "Saved" : msg ?? ""}</span>
        </div>
      </form>

      {!notes.length ? <p className="fl-empty">No notes yet. Use + Note beside a filing to keep a note next to the record it is about.</p> : (
        <ul className="fl-notes">
          {notes.map(n => (
            <li key={n.id} className="fl-note" data-testid="fl-note">
              {n.anchor ? <a className="fl-chip" href={n.anchor.url} target="_blank" rel="noopener noreferrer">{n.anchor.label} ↗</a> : null}
              <p className="fl-note__body">{n.body}</p>
              <p className="fl-small">{etStamp(n.createdAt)}{n.updatedAt !== n.createdAt ? " · edited" : ""}</p>
              <div className="fl-inline">
                <button type="button" className="fl-btn fl-btn--ghost" onClick={() => commit({ ...j, notes: j.notes.map(x => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)) })}>{n.pinned ? "Unpin" : "Pin to top"}</button>
                <button type="button" className="fl-btn fl-btn--ghost" onClick={() => { if (confirm("Delete this note?")) commit({ ...j, notes: j.notes.filter(x => x.id !== n.id) }); }}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
