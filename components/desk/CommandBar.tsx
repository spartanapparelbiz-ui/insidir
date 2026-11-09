"use client";
/* Search (⌘K or Ctrl+K anywhere; "/?search=1" opens it): markets, races and wallets, or a pasted Polymarket or Kalshi
 * link, which opens that market's page (GET /api/search, lib/search/search.ts). Up to ten results to pick from. */
import { useEffect, useRef, useState } from "react";
import type { Hit } from "@/lib/search/search";

const KIND: Record<Hit["kind"], string> = { market: "Market", race: "Race", wallet: "Wallet" };

/** A question for Ask Insidir, not a search: it ends with "?" or starts like one ("who's the best NFL wallet…"). A
 *  pasted link or a wallet address is never a question. Pure. */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (!t || /^https?:\/\/|^0x[0-9a-f]{6,}/i.test(t)) return false;
  return /\?\s*$/.test(t) || /^(who|whos|who's|what|whats|what's|why|how|is|are|which|when|does|did|has|have|any|anyone|should|can|show me|tell me)\b/i.test(t) && t.split(/\s+/).length >= 3;
}

/** `bar`: the terminal's command line in the top bar (components/brand/Nav.tsx): its own input id, the terminal
 *  placeholder and the <GO> key. */
export function CommandBar({ open: open0 = false, bar = false, inputId = "desk-q" }: { open?: boolean; bar?: boolean; inputId?: string }) {
  const [open, setOpen] = useState(open0);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); setTimeout(() => input.current?.focus(), 0); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  async function find(text: string) {
    // A question goes to Ask Insidir (answers only from Insidir's data, lib/ask/run.ts); anything else is a search.
    if (isQuestion(text)) { window.location.assign(`/ask?q=${encodeURIComponent(text)}`); return; }
    setBusy(true); setMsg(null); setHits(null);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(text)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({})) as { go?: string | null; hits?: Hit[]; error?: string; note?: string };
      if (j.go) { window.location.assign(j.go); return; }
      if (j.hits?.length) setHits(j.hits);
      else { setAsk(text); setMsg(j.note ?? j.error ?? "Nothing found. Try a team, a race, a wallet address, or paste a Polymarket or Kalshi link."); }
    } catch { setMsg("Couldn't reach Insidir. Try again."); }
    setBusy(false);
  }

  return (
    <div className={`s-cmdwrap${bar ? " t-cmdwrap" : ""}`}>
      <form className={`s-cmd${bar ? " t-cmd" : ""}`} role="search" onSubmit={e => { e.preventDefault(); if (q.trim()) void find(q.trim()); }} data-testid={bar ? "t-cmd" : "desk-search"}>
        <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="9" cy="9" r="5" /><path d="m13 13 3.5 3.5" /></svg>
        <label className="b-sr" htmlFor={inputId}>Search markets, races and wallets, or paste a link</label>
        <input id={inputId} ref={input} value={q} onChange={e => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder={bar ? "Search markets and wallets, or ask a question" : "Search markets, races, wallets, or paste a link"} autoComplete="off" enterKeyHint="search" />
        {busy ? <span className="s-cmd__spin" aria-label="Searching" /> : null}
        {bar ? <kbd className="c-kbd" aria-hidden="true">⌘K</kbd> : null}
      </form>
      {open && (hits || msg) ? (
        <div className="s-cmd__pop" role="dialog" aria-label="Search results" data-testid="desk-search-result">
          {msg ? <p className="b-small" role="status">{msg}</p> : null}
          {msg && ask ? <p className="b-small"><a className="s-link" href={`/ask?q=${encodeURIComponent(ask)}`} data-testid="cmd-ask">Ask Insidir: “{ask}”</a></p> : null}
          {hits ? (
            <ul className="s-choices">{hits.map(h => (
              <li key={h.href}><a href={h.href} data-entity={h.kind}><span>{h.title}{h.sub ? <span className="b-small b-dim"> · {h.sub}</span> : null}</span><span className="b-small b-dim">{KIND[h.kind]}</span></a></li>
            ))}</ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
