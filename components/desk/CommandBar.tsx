"use client";
/* The Desk's search (⌘K or Ctrl+K anywhere on the Desk; "/?search=1" opens it): "Search a market or paste a bet link".
 * Enter sends it to /api/read (the same resolver as the check: a Polymarket or Kalshi link, or a market in plain words).
 * A market comes back inline with the millionaire side (/api/check/<id>: millionaire money and wallets on each side,
 * the price now; in the US, Kalshi only), and a link to the full check. Several possible markets: up to three to pick.
 * Data, never advice. */
import { useEffect, useRef, useState } from "react";
import type { Choice } from "@/lib/read/types";
import { dollars } from "@/lib/money";

interface Side { dollars: number; wallets: number }
interface Check {
  id: string; question: string; yesLabel: string; noLabel: string;
  millionaire: { yes: Side; no: Side }; pro: { yes: Side; no: Side };
  prices: { yes: { best: string | null; kalshi: number | null; polymarket: number | null }; no: { best: string | null; kalshi: number | null; polymarket: number | null } };
}
const price = (p: Check["prices"]["yes"]) => { const v = p.best === "kalshi" ? p.kalshi : p.best === "polymarket" ? p.polymarket : null; return v === null ? null : `${Math.round(v * 100)}¢`; };
const w = (n: number) => `${n} millionaire ${n === 1 ? "wallet" : "wallets"}`;

export function CommandBar({ open: open0 = false }: { open?: boolean }) {
  const [open, setOpen] = useState(open0);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [res, setRes] = useState<Check | null>(null);
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

  async function ask(body: { text?: string; pick?: string }) {
    setBusy(true); setMsg(null); setRes(null);
    const form = new FormData();
    if (body.text) form.set("text", body.text);
    if (body.pick) form.set("pick", body.pick);
    try {
      const r = await fetch("/api/read", { method: "POST", body: form });
      const j = await r.json().catch(() => ({})) as { id?: string; choices?: Choice[]; error?: string };
      if (j.id) {
        setChoices(null);
        const c = await fetch(`/api/check/${encodeURIComponent(j.id)}`, { cache: "no-store" }).then(x => x.ok ? x.json() as Promise<Check> : null).catch(() => null);
        if (c) setRes(c); else setMsg("Couldn't load that market. Try again.");
      } else if (j.choices?.length) setChoices(j.choices);
      else setMsg(j.error ?? "No market found for that. Try a Polymarket or Kalshi link.");
    } catch { setMsg("Couldn't reach Insidir. Check your connection and try again."); }
    setBusy(false);
  }

  const bar = (
    <form className="s-cmd" role="search" onSubmit={e => { e.preventDefault(); if (q.trim()) void ask({ text: q.trim() }); }} data-testid="desk-search">
      <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="9" cy="9" r="5" /><path d="m13 13 3.5 3.5" /></svg>
      <label className="b-sr" htmlFor="desk-q">Search a market or paste a bet link</label>
      <input id="desk-q" ref={input} value={q} onChange={e => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder="Search a market or paste a bet link" autoComplete="off" enterKeyHint="search" />
      {busy ? <span className="s-cmd__spin" aria-label="Searching" /> : null}
    </form>
  );
  const show = open && (res || choices || msg);
  return (
    <div className="s-cmdwrap">
      {bar}
      {show ? (
        <div className="s-cmd__pop" role="dialog" aria-label="Search result" data-testid="desk-search-result">
          {msg ? <p className="b-small" role="status">{msg}</p> : null}
          {choices ? (
            <><p className="b-label">Which one?</p>
              <ul className="s-choices">{choices.map(c => (
                <li key={c.key}><button type="button" onClick={() => ask({ pick: `${c.venue}:${c.id}` })}><span>{c.title}</span>{c.yesPrice !== null ? <span className="b-num b-dim">{Math.round(c.yesPrice * 100)}¢</span> : null}</button></li>
              ))}</ul></>
          ) : null}
          {res ? (() => {
            const y = res.millionaire.yes, n = res.millionaire.no, lead = y.dollars === n.dollars ? null : y.dollars > n.dollars ? "yes" : "no";
            return (
              <div className="s-cmdres">
                <p className="s-cmdres__q">{res.question}</p>
                {lead ? <p className="s-cmdres__v">Millionaires are on <b className="s-strong">{lead === "yes" ? res.yesLabel : res.noLabel}</b></p>
                  : <p className="s-cmdres__v b-dim">{y.dollars ? "Millionaire money is split evenly." : "No millionaire money on this market yet."}</p>}
                <div className="s-cmdres__sides">
                  {(["yes", "no"] as const).map(s => (
                    <div key={s} className={`s-cmdres__side${lead === s ? " is-lead" : ""}`}>
                      <span className="b-dim">{s === "yes" ? res.yesLabel : res.noLabel}</span>
                      {res.millionaire[s].dollars > 0 ? <b className="b-num">{dollars(res.millionaire[s].dollars)}</b> : <b className="b-dim">No millionaire money</b>}
                      <span className="b-small">{[res.millionaire[s].wallets > 0 ? w(res.millionaire[s].wallets) : null, price(res.prices[s]) ? `now ${price(res.prices[s])}` : null].filter(Boolean).join(" · ")}</span>
                    </div>
                  ))}
                </div>
                <div className="s-actions"><a className="b-btn b-btn-lg b-primary" href={`/read/${encodeURIComponent(res.id)}`}>Full check</a><span className="b-small">Information, not advice.</span></div>
              </div>
            );
          })() : null}
        </div>
      ) : null}
    </div>
  );
}
