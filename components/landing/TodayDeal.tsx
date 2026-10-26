"use client";
/* Below the fold: a real deal, right now, as the split (the hero above it is the fixed 55¢ + 40¢ example).
 * The split is never empty. In order of preference (components/landing/model.ts heroView):
 *   live  a live green deal on the viewer's clock (free visitors see it 30 minutes late, like the feed); its prices
 *         tick when the worker sees them move;
 *   last  else the most recent real deal from the receipts of the last 7 days: "Last deal: …, closed … ago.";
 *   near  else the closest matched market's real prices, labelled "Not a deal yet: 101¢ in.";
 * and when live data is paused, whichever it is shows greyed out with "Last updated … ago." Only before the scanner
 * has ever run is there no split; then the hero is its words alone, never empty boxes. On load the prices roll in,
 * the seam closes and the number lands (CSS, app/landing.css): the page's one orchestrated motion. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveContext, useServerNow } from "@/components/live/LiveProvider";
import { ago, centsText, clockText, pct, span } from "@/lib/format";
import { profitCentsPerDollar, type HeroLeg, type HeroView } from "./model";

/** A number that rolls to each new value with a brief white flash (the load-time roll-in is CSS). */
function Rolling({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const [ticks, setTicks] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setTicks(t => t + 1);
  }, [value]);
  return <span key={ticks} className={`roll${ticks ? " roll--tick" : ""}${className ? ` ${className}` : ""}`}>{format(value)}</span>;
}

export interface TodayDealProps {
  view: HeroView | null;
  delayMs: number;
  medianLifeMin: number | null;
  serverNow: number;
  scanner: { live: boolean; lastScanAt: number | null };
}

const round1 = (c: number) => Math.round(c * 10) / 10;
/** A title as a sentence: ends in exactly one stop ("Will X win?" stays as is). */
const sentence = (t: string) => (/[.?!]$/.test(t.trim()) ? t.trim() : t.trim() + ".");
const legText = (l: HeroLeg) => `${l.venueName} ${l.side} ${centsText(l.priceCents)}`;

function Side({ leg, which }: { leg: HeroLeg; which: "a" | "b" }) {
  return (
    <div className={`split__side split__side--${which}`}>
      <p className="split__venue">{leg.venueName}</p>
      <p className="split__price"><span className="split__dir">{leg.side}</span><Rolling value={leg.priceCents} format={centsText} className="split__num" /></p>
    </div>
  );
}

export function TodayDeal({ view: initial, delayMs, medianLifeMin, serverNow, scanner: initialScanner }: TodayDealProps) {
  const live = useLiveContext();
  const now = useServerNow(serverNow);
  const [view, setView] = useState(initial);
  const [closed, setClosed] = useState<{ closedAt: number } | null>(null);

  // Only a live deal moves: its prices tick, and it can close while you watch.
  const liveId = initial?.mode === "live" ? initial.split.oppId : null;
  useEffect(() => {
    if (!liveId) return;
    const offTick = live.on("price_tick", e => {
      if (e.oppId !== liveId) return;
      setView(v => v && v.mode === "live"
        ? { ...v, split: { ...v.split, roi: e.data.roi, legs: v.split.legs.map((l, i) => ({ ...l, priceCents: e.data.legs[i]?.priceCents ?? l.priceCents })) } }
        : v);
    });
    const offClose = live.on("deal_closed", e => { if (e.oppId === liveId) setClosed({ closedAt: e.data.closedAt }); });
    return () => { offTick(); offClose(); };
  }, [live, liveId]);

  const scan = live.scanner ?? initialScanner;
  const paused = !scan.live;
  const clock = now - delayMs;

  let legs: HeroLeg[] = [];
  let seam: ReactNode = null;
  let caption: ReactNode = null;
  let label = "";
  if (view?.mode === "near") {
    const n = view.near;
    legs = n.legs;
    const edge = round1(100 - n.totalCents);
    seam = <>
      <p className="split__math"><span className="mono">{centsText(n.totalCents)}</span> in. <span className="mono">$1</span> back.</p>
      <p className="split__profit"><span className="split__win split__win--none">{edge > 0 ? "+" : edge < 0 ? "−" : ""}{centsText(Math.abs(edge))}</span>
        <span className="split__per">{edge > 0 ? "per $1, but the fees eat it" : "per $1. Nothing to keep at these prices"}</span></p>
    </>;
    caption = <><span className="hero__title">{sentence(n.title)}</span> {legText(n.legs[0]!)} / {legText(n.legs[1]!)}. Not a deal yet: <span className="mono">{centsText(n.totalCents)}</span> in.</>;
    label = `${n.title}: ${legText(n.legs[0]!)}, ${legText(n.legs[1]!)}. Not a deal yet: ${centsText(n.totalCents)} in.`;
  } else if (view) {
    const s = view.split;
    legs = s.legs;
    const inCents = round1(s.legs[0]!.priceCents + s.legs[1]!.priceCents);
    seam = <>
      <p className="split__math"><span className="mono">{centsText(inCents)}</span> in. <span className="mono">$1</span> back. Either way.</p>
      <p className="split__profit"><Rolling value={profitCentsPerDollar(s.roi)} format={v => `${v.toFixed(1)}¢`} className="split__win" />
        <span className="split__per">you keep per $1, after fees{view.mode === "last" ? ", when we found it" : ""}</span></p>
    </>;
    if (view.mode === "last") {
      caption = <>Last deal: <span className="hero__title">{s.title}</span>. You made <span className="mono">{pct(s.roi)}</span> after fees. It ended {ago(s.closedAt ?? clock, now)}.</>;
    } else if (closed && delayMs > 0) {
      caption = <><span className="hero__title">{s.title}</span> This gap has now closed. Members got it at <span className="mono">{clockText(s.firstSeenAt)}</span>. Free users see deals 30 minutes later.</>;
    } else if (closed) {
      caption = <><span className="hero__title">{s.title}</span> This gap closed after <span className="mono">{span(closed.closedAt - s.firstSeenAt)}</span>.</>;
    } else {
      const t = <span className="mono">{span(clock - s.firstSeenAt)}</span>;
      const most = medianLifeMin !== null ? <> Most close in {Math.max(1, Math.round(medianLifeMin))} min.</> : null;
      caption = <><span className="hero__title">{s.title}</span> {delayMs > 0 ? <>Shown 30 minutes late. By then this gap had been open {t}.{most}</> : <>This gap has been open {t}.{most}</>}</>;
    }
    label = `${s.title}: buy ${legText(s.legs[0]!)} and ${legText(s.legs[1]!)}.`;
  }

  if (!view || legs.length !== 2) return null;
  return (
    <section className="sec today" data-section="today" data-hero={view.mode} aria-labelledby="today-h">
      <h2 id="today-h" className="sec__h">{view.mode === "live" ? "A real one, right now" : view.mode === "last" ? "The last real one" : "The closest one right now"}</h2>
      <figure className="hero__deal-wrap">
        <div className={`split split--${view.mode}${paused ? " split--paused" : ""}`} aria-label={label}>
          <Side leg={legs[0]!} which="a" />
          <div className="split__seam">{seam}</div>
          <Side leg={legs[1]!} which="b" />
        </div>
        <figcaption className="hero__deal">
          {paused ? <span className="hero__updated">{scan.lastScanAt !== null ? `Last updated ${ago(scan.lastScanAt, now)}.` : "Live data paused."} </span> : null}
          {caption}
        </figcaption>
      </figure>
    </section>
  );
}
