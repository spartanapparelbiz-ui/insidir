"use client";
/* The Election Day board, live: every race with the most watchlist money, its millionaire split and the price; the
 * top 3 whole for visitors, the rest by title and total with the split locked. Refreshes every minute (the live dot
 * says when it last did); a failed refresh keeps what is shown and says so. */
import { useEffect, useState } from "react";
import type { ElectionBoard, Race } from "@/lib/brand/pulse";
import { dollars } from "@/lib/money";
import { cents } from "../Bits";

/** "d" or "r" when the race's title or outcome clearly names a party; otherwise no chip at all. */
export function partyOf(text: string): "d" | "r" | null {
  const d = /\b(democrats?|democratic|dem)\b|\(d\)|\bd (senate|house)\b/i.test(text), r = /\b(republicans?|gop)\b|\(r\)|\br (senate|house)\b/i.test(text);
  return d && !r ? "d" : r && !d ? "r" : null;
}

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
        {b.free.map(r => <RaceRow key={r.marketId} r={r} />)}
        {member ? null : b.locked.map((r, i) => (
          <li key={`l${i}`}>
            <p className="b-small" data-locked="race" data-testid="race-locked"><span className="b-row__title">{r.title}</span>: members see which side the {dollars(r.total)} is on.</p>
          </li>
        ))}
      </ul>
      <p className="b-small">Watchlist money (wallets up $100K+) in each race this week; the price is Polymarket&apos;s now. Information, not advice.</p>
    </div>
  );
}

/** One race, whole: the millionaire money on each side, its bar, and the price now. */
export function RaceRow({ r }: { r: Race }) {
  const m = r.millionaire.yes.dollars + r.millionaire.no.dollars, share = m ? r.millionaire.yes.dollars / m : 0, party = partyOf(r.title);
          const sides = ([[r.millionaire.yes.dollars, r.yesLabel], [r.millionaire.no.dollars, r.noLabel]] as const).filter(([v]) => v > 0);
          return (
            <li key={r.marketId} className="b-row b-race" data-testid="race-free" data-party={party ?? undefined}>
              <span className="b-row__main">
                <span className="b-race__title">{party ? <span className={`b-party b-party--${party}`} aria-label={party === "d" ? "Democrats" : "Republicans"}>{party === "d" ? "D" : "R"}</span> : null}<span className="b-row__title">{r.title}</span></span>
                {m ? (
                  <>
                    <span className="b-bar" role="img" aria-label={`${Math.round(share * 100)}% of the millionaire money on ${r.yesLabel}`}><span data-bar={share.toFixed(3)} style={{ transform: `scaleX(${share})` }} /></span>
                    <span className="b-row__meta">{sides.map(([v, l]) => <span key={l}><b className="b-num" style={{ color: l === r.yesLabel ? "var(--yes)" : "var(--no)" }}>{dollars(v)}</b> on {l}</span>)}<span>from wallets up $1M+</span></span>
                  </>
                ) : <span className="b-row__meta"><span>Only Pro wallets ($100K+) so far: <b className="b-num">{dollars(r.pro.yes.dollars + r.pro.no.dollars)}</b> in</span></span>}
              </span>
              <span className="b-race__price">{r.priceNow !== null ? <><b className="b-num">{cents(r.priceNow)}</b><span className="b-small">{r.yesLabel} · price now</span></> : <span className="b-small">No price yet</span>}</span>
            </li>
          );
}
