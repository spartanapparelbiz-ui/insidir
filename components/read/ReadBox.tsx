"use client";
/* The one box (home, member home, under every Read): paste a Polymarket or Kalshi link, or type a market in plain
 * words, and /api/read opens its Read. When it isn't clear which market, up to 3 to pick from. A sportsbook slip
 * screenshot is the second way in. Without JavaScript the form posts nowhere useful, so the button says so. */
import { useRef, useState } from "react";
import { beacon } from "@/components/app/beacon";

interface Choice { key: string; venue: "polymarket" | "kalshi"; id: string; title: string; event: string | null; yesPrice: number | null }
type Answer = { id?: string; choices?: Choice[]; error?: string; code?: string; unlockHref?: string };

export function ReadBox({ autoFocus = false, size = "big", label = "Read it" }: { autoFocus?: boolean; size?: "big" | "small"; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; href?: string } | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const text = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const send = async (body: FormData) => {
    setError(null); setChoices(null); setBusy(true);
    const r = await fetch("/api/read", { method: "POST", body }).catch(() => null);
    const j: Answer = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && j.id) { location.assign(`/read/${j.id}`); return; }
    setBusy(false);
    if (r?.ok && j.choices?.length) { setChoices(j.choices); return; }
    if (j.code === "limit") beacon("unlock_click", "read-limit");
    setError({ text: j.error ?? (r ? "Something went wrong. Try again in a minute." : "We couldn't reach Insidir. Check your connection."), href: j.unlockHref });
  };
  const submitText = () => {
    const v = text.current?.value.trim() ?? "";
    if (!v) { setError({ text: "Paste a Polymarket or Kalshi link, or type a market like “Senate control”." }); return; }
    const b = new FormData(); b.set("text", v); void send(b);
  };

  return (
    <div className={`rbox rbox--${size}`} data-testid="read-box">
      <form className="rbox__form" aria-busy={busy || undefined} onSubmit={e => { e.preventDefault(); submitText(); }}>
        <label className="rbox__field">
          <span className="sr-only">A Polymarket or Kalshi link, or a market in plain words</span>
          <input ref={text} name="text" className="rbox__input" placeholder="Paste a link, or type “Senate control”" autoComplete="off" autoFocus={autoFocus} enterKeyHint="go" data-testid="read-input" />
        </label>
        <button type="submit" className="btn btn--primary rbox__go" disabled={busy} data-testid="read-go">{busy ? "Reading…" : label}</button>
      </form>
      <p className="rbox__alt">
        <button type="button" className="rbox__slip" onClick={() => file.current?.click()} disabled={busy}>Or upload a sportsbook slip</button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" data-testid="read-slip"
          onChange={e => { const f = e.target.files?.[0]; if (f) { const b = new FormData(); b.set("slip", f); void send(b); } }} />
      </p>
      {busy ? <p className="rbox__wait" role="status">Reading the market: proven money, big bets and prices. A few seconds.</p> : null}
      {choices ? (
        <div className="rbox__choices" data-testid="read-choices">
          <p className="rbox__q">Which one?</p>
          <ul>
            {choices.map(c => (
              <li key={c.key}>
                <button type="button" className="rbox__choice" disabled={busy} onClick={() => { const b = new FormData(); b.set("pick", `${c.venue}:${c.id}`); void send(b); }}>
                  <span className="rbox__ct">{c.title}</span>
                  <span className="rbox__cs">{[c.event && c.event !== c.title ? c.event : null, c.venue === "kalshi" ? "Kalshi" : "Polymarket", c.yesPrice !== null ? `Yes ${Math.round(c.yesPrice * 100)}¢` : null].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p className="rbox__err" role="alert">{error.text} {error.href ? <a href={error.href} data-unlock="read-limit">Start for $1</a> : null}</p> : null}
    </div>
  );
}
