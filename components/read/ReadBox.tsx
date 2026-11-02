"use client";
/* The one box (home, member home, under every Read): paste a Polymarket or Kalshi link, or type a market in plain
 * words, and /api/read opens its Read. When it isn't clear which market, up to 3 to pick from. A sportsbook slip
 * screenshot is the second way in. Without JavaScript the form posts nowhere useful, so the button says so. */
import { useEffect, useRef, useState } from "react";
import { beacon } from "@/components/app/beacon";

interface Choice { key: string; venue: "polymarket" | "kalshi"; id: string; title: string; event: string | null; yesPrice: number | null }
type Answer = { id?: string; choices?: Choice[]; error?: string; code?: string; unlockHref?: string };

/* The last "Which one?" is kept for 30 minutes (the server keeps the same offer open, lib/read/store.ts READ_OFFER_MS),
 * so after picking one the others are a tap away under the Read: picking doesn't use up the free Read. */
const OFFER_KEY = "insidir:read-offer";
const OFFER_MS = 30 * 60_000;
function loadOffer(): { list: Choice[]; picked: string | null } | null {
  try {
    const o = JSON.parse(sessionStorage.getItem(OFFER_KEY) ?? "null") as { list: Choice[]; picked: string | null; at: number } | null;
    return o && Date.now() - o.at < OFFER_MS && Array.isArray(o.list) ? o : null;
  } catch { return null; }
}
function saveOffer(list: Choice[] | null, picked: string | null = null) {
  try { if (list) sessionStorage.setItem(OFFER_KEY, JSON.stringify({ list, picked, at: Date.now() })); else sessionStorage.removeItem(OFFER_KEY); } catch { /* storage off */ }
}

export function ReadBox({ autoFocus = false, size = "big", label = "Read it", glass = false, placeholder = "Paste a link, or type “Senate control”" }: {
  autoFocus?: boolean; size?: "big" | "small"; label?: string;
  /** The new design system's glass ask box (app/nx.css .nx-ask). */
  glass?: boolean; placeholder?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; href?: string } | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [others, setOthers] = useState<Choice[] | null>(null);
  useEffect(() => {
    if (!others && !choices) {
      const o = loadOffer();
      if (o?.picked) { const rest = o.list.filter(c => c.key !== o.picked); if (rest.length) setOthers(rest); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const text = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const send = async (body: FormData) => {
    setError(null); setChoices(null); setBusy(true);
    const r = await fetch("/api/read", { method: "POST", body }).catch(() => null);
    const j: Answer = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && j.id) { location.assign(`/read/${j.id}`); return; }
    setBusy(false);
    if (r?.ok && j.choices?.length) { setChoices(j.choices); saveOffer(j.choices); return; }
    if (j.code === "limit") beacon("unlock_click", "read-limit");
    setError({ text: j.error ?? (r ? "Something went wrong. Try again in a minute." : "We couldn't reach Insidir. Check your connection."), href: j.unlockHref });
  };
  const submitText = () => {
    const v = text.current?.value.trim() ?? "";
    if (!v) { setError({ text: "Paste a Polymarket or Kalshi link, or type a market like “Senate control”." }); return; }
    saveOffer(null); setOthers(null);
    const b = new FormData(); b.set("text", v); void send(b);
  };

  return (
    <div className={glass ? "nx-askwrap" : `rbox rbox--${size}`} data-testid="read-box">
      <form className={glass ? "nx-ask" : "rbox__form"} aria-busy={busy || undefined} onSubmit={e => { e.preventDefault(); submitText(); }}>
        <label className={glass ? "nx-ask__field" : "rbox__field"} style={glass ? { flex: 1, minWidth: 0, display: "flex" } : undefined}>
          <span className="sr-only">A Polymarket or Kalshi link, or a market in plain words</span>
          <input ref={text} name="text" className={glass ? "nx-ask__input" : "rbox__input"} placeholder={placeholder} autoComplete="off" autoFocus={autoFocus} enterKeyHint="go" data-testid="read-input" />
        </label>
        <button type="submit" className={glass ? "nx-pill nx-pill--accent" : "btn btn--primary rbox__go"} disabled={busy} data-testid="read-go">{busy ? "Reading…" : label}</button>
      </form>
      <p className={glass ? "nx-ask__slip" : "rbox__alt"}>
        <button type="button" className="rbox__slip" onClick={() => file.current?.click()} disabled={busy}>Or upload a sportsbook slip</button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" data-testid="read-slip"
          onChange={e => { const f = e.target.files?.[0]; if (f) { const b = new FormData(); b.set("slip", f); void send(b); } }} />
      </p>
      {busy ? <p className={glass ? "nx-ask__wait nx-muted" : "rbox__wait"} role="status">Reading the market: proven money, big bets and prices. A few seconds.</p> : null}
      {choices || others ? (
        <div className={glass ? "nx-choices" : "rbox__choices"} data-testid={choices ? "read-choices" : "read-others"}>
          <p className={glass ? "nx-label" : "rbox__q"}>{choices ? "Which one?" : "Not this one? Your other matches"}</p>
          <ul>
            {(choices ?? others ?? []).map(c => (
              <li key={c.key}>
                <button type="button" className={glass ? "nx-choice" : "rbox__choice"} disabled={busy} onClick={() => { const o = loadOffer(); saveOffer(o?.list ?? choices ?? others, c.key); const b = new FormData(); b.set("pick", `${c.venue}:${c.id}`); const typed = text.current?.value.trim(); if (typed) b.set("q", typed); void send(b); }}>
                  <span className={glass ? undefined : "rbox__ct"}>{c.title}</span>
                  <span className={glass ? "nx-muted" : "rbox__cs"} style={glass ? { fontSize: 13 } : undefined}>{[c.event && c.event !== c.title ? c.event : null, c.venue === "kalshi" ? "Kalshi" : "Polymarket", c.yesPrice !== null ? `Yes ${Math.round(c.yesPrice * 100)}¢` : null].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p className={glass ? "nx-ask__err" : "rbox__err"} role="alert">{error.text} {error.href ? <a href={error.href} data-unlock="read-limit">Start for $1</a> : null}</p> : null}
    </div>
  );
}
