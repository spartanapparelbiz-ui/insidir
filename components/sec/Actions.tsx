"use client";
/* The SEC pages' controls (docs/INSIDIR-V3.md §3): add a company or a person to a watchlist, edit watchlists, the alert
 * inbox's mark-read, and the research journal panel. Each posts to its API route and refreshes the page. */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Msg = { kind: "idle" | "busy" | "ok" | "error"; text?: string };
async function post(url: string, body: unknown, method = "POST"): Promise<{ ok: boolean; error?: string; message?: string; items?: unknown }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as { error?: string; message?: string; items?: unknown } | null;
  return { ok: Boolean(res?.ok), ...json };
}
const Note = ({ m }: { m: Msg }) => (m.text ? <p className="sec-msg" role={m.kind === "error" ? "alert" : "status"}>{m.text}</p> : null);

export interface ListLite { id: number; name: string }

/** "Add to watchlist" on a company or a person page. */
export function WatchButton({ kind, cik, label, lists }: { kind: "company" | "person"; cik: string; label: string; lists: ListLite[] }) {
  const router = useRouter();
  const [list, setList] = useState(lists[0] ? String(lists[0].id) : "new");
  const [m, setM] = useState<Msg>({ kind: "idle" });
  async function add(e: FormEvent) {
    e.preventDefault();
    setM({ kind: "busy" });
    const r = await post("/api/watchlists", { action: "add", list: list === "new" ? null : Number(list), kind, cik, label });
    setM(r.ok ? { kind: "ok", text: r.message ?? "Added." } : { kind: "error", text: r.error ?? "Couldn't add that now." });
    if (r.ok) router.refresh();
  }
  return (
    <form className="sec-row" onSubmit={add} data-testid="watch-form">
      <label className="sr-only" htmlFor={`watch-${kind}-${cik}`}>Watchlist</label>
      <select id={`watch-${kind}-${cik}`} value={list} onChange={e => setList(e.target.value)}>
        {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        <option value="new">New watchlist</option>
      </select>
      <button className="sec-btn" disabled={m.kind === "busy"}>Add to watchlist</button>
      <Note m={m} />
    </form>
  );
}

export interface ListFull { id: number; name: string; forms: string[]; items: Array<{ kind: "company" | "person"; cik: string; label: string }> }

/** Every watchlist, editable: name, which forms alert, what's on it. */
export function WatchlistEditor({ lists, families }: { lists: ListFull[]; families: Array<[string, string]> }) {
  const router = useRouter();
  const [m, setM] = useState<Msg>({ kind: "idle" });
  const [name, setName] = useState("");
  async function act(body: Record<string, unknown>, done?: string) {
    setM({ kind: "busy" });
    const r = await post("/api/watchlists", body);
    setM(r.ok ? { kind: "ok", text: done ?? r.message ?? "Saved." } : { kind: "error", text: r.error ?? "Couldn't save that now." });
    if (r.ok) router.refresh();
    return r;
  }
  return (
    <div data-testid="watchlists">
      <form className="sec-row sec-panel" onSubmit={async e => { e.preventDefault(); if ((await act({ action: "create", name }, "Watchlist made.")).ok) setName(""); }}>
        <label className="sr-only" htmlFor="new-list">New watchlist name</label>
        <input id="new-list" value={name} onChange={e => setName(e.target.value)} placeholder="New watchlist name" maxLength={60} required />
        <button className="sec-btn" disabled={m.kind === "busy"}>Make a watchlist</button>
      </form>
      <Note m={m} />
      <div className="sec-lists">{lists.map(l => <ListCard key={l.id} list={l} families={families} act={act} />)}</div>
    </div>
  );
}

function ListCard({ list, families, act }: { list: ListFull; families: Array<[string, string]>; act: (b: Record<string, unknown>, done?: string) => Promise<{ ok: boolean }> }) {
  const [ticker, setTicker] = useState("");
  const [who, setWho] = useState("");
  // The boxes change on the click; the server's answer puts them back if the save fails.
  const [forms, setForms] = useState(list.forms);
  async function toggle(k: string, on: boolean) {
    const next = on ? [...new Set([...forms, k])] : forms.filter(f => f !== k);
    setForms(next);
    if (!(await act({ action: "forms", list: list.id, forms: next })).ok) setForms(forms);
  }
  const [found, setFound] = useState<Array<{ cik: string; name: string }>>([]);
  async function search(e: FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/watchlists?people=${encodeURIComponent(who)}`).then(r => r.json()).catch(() => null) as { items?: Array<{ cik: string; name: string }> } | null;
    setFound(res?.items ?? []);
  }
  return (
    <section className="sec-panel" data-testid="watchlist" aria-label={list.name}>
      <div className="sec-row">
        <h2 className="sec-h2">{list.name}</h2>
        <button type="button" className="sec-ghost" onClick={() => { if (confirm(`Delete "${list.name}"?`)) void act({ action: "delete", list: list.id }, "Deleted."); }}>Delete</button>
      </div>
      <fieldset className="sec-chips" aria-label="Signal me about">
        {families.map(([k, label]) => (
          <label key={k} className="sec-dim">
            <input type="checkbox" checked={forms.includes(k)} onChange={e => void toggle(k, e.target.checked)} /> {label}
          </label>
        ))}
      </fieldset>
      <ul className="sec-items">
        {list.items.length ? list.items.map(i => (
          <li key={`${i.kind}:${i.cik}`}>
            <a href={i.kind === "company" ? `/company/cik-${i.cik}` : `/people/${i.cik}`}>{i.label}</a>
            <button type="button" className="sec-ghost" onClick={() => void act({ action: "remove", list: list.id, kind: i.kind, cik: i.cik }, "Removed.")} aria-label={`Remove ${i.label}`}>Remove</button>
          </li>
        )) : <li className="sec-dim">Nothing on it yet.</li>}
      </ul>
      <form className="sec-row" onSubmit={async e => { e.preventDefault(); if ((await act({ action: "add", list: list.id, ticker }, "Added.")).ok) setTicker(""); }}>
        <label className="sr-only" htmlFor={`t-${list.id}`}>Ticker</label>
        <input id={`t-${list.id}`} value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="Ticker, e.g. NVDA" maxLength={10} required />
        <button className="sec-ghost">Add company</button>
      </form>
      <form className="sec-row" onSubmit={search}>
        <label className="sr-only" htmlFor={`p-${list.id}`}>Person</label>
        <input id={`p-${list.id}`} value={who} onChange={e => setWho(e.target.value)} placeholder="A person's name, as filed" maxLength={60} required />
        <button className="sec-ghost">Find person</button>
      </form>
      {found.length ? (
        <ul className="sec-items">{found.map(p => (
          <li key={p.cik}><span>{p.name} <span className="sec-dim">CIK {p.cik}</span></span>
            <button type="button" className="sec-ghost" onClick={() => void act({ action: "add", list: list.id, kind: "person", cik: p.cik, label: p.name }, "Added.").then(() => setFound([]))}>Add</button></li>
        ))}</ul>
      ) : null}
    </section>
  );
}

/** Mark every alert read. */
export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  return <button type="button" className="sec-ghost" disabled={disabled} data-testid="mark-read" onClick={async () => { await post("/api/sec-alerts", { all: true }); router.refresh(); }}>Mark all read</button>;
}

/** The journal panel on a company page: status and a private note. */
export function JournalPanel({ cik, status, note, updated }: { cik: string; status: string | null; note: string; updated: string | null }) {
  const router = useRouter();
  const [s, setS] = useState(status ?? "researching");
  const [n, setN] = useState(note);
  const [m, setM] = useState<Msg>({ kind: "idle" });
  async function save(e: FormEvent) {
    e.preventDefault();
    setM({ kind: "busy" });
    const r = await post("/api/journal", { cik, status: s, note: n });
    setM(r.ok ? { kind: "ok", text: "Saved. Only you can see this." } : { kind: "error", text: r.error ?? "Couldn't save that now." });
    if (r.ok) router.refresh();
  }
  async function remove() {
    const r = await post("/api/journal", { cik }, "DELETE");
    if (r.ok) { setN(""); setS("researching"); setM({ kind: "ok", text: "Removed from your journal." }); router.refresh(); }
  }
  return (
    <form className="sec-panel" onSubmit={save} data-testid="journal-panel">
      <div className="sec-row">
        <label htmlFor={`js-${cik}`} className="sec-dim">Status</label>
        <select id={`js-${cik}`} value={s} onChange={e => setS(e.target.value)}>
          <option value="researching">Researching</option><option value="watching">Watching</option><option value="passed">Passed</option>
        </select>
      </div>
      <label htmlFor={`jn-${cik}`} className="sec-dim">Private note</label>
      <textarea id={`jn-${cik}`} value={n} onChange={e => setN(e.target.value)} maxLength={5000} placeholder="Only you can see this." />
      <div className="sec-actions">
        <button className="sec-btn" disabled={m.kind === "busy"}>Save to journal</button>
        {status ? <button type="button" className="sec-ghost" onClick={remove}>Remove</button> : null}
        {updated ? <span className="sec-dim">Last saved {updated}</span> : null}
      </div>
      <Note m={m} />
    </form>
  );
}
