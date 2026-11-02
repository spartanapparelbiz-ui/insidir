"use client";
/* THE LIVE FEED: real millionaire bets streaming in as they happen (/api/millionaires/live every 15 seconds while the tab
 * is visible), each new one sliding in from the top, with the total millionaires bet today ticking on top. Visitors:
 * when, how much, the wallet's profit and the market are live; the side comes as a lock that opens the paywall sheet.
 * The server renders the first list, so it is complete before any JavaScript runs. */
import { useEffect, useRef, useState } from "react";
import type { BoardBet, Pulse } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { BetRow } from "./BetRow";
import { gsap, reduced, register } from "./scroll/engine";

export interface FeedState { now: number; pulse: Pulse; bets: BoardBet[] }

export function LiveFeed({ initial, n = 6, cats = [], readHref = true, title = "Live: millionaire bets" }: { initial: FeedState; n?: number; cats?: readonly string[]; readHref?: boolean; title?: string }) {
  const [s, set] = useState(initial);
  const list = useRef<HTMLUListElement>(null);
  const total = useRef<HTMLSpanElement>(null);
  const seen = useRef(new Set(initial.bets.map(b => b.id)));
  const shown = useRef(initial.pulse.today);

  useEffect(() => {
    register();
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

  // New rows slide in from the top; the total ticks to its new value.
  useEffect(() => {
    const fresh = [...(list.current?.querySelectorAll<HTMLElement>("[data-feed-id]") ?? [])].filter(el => !seen.current.has(el.dataset.feedId!));
    for (const el of fresh) seen.current.add(el.dataset.feedId!);
    if (fresh.length && !reduced()) gsap.from(fresh, { y: -18, opacity: 0, duration: 0.8, ease: "expo.out", stagger: 0.08, clearProps: "transform,opacity" });
    const to = s.pulse.today, from = shown.current;
    if (to !== from && total.current) {
      const o = { v: from };
      if (reduced()) total.current.textContent = dollars(to);
      else gsap.to(o, { v: to, duration: 1, ease: "power3.out", onUpdate: () => { if (total.current) total.current.textContent = dollars(o.v); } });
      shown.current = to;
    }
  }, [s]);

  return (
    <aside className="b-feed b-glass b-glass--solid" aria-label={title} data-testid="live-feed">
      <div className="b-feed__top">
        <span className="b-label"><span className="b-dot" aria-hidden="true" /> {title}</span>
        <span className="b-small"><span className="b-feed__total" ref={total} data-testid="feed-total">{dollars(s.pulse.today)}</span> bet by millionaires today</span>
      </div>
      {s.bets.length ? (
        <ul className="b-feed__list" ref={list} data-testid="feed-rows" aria-live="polite">
          {s.bets.map(b => (
            <li key={b.id} data-feed-id={b.id}>
              <BetRow bet={b} now={s.now} href={readHref ? `/read/open?pick=polymarket:${b.marketId}` : undefined} />
            </li>
          ))}
        </ul>
      ) : <p className="b-small" data-testid="feed-empty">No millionaire bets yet today. They show here the moment one lands.</p>}
    </aside>
  );
}
