"use client";
/* Real millionaire bets streaming in (/api/millionaires/live every 15 s while the tab is visible); a new one settles in
 * at the top. A counter on top: what millionaire wallets bet today. Visitors get every bet live with the side removed
 * on the server (a lock that opens the paywall). The server renders the first list. */
import { useEffect, useRef, useState } from "react";
import type { BoardBet, Pulse } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { BetRow } from "./BetRow";

export interface FeedState { now: number; pulse: Pulse; bets: BoardBet[] }

export function LiveFeed({ initial, n = 6, cats = [], links = true, settle = true }: { initial: FeedState; n?: number; cats?: readonly string[]; links?: boolean; settle?: boolean }) {
  const [s, set] = useState(initial);
  const first = useRef(new Set(initial.bets.map(b => b.id)));
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/millionaires/live?n=${n}${cats.length ? `&cats=${cats.join(",")}` : ""}`, { cache: "no-store" });
        if (r.ok && !stop) { const j = await r.json(); set({ now: j.now, pulse: j.pulse, bets: j.bets }); }
      } catch { /* keep what we have */ }
    };
    const id = setInterval(tick, 15_000);
    return () => { stop = true; clearInterval(id); };
  }, [n, cats.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="b-feed b-glass b-pad" data-testid="live-feed" {...(settle ? { "data-m": "settle", style: { "--d": ".5s" } as React.CSSProperties } : {})}>
      <div className="b-feed__top">
        <span className="b-label" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span className="b-dot" aria-hidden="true" /> Live</span>
        <span className="b-small"><span className="b-feed__total b-num" style={{ color: "var(--ink)" }} data-testid="feed-total">{dollars(s.pulse.today)}</span> bet by millionaires today</span>
      </div>
      {s.bets.length ? (
        <ul className="b-rows" data-testid="feed-rows" aria-live="polite">
          {s.bets.map((b, i) => (
            <li key={b.id}>
              <BetRow bet={b} now={s.now} href={links ? `/read/open?pick=polymarket:${b.marketId}` : undefined} className={first.current.has(b.id) ? "" : "b-new"}
                settle={settle && first.current.has(b.id) ? 0.6 + i * 0.07 : undefined} />
            </li>
          ))}
        </ul>
      ) : <p className="b-empty" data-testid="feed-empty">No millionaire bets yet today. They show here the moment one lands.</p>}
    </div>
  );
}
