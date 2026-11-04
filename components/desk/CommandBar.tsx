"use client";
/* Search (⌘K or Ctrl+K anywhere; "/?search=1" opens it): markets, races and wallets, or a pasted Polymarket or Kalshi
 * link, which opens that market's page (GET /api/search, lib/search/search.ts). Up to ten results to pick from. */
import { useEffect, useRef, useState } from "react";
import type { Hit } from "@/lib/search/search";

const KIND: Record<Hit["kind"], string> = { market: "Market", race: "Race", wallet: "Wallet" };

export function CommandBar({ open: open0 = false }: { open?: boolean }) {
  const [open, setOpen] = useState(open0);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[] | null>(null);
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
    setBusy(true); setMsg(null); setHits(null);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(text)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({})) as { go?: string | null; hits?: Hit[]; error?: string; note?: string };
      if (j.go) { window.location.assign(j.go); return; }
      if (j.hits?.length) setHits(j.hits);
      else setMsg(j.note ?? j.error ?? "Nothing found. Try a team, a race, a wallet address, or paste a Polymarket or Kalshi link.");
    } catch { setMsg("Couldn't reach Insidir. Try again."); }
    setBusy(false);
  }

  return (
    <div className="s-cmdwrap">
      <form className="s-cmd" role="search" onSubmit={e => { e.preventDefault(); if (q.trim()) void find(q.trim()); }} data-testid="desk-search">
        <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="9" cy="9" r="5" /><path d="m13 13 3.5 3.5" /></svg>
        <label className="b-sr" htmlFor="desk-q">Search markets, races and wallets, or paste a link</label>
        <input id="desk-q" ref={input} value={q} onChange={e => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder="Search markets, races, wallets, or paste a link" autoComplete="off" enterKeyHint="search" />
        {busy ? <span className="s-cmd__spin" aria-label="Searching" /> : null}
      </form>
      {open && (hits || msg) ? (
        <div className="s-cmd__pop" role="dialog" aria-label="Search results" data-testid="desk-search-result">
          {msg ? <p className="b-small" role="status">{msg}</p> : null}
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
