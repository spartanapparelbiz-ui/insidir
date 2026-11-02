"use client";
/* The glass ask-pill: paste a Polymarket or Kalshi link, or type the market. POSTs to /api/read and opens the Read;
 * offers three when it could be more than one market; the visitor's one free Read is the API's rule (402 → /go). The
 * chips under it are the busiest markets right now (panel pills): one tap reads that market. */
import { useRef, useState, type CSSProperties } from "react";
import type { Choice } from "@/lib/read/types";
import { Arrow } from "./Bits";

export interface Chip { pick: string; label: string }

export function AskBox({ chips = [], placeholder = "Paste any Polymarket or Kalshi bet", autoFocus = false, id = "ask", settle = true }: { chips?: Chip[]; placeholder?: string; autoFocus?: boolean; id?: string; settle?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const st = (d: number) => (settle ? { "data-m": "settle" as const, style: { "--d": `${d}s` } as CSSProperties } : {});

  async function ask(body: { text?: string; pick?: string }) {
    setBusy(true); setMsg(null);
    const form = new FormData();
    if (body.text) form.set("text", body.text);
    if (body.pick) form.set("pick", body.pick);
    try {
      const r = await fetch("/api/read", { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (j.id) { window.location.assign(`/read/${j.id}`); return; }
      if (j.choices?.length) { setChoices(j.choices); setBusy(false); return; }
      if (j.code === "limit") { window.location.assign("/go?from=limit"); return; }
      setMsg(j.error ?? "Something went wrong. Try again in a minute.");
    } catch { setMsg("No connection. Try again."); }
    setBusy(false);
  }

  return (
    <div className="b-col" data-testid="ask">
      <form className="b-ask" role="search" onSubmit={e => { e.preventDefault(); const t = input.current?.value.trim(); if (t) void ask({ text: t }); }} {...st(0.7)}>
        <label htmlFor={id} className="b-sr">{placeholder}</label>
        <input ref={input} id={id} name="text" placeholder={placeholder} autoComplete="off" enterKeyHint="go" autoFocus={autoFocus} maxLength={500} data-testid="ask-input" />
        <button className="b-btn b-btn-lg b-primary" type="submit" disabled={busy} data-testid="ask-go">{busy ? "Reading…" : <>Read<Arrow /></>}</button>
      </form>
      {msg ? <p className="b-msg" role="alert" data-testid="ask-error">{msg}</p> : null}
      {choices ? (
        <div style={{ display: "grid", gap: 8 }} data-testid="ask-choices">
          <span className="b-label">Which one?</span>
          <ul className="b-choices">{choices.map(c => <li key={c.key}><button type="button" onClick={() => void ask({ pick: `${c.venue}:${c.id}` })}><b style={{ fontWeight: 500 }}>{c.title}</b><span className="b-small">{c.event ?? (c.venue === "kalshi" ? "Kalshi" : "Polymarket")}</span></button></li>)}</ul>
        </div>
      ) : null}
      {chips.length ? (
        <div className="b-chips" data-testid="ask-chips">
          {chips.map((c, i) => <button key={c.pick} type="button" className="b-btn b-panel-pill b-chip" onClick={() => void ask({ pick: c.pick })} data-testid="ask-chip" {...st(0.85 + i * 0.05)}><span className="b-dot" aria-hidden="true" /><span>{c.label}</span></button>)}
        </div>
      ) : null}
    </div>
  );
}
