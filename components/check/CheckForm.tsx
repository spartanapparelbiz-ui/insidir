"use client";
/* Check your bet: drop or pick a bet-slip screenshot (or paste one), or paste a market link or a ticker, then
 * /api/check reads it and the page opens the result. A plain form underneath, so it works before the page's script
 * loads. */
import { useRef, useState } from "react";

export function CheckForm({ free, left }: { free: boolean; left: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; href?: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);

  const send = async (f: File | null, text: string) => {
    setError(null);
    if (!f && !text.trim()) { setError({ text: "Add a slip screenshot, or paste a market link or a ticker." }); return; }
    setBusy(true);
    const body = new FormData();
    if (f) body.set("slip", f); else body.set("text", text.trim());
    const r = await fetch("/api/check", { method: "POST", body }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { id?: string; error?: string; unlockHref?: string }) : {};
    if (r?.ok && j.id) { location.assign(`/check/${j.id}`); return; }
    setBusy(false);
    setError({ text: j.error ?? "Something went wrong. Try again in a minute.", href: j.unlockHref });
  };
  const pick = (f: File | null | undefined) => { if (f) { setFile(f); setError(null); } };

  return (
    <form className="checkf" aria-busy={busy || undefined} onSubmit={e => { e.preventDefault(); void send(file, textRef.current?.value ?? ""); }}
      onPaste={e => { const f = [...e.clipboardData.files].find(x => x.type.startsWith("image/")); if (f) pick(f); }}>
      <label className={`checkf__drop${over ? " checkf__drop--over" : ""}${file ? " checkf__drop--has" : ""}`}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); pick([...e.dataTransfer.files].find(x => x.type.startsWith("image/"))); }}>
        <input ref={input} type="file" name="slip" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={e => pick(e.target.files?.[0])} />
        <span className="checkf__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
        </span>
        <span className="checkf__h">{file ? file.name : "Upload or paste your bet slip"}</span>
        <span className="checkf__p">{file ? "Ready. Check it below." : "A screenshot from DraftKings, FanDuel, BetMGM, Kalshi, Polymarket or Robinhood."}</span>
      </label>
      <p className="checkf__or"><span>or</span></p>
      <label className="checkf__field">
        <span className="sr-only">Market link or ticker</span>
        <input ref={textRef} name="text" className="input" placeholder="Paste a Polymarket or Kalshi link, or a ticker like NVDA" autoComplete="off" onChange={() => file && setFile(null)} />
      </label>
      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? "Checking…" : "Check my bet"}</button>
      {busy ? <p className="checkf__wait" role="status">Reading the slip and matching each leg to the markets. This takes a few seconds.</p> : null}
      {error ? <p className="checkf__err" role="alert">{error.text} {error.href ? <a href={error.href} data-unlock="check">Get Insidir</a> : null}</p> : null}
      <p className="checkf__note">{free ? (left > 0 ? "Your first check is free. " : "") : ""}Data, not a recommendation. We never keep your screenshot.</p>
    </form>
  );
}
