"use client";
/* The Election Day board, live: every race with the most watchlist money, its millionaire split and the price; the
 * top 3 whole for visitors, the rest by title and total with the split locked. Refreshes every minute (the live dot
 * says when it last did); a failed refresh keeps what is shown and says so. */
import { useEffect, useState } from "react";
import type { ElectionBoard } from "@/lib/brand/pulse";
import { dollars } from "@/lib/money";
import { cents } from "../Bits";

const ET = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export function ElectionLive({ initial, member }: { initial: ElectionBoard; member: boolean }) {
  const [b, setB] = useState(initial);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/millionaires/election", { cache: "no-store" });
        if (!r.ok) { setStale(true); return; }
        const j = await r.json() as ElectionBoard & { off?: boolean };
        if (!j.off) setB(j);
        setStale(false);
      } catch { setStale(true); }
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  if (!b.free.length && !b.locked.length) return <p className="b-empty" style={{ textAlign: "center" }} data-testid="election-empty">No race has watchlist money yet today. It fills in as the money moves.</p>;
  return (
    <div className="b-glass b-pad" style={{ maxWidth: "min(100%, calc(900 * var(--u)))", margin: "0 auto", display: "grid", gap: 12 }} data-testid="election-board">
      <div className="b-kv"><span className="b-label" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><span className="b-dot" aria-hidden="true" /> {stale ? "Catching up" : "Live"}</span><span className="b-small">Updated {ET.format(new Date(b.at))} ET · every minute</span></div>
      <ul className="b-rows" data-stagger="">
        {b.free.map(r => {
          const m = r.millionaire.yes.dollars + r.millionaire.no.dollars, share = m ? r.millionaire.yes.dollars / m : 0;
          return (
            <li key={r.marketId} className="b-row b-race" data-testid="race-free">
              <span className="b-row__main">
                <span className="b-row__title">{r.title}</span>
                {m ? (
                  <>
                    <span className="b-bar" role="img" aria-label={`${Math.round(share * 100)}% of the millionaire money on ${r.yesLabel}`}><span data-bar={share.toFixed(3)} style={{ transform: `scaleX(${share})` }} /></span>
                    <span className="b-row__meta"><span>{r.yesLabel} {r.millionaire.yes.dollars ? dollars(r.millionaire.yes.dollars) : "none"}</span><span>{r.noLabel} {r.millionaire.no.dollars ? dollars(r.millionaire.no.dollars) : "none"}</span></span>
                  </>
                ) : <span className="b-row__meta"><span>Pro money only: {dollars(r.pro.yes.dollars + r.pro.no.dollars)}</span></span>}
              </span>
              <span className="b-row__money">{r.priceNow !== null ? <><span className="b-row__size b-num">{cents(r.priceNow)}</span><span className="b-small">{r.yesLabel} now</span></> : <span className="b-small">No price now</span>}</span>
            </li>
          );
        })}
        {member ? null : b.locked.map((r, i) => (
          <li key={`l${i}`}>
            <button type="button" className="b-lockrow" data-locked="race" aria-label={`${r.title}: the split and price are for members. Start for $1 to see them`} data-testid="race-locked">
              <span className="b-row__title" style={{ textAlign: "left" }}>{r.title}</span>
              <span className="b-small b-num">{dollars(r.total)} in</span>
              <span className="b-lock" aria-hidden="true">Locked</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="b-small">Watchlist money (wallets up $100K+) in each race this week; the price is Polymarket&apos;s now. Information, not advice.</p>
    </div>
  );
}
