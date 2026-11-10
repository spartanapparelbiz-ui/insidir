"use client";
/* The whale ticker, under the member home's live strip: every $10K+ trade of the last 6 hours on Polymarket and Kalshi
 * (lib/tape.ts whaleTicker), newest first, as cards scrolling sideways. Each card: the venue, the outcome bought, the
 * size, the side's implied probability when it filled ➔ now, and a link to the market. Re-read every 15 seconds; it
 * pauses on hover and while the tab is hidden, and doesn't move for reduced motion (it scrolls by hand instead).
 * Members only: the outcome is the side. Information, not advice. */
import { useEffect, useState, type CSSProperties } from "react";
import type { WhaleTick } from "@/lib/tape";
import { dollars } from "@/lib/money";

const REFRESH_MS = 15_000;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const VENUE: Record<WhaleTick["venue"], string> = { polymarket: "Polymarket", kalshi: "Kalshi" };

function Card({ t }: { t: WhaleTick }) {
  const up = t.from !== null && t.to !== null ? Math.round(t.to * 100) - Math.round(t.from * 100) : null;
  return (
    <li className="wt__card" data-testid="whale-tick" data-venue={t.venue}>
      <span className="wt__top"><span className={`wt__venue wt__venue--${t.venue}`}>{VENUE[t.venue]}</span><b className="wt__amt b-num">{dollars(t.amount)}</b></span>
      <span className="wt__out" title={t.title}>{t.outcome}</span>
      <span className="wt__m">{t.title}</span>
      <span className="wt__bot">
        {up !== null ? <span className="wt__shift b-num" data-testid="whale-shift">{pct(t.from!)} ➔ {pct(t.to!)}{up !== 0 ? <small className={up > 0 ? "b-up" : "b-down"}>{up > 0 ? ` +${up}` : ` ${up}`}</small> : null}</span>
          : <span className="wt__shift wt__shift--na">{t.from !== null ? `Filled at ${pct(t.from)}` : "Price now unavailable"}</span>}
        {t.href ? <a className="wt__go" href={t.href} {...(t.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>View market</a> : null}
      </span>
    </li>
  );
}

export function WhaleTicker() {
  const [rows, setRows] = useState<WhaleTick[] | null>(null);
  useEffect(() => {
    let stop = false;
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch("/api/tape/whales", { cache: "no-store" }).catch(() => null);
      if (!r?.ok || stop) return;
      setRows(((await r.json()) as { rows: WhaleTick[] }).rows);
    };
    void read();
    const id = setInterval(read, REFRESH_MS);
    return () => { stop = true; clearInterval(id); };
  }, []);
  if (rows === null) return <div className="wt wt--wait" aria-hidden="true" />;
  if (!rows.length) return <div className="wt wt--empty" data-testid="whale-ticker"><span className="wt__label">Whale trades</span><span className="b-small">No $10K+ trade in the last 6 hours yet.</span></div>;
  // Two copies side by side so the strip loops with no gap; the second is hidden from screen readers.
  const moving = rows.length >= 4;
  return (
    <div className="wt" data-testid="whale-ticker" role="region" aria-label="Whale trades, $10K and up, last 6 hours">
      <span className="wt__label"><span className="hm-live__dot" aria-hidden="true" />Whale trades · $10K+</span>
      <div className="wt__view">
        <ul className={moving ? "wt__track wt__track--move" : "wt__track"} style={{ "--n": rows.length } as CSSProperties}>
          {rows.map(t => <Card key={t.id} t={t} />)}
          {moving ? rows.map(t => <li key={`${t.id}:2`} className="wt__card wt__card--dup" aria-hidden="true"><Dup t={t} /></li>) : null}
        </ul>
      </div>
    </div>
  );
}

function Dup({ t }: { t: WhaleTick }) {
  return <>{/* The loop's second copy: the same card, no links in the tab order. */}
    <span className="wt__top"><span className={`wt__venue wt__venue--${t.venue}`}>{VENUE[t.venue]}</span><b className="wt__amt b-num">{dollars(t.amount)}</b></span>
    <span className="wt__out">{t.outcome}</span><span className="wt__m">{t.title}</span>
    <span className="wt__bot"><span className="wt__shift b-num">{t.from !== null && t.to !== null ? `${pct(t.from)} ➔ ${pct(t.to)}` : t.from !== null ? `Filled at ${pct(t.from)}` : ""}</span></span>
  </>;
}
