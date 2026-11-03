"use client";
/* The copy ticket's action: the amount (the member's default), Open on the venue (a new tab, straight to the market),
 * then "I placed it" to log it. Insidir never places the bet: the member buys on Kalshi or Polymarket. */
import { useState } from "react";
import { Arrow } from "./Bits";

export function CopyAction({ betId, open, defaultAmount, logged: was }: { betId: string; open: { venue: "kalshi" | "polymarket"; href: string } | null; defaultAmount: number; logged: boolean }) {
  const [amount, setAmount] = useState(String(defaultAmount));
  const [state, setState] = useState<"idle" | "saving" | "logged" | "error">(was ? "logged" : "idle");
  const [msg, setMsg] = useState<string | null>(null);
  const log = async () => {
    setState("saving"); setMsg(null);
    const r = await fetch("/api/copies/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ betId, amount: Number(amount) }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) as { error?: string } : { error: "No connection. Try again." };
    if (r?.ok) setState("logged"); else { setState("error"); setMsg(j.error ?? "That didn't save. Try again."); }
  };
  if (state === "logged") return <p className="b-msg" role="status" data-testid="copy-logged">Logged. It settles with the market in <a href="/copies/yours">Your copies</a>, losses included.</p>;
  return (
    <div style={{ display: "grid", gap: 12 }} data-testid="copy-action">
      <label className="b-kv" htmlFor="copy-amount" style={{ alignItems: "center" }}>
        <span style={{ fontWeight: 500 }}>Your amount</span>
        <span className="b-amount"><span aria-hidden="true">$</span><input id="copy-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} data-testid="copy-amount" aria-describedby="copy-amount-hint" /></span>
      </label>
      <span className="b-small" id="copy-amount-hint">Your default is in Account. Insidir never places a bet or holds money: you buy it on {open?.venue === "kalshi" ? "Kalshi" : "Polymarket"}.</span>
      {open ? <a className="b-btn b-btn-lg b-primary" href={open.href} target="_blank" rel="noopener noreferrer" data-testid="copy-open">Open on {open.venue === "kalshi" ? "Kalshi" : "Polymarket"}<Arrow /></a>
        : <p className="b-msg" data-testid="copy-view-only">Not on Kalshi yet. In the US we link to Kalshi only, so this one is view-only.</p>}
      <button type="button" className="dk-link" onClick={() => void log()} disabled={state === "saving" || !Number(amount)} data-testid="copy-placed">{state === "saving" ? "Saving…" : "I placed it"}</button>
      {msg ? <p className="b-msg" role="alert">{msg}</p> : null}
    </div>
  );
}
