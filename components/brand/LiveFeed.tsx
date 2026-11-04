"use client";
import { decision } from "@/lib/millionaires/decided";
/* Real millionaire bets streaming in (/api/millionaires/live every 15 s while the tab is visible); a new one settles in
 * at the top. A counter on top: what millionaire wallets bet today. Visitors get every bet live with the side removed
 * on the server (a lock that opens the paywall). The server renders the first list. */
import { useEffect, useRef, useState } from "react";
import type { BoardBet, Pulse } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { groupBets } from "@/lib/millionaires/group";
import { BetRow } from "./BetRow";

export interface FeedState { now: number; pulse: Pulse; bets: BoardBet[] }

export function LiveFeed({ initial, n = 6, cats = [], links = true, settle = true, board = false, copy = false, tier = "millionaire" }: { initial: FeedState; n?: number; cats?: readonly string[]; links?: boolean; settle?: boolean;
  /** Wallets up $1M+ (the default) or Pro ($100K–$1M): never mixed. */
  tier?: "millionaire" | "pro";
  /** /board: visitors get bets 60 minutes late (the API applies it). */
  board?: boolean;
  /** Members: a Copy pill on each row (the copy ticket). */
  copy?: boolean }) {
  const [s, set] = useState(initial);
  const [misses, setMisses] = useState(0);
  const first = useRef(new Set(initial.bets.map(b => b.id)));
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/millionaires/live?n=${n}${cats.length ? `&cats=${cats.join(",")}` : ""}${board ? "&board=1" : ""}&tier=${tier}`, { cache: "no-store" });
        if (stop) return;
        if (r.ok) { const j = await r.json(); set({ now: j.now, pulse: j.pulse, bets: j.bets }); setMisses(0); } else setMisses(x => x + 1);
      } catch { if (!stop) setMisses(x => x + 1); /* keep what we have */ }
    };
    const id = setInterval(tick, 15_000);
    return () => { stop = true; clearInterval(id); };
  }, [n, cats.join(","), board, tier]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = groupBets(s.bets.filter(b => b.tier === tier));
  return (
    <div className="b-feed b-glass b-pad" data-testid="live-feed" {...(settle ? { "data-m": "settle", style: { "--d": ".5s" } as React.CSSProperties } : {})}>
      <div className="b-feed__top">
        <span className="b-label" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span className="b-dot" aria-hidden="true" /> {misses >= 2 ? <span data-testid="feed-behind">Catching up</span> : "Live"}</span>
        {/* Today means since midnight ET (as the hero and the board say); before the first bet of the day, the last 24 hours. */}
        {s.pulse.sinceMidnight > 0
          ? <span className="b-small"><span className="b-feed__total b-num b-gold" data-testid="feed-total">{dollars(s.pulse.sinceMidnight)}</span> bet by millionaires today</span>
          : s.pulse.today > 0
            ? <span className="b-small"><span className="b-feed__total b-num b-gold" data-testid="feed-total">{dollars(s.pulse.today)}</span> bet by millionaires in the last 24 hours</span>
            : <span className="b-small" data-testid="feed-total">No millionaire bets in the last 24 hours</span>}
      </div>
      {rows.length ? (
        <ul className="b-rows" data-testid="feed-rows" aria-live="polite">
          {rows.map((b, i) => (
            <li key={b.id}>
              <BetRow bet={b} now={s.now} href={links ? `/market/${encodeURIComponent(b.marketId)}` : undefined} copyHref={copy && !decision(b) ? `/copy/${encodeURIComponent(b.id)}` : undefined} className={first.current.has(b.id) ? "" : "b-new"}
                settle={settle && first.current.has(b.id) ? 0.6 + i * 0.07 : undefined} />
            </li>
          ))}
        </ul>
      ) : <p className="b-empty" data-testid="feed-empty">No millionaire bets in the last 24 hours. They show here the moment one lands.</p>}
    </div>
  );
}
