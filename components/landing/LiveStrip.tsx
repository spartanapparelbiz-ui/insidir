"use client";
/* 2. The live strip: today's real numbers (deals found, biggest, median, left on the table) and the running total
 * flagged since launch, then a tape of the latest real events you can swipe through. Every item is a row in
 * terminal.live_events (data-event-id) or a number from the database; nothing is invented. The count of deals found
 * today rolls up when the worker finds one. When nothing is happening the tape says so. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveContext, useServerNow } from "@/components/live/LiveProvider";
import type { LiveEvent } from "@/lib/live/types";
import { agoOrNow, pct, span, usd } from "@/lib/format";

export interface StripStats {
  foundToday: number;
  biggestRoi: number | null;
  medianRoi: number | null;
  left: { total: number; deals: number } | null;
  flagged: { total: number; since: number } | null;
  medianGapMin: number | null;
  /** Start of "today" on the viewer's clock (UTC midnight). */
  todayStart: number;
}

const SINCE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function tapeText(e: LiveEvent, now: number): string | null {
  switch (e.type) {
    case "deal_found": return `New deal: ${e.data.row.title}, ${pct(e.data.row.roi)} after fees, ${agoOrNow(e.data.row.foundAt, now)}`;
    case "deal_closed": return e.data.title ? `Closed: ${e.data.title}, lasted ${span(e.data.lifeMs)}` : `Closed: a deal only members saw, lasted ${span(e.data.lifeMs)}`;
    case "whale": return `Big bet: ${usd(e.data.cash)} on ${e.data.outcome}, ${e.data.marketTitle}`;
    default: return null;
  }
}

export function LiveStrip({ stats, initialTape, serverNow }: { stats: StripStats; initialTape: LiveEvent[]; serverNow: number }) {
  const live = useLiveContext();
  const now = useServerNow(serverNow);
  const [found, setFound] = useState(stats.foundToday);
  const [biggest, setBiggest] = useState(stats.biggestRoi);
  const [bumped, setBumped] = useState(0);
  const counted = useRef(new Set<string>());

  useEffect(() => live.on("deal_found", e => {
    const r = e.data.row;
    if (r.kind === "second_opinion" || r.foundAt < stats.todayStart || counted.current.has(r.id)) return;
    counted.current.add(r.id);
    setFound(n => n + 1);
    setBumped(b => b + 1);
    setBiggest(x => (x === null || r.roi > x ? r.roi : x));
  }), [live, stats.todayStart]);

  const tape = useMemo(() => {
    const byId = new Map<number, LiveEvent>();
    for (const e of [...live.events, ...initialTape]) if (e.type !== "price_tick") byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, 12);
  }, [live.events, initialTape]);

  // Items that arrived after the page loaded flash white once as they slide in.
  const loadedMax = useMemo(() => initialTape.reduce((m, e) => Math.max(m, e.id), 0), [initialTape]);
  const newest = tape[0]?.at ?? null;
  const quiet = newest === null || (stats.medianGapMin !== null && now - newest > Math.max(10, stats.medianGapMin * 2) * 60_000);

  return (
    <section className="strip" data-section="live" aria-labelledby="strip-h">
      <h2 id="strip-h" className="sr-only">Today, live</h2>
      <dl className="strip__nums">
        <div className="strip__num">
          <dt>Deals found today</dt>
          <dd className="mono"><span key={bumped} className={bumped ? "roll roll--tick" : undefined} data-testid="found-today">{found}</span></dd>
        </div>
        {biggest !== null ? <div className="strip__num"><dt>Biggest</dt><dd className="mono">{pct(biggest)}</dd></div> : null}
        {stats.medianRoi !== null ? <div className="strip__num"><dt>Median</dt><dd className="mono">{pct(stats.medianRoi)}</dd></div> : null}
        {stats.left ? <div className="strip__num"><dt>Left on the table today</dt><dd className="mono profit">{usd(stats.left.total)}</dd></div> : null}
      </dl>
      {stats.flagged ? (
        <p className="strip__flagged">
          <span className="mono profit">{usd(stats.flagged.total)}</span> in profit flagged since {SINCE.format(new Date(stats.flagged.since))}.
          <span className="strip__foot"> If every green deal was taken at $500, after fees. Flagged, not won: you still have to place both sides.</span>
        </p>
      ) : null}
      <div className="tape" role="region" aria-label="Latest events" tabIndex={0}>
        {quiet ? (
          <p className="tape__quiet">
            {stats.medianGapMin !== null ? <>Quiet right now. Deals usually show up every <span className="mono">{Math.max(1, Math.round(stats.medianGapMin))}</span> min.</> : <>Quiet right now. New deals show up here as the scanner finds them.</>}
          </p>
        ) : null}
        <ol className="tape__list">
          {tape.map(e => {
            const text = tapeText(e, now);
            return text ? <li key={e.id} className={`tape__item tape__item--${e.type}${e.id > loadedMax ? " tape__item--fresh" : ""}`} data-event-id={e.id}>{text}</li> : null;
          })}
        </ol>
      </div>
    </section>
  );
}
