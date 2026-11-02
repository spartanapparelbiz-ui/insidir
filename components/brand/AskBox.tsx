"use client";
/* The ask box: paste a Polymarket or Kalshi link, or type the market. POSTs to /api/read (lib/read) and opens the Read;
 * when it could be more than one market it offers three; the visitor's one free Read is the API's rule (402 → /go).
 * The chips under it are the busiest markets right now: one tap reads that market. */
import { useRef, useState } from "react";
import type { Choice } from "@/lib/read/types";

export interface Chip { pick: string; label: string }

export function AskBox({ chips = [], placeholder = "Paste any Polymarket or Kalshi bet", autoFocus = false, id = "ask" }: { chips?: Chip[]; placeholder?: string; autoFocus?: boolean; id?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

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
    <div className="b-askwrap" style={{ display: "grid", gap: 12 }} data-testid="ask">
      <form className="b-ask" onSubmit={e => { e.preventDefault(); const t = input.current?.value.trim(); if (t) void ask({ text: t }); }} role="search">
        <label htmlFor={id} className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{placeholder}</label>
        <input ref={input} id={id} name="text" placeholder={placeholder} autoComplete="off" enterKeyHint="go" autoFocus={autoFocus} data-testid="ask-input" maxLength={500} />
        <button className="b-btn" type="submit" disabled={busy} data-testid="ask-go">{busy ? "Reading…" : <><span className="b-ask__go-label">Read it </span>→</>}</button>
      </form>
      {msg ? <p className="b-ask__msg" role="alert" data-testid="ask-error">{msg}</p> : null}
      {choices ? (
        <div style={{ display: "grid", gap: 8 }} data-testid="ask-choices">
          <span className="b-label">Which one?</span>
          <ul className="b-choices">
            {choices.map(c => (
              <li key={c.key}><button type="button" onClick={() => void ask({ pick: `${c.venue}:${c.id}` })}><b>{c.title}</b><span className="b-small">{c.event ?? (c.venue === "kalshi" ? "Kalshi" : "Polymarket")}</span></button></li>
            ))}
          </ul>
        </div>
      ) : null}
      {chips.length ? (
        <div className="b-chips" data-testid="ask-chips">
          {chips.map(c => (
            <button key={c.pick} type="button" className="b-chip" onClick={() => void ask({ pick: c.pick })} data-testid="ask-chip"><span className="b-dot" aria-hidden="true" /><span>{c.label}</span></button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
