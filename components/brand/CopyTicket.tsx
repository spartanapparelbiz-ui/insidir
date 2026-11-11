"use client";
/* The copy ticket's action (/copy/<id>): the side's price on Kalshi and Polymarket with the cheaper one marked, the
 * member's size (the matched size from their bankroll, editable), and "Copy this trade": it logs the copy and opens
 * that market on the cheaper app the member can use, in a new tab, where they confirm the trade in their own account.
 * Then they mark it placed or skipped, so their totals stay true. Insidir never places a trade, holds funds or asks
 * for keys or logins. Neither venue's link takes a side or an amount (tested 2026-11-11), so both are shown here to
 * enter there. */
import { useState } from "react";
import { Arrow } from "./Bits";

type Venue = "kalshi" | "polymarket";
const NAME: Record<Venue, string> = { kalshi: "Kalshi", polymarket: "Polymarket" };
const cents = (p: number | null) => (p === null ? "No price" : `${Math.round(p * 100)}¢`);

export function CopyAction({ betId, outcome, prices, links, best, defaultAmount, sizeNote, logged: was }: {
  betId: string; outcome: string; prices: Record<Venue, number | null>; links: Record<Venue, string | null>; best: Venue | null;
  defaultAmount: number; sizeNote: string | null; logged: { id: number; status: "copied" | "placed" | "skipped" } | null;
}) {
  const [amount, setAmount] = useState(String(defaultAmount));
  const [venue, setVenue] = useState<Venue | null>(best);
  const [copy, setCopy] = useState(was);
  const [msg, setMsg] = useState<string | null>(null);
  const href = venue ? links[venue] : null;
  const venues = (["kalshi", "polymarket"] as const).filter(v => prices[v] !== null || links[v]);
  const cheap = prices.kalshi !== null && prices.polymarket !== null ? (prices.kalshi <= prices.polymarket ? "kalshi" : "polymarket") : null;

  const log = () => {
    setMsg(null);
    // The link opens in the same tap (no pop-up blocker); the log rides along with keepalive.
    void fetch("/api/copies/log", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ betId, amount: Number(amount), venue }) })
      .then(async r => { const j = await r.json().catch(() => ({})) as { id?: number; error?: string }; if (r.ok && j.id) setCopy({ id: j.id, status: "copied" }); else setMsg(j.error ?? "That didn't save. Try again."); })
      .catch(() => setMsg("Your copy wasn't saved because the connection dropped. Tap Copy again."));
  };
  const mark = async (status: "placed" | "skipped") => {
    if (!copy) return;
    const r = await fetch("/api/copies/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: copy.id, status }) }).catch(() => null);
    if (r?.ok) setCopy({ ...copy, status }); else setMsg("That didn't save. Try again.");
  };

  return (
    <div className="s-copyact" data-testid="copy-action">
      {venues.length ? (
        <div className="cp-venues" role="radiogroup" aria-label="Where to copy it">
          {venues.map(v => (
            <button key={v} type="button" role="radio" aria-checked={venue === v} disabled={!links[v]} className="cp-venue" onClick={() => setVenue(v)} data-testid={`copy-venue-${v}`}>
              <span className="b-small">{outcome} on {NAME[v]}</span>
              <b className="s-big b-num">{cents(prices[v])}</b>
              {cheap === v ? <span className="cp-cheap" data-testid="copy-cheaper">Cheaper</span> : null}
              {!links[v] ? <span className="b-small">Not available where you are</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <label className="b-kv s-copyact__amt" htmlFor="copy-amount">
        <span className="s-strong">Sizing</span>
        <span className="b-amount"><span aria-hidden="true">$</span><input id="copy-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} data-testid="copy-amount" aria-describedby="copy-amount-hint" /></span>
      </label>
      <span className="b-small" id="copy-amount-hint" data-testid="copy-size-note">{sizeNote ?? "Set your bankroll in Account to get a matched size."}</span>
      {href && venue ? (
        <a className="b-btn b-btn-lg b-primary" href={href} target="_blank" rel="noopener noreferrer" onClick={log} data-testid="copy-open">Copy this trade on {NAME[venue]}<Arrow /></a>
      ) : <p className="b-msg" data-testid="copy-view-only">Not on a venue you can use yet, so this one is view-only.</p>}
      <p className="b-small">Opens the market on {venue ? NAME[venue] : "the venue"}. Pick {outcome} and enter ${amount || "0"} there, then confirm in your own account. Insidir never places a trade or holds funds.</p>
      {copy ? (
        copy.status === "copied" ? (
          <div className="cp-mark" data-testid="copy-mark">
            <span className="s-strong">Did you place it?</span>
            <button type="button" className="b-btn b-panel-pill" onClick={() => void mark("placed")} data-testid="copy-placed">Placed</button>
            <button type="button" className="b-btn b-panel-pill" onClick={() => void mark("skipped")} data-testid="copy-skipped">Skipped</button>
          </div>
        ) : <p className="b-msg" role="status" data-testid="copy-logged">Marked {copy.status} in <a href="/copies">Ledger</a>.{copy.status === "placed" ? " You'll get a push when the wallet sells." : ""}</p>
      ) : null}
      {msg ? <p className="b-msg" role="alert">{msg}</p> : null}
    </div>
  );
}
