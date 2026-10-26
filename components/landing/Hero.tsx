"use client";
/* 1. The hero: the headline, then the split as the page's centrepiece, then the sub-line and the CTA under it.
 * The split is never empty. In order of preference (components/landing/model.ts heroView):
 *   live  a live green deal on the viewer's clock (free visitors see it 30 minutes late, like the feed); its prices
 *         tick when the worker sees them move;
 *   last  else the most recent real deal from the receipts of the last 7 days: "Last deal: …, closed … ago.";
 *   near  else the closest matched market's real prices, labelled "Not a deal yet: 101¢ in.";
 * and when live data is paused, whichever it is shows greyed out with "Last updated … ago." Only before the scanner
 * has ever run is there no split; then the hero is its words alone, never empty boxes. On load the prices roll in,
 * the seam closes and the number lands (CSS, app/landing.css): the page's one orchestrated motion. */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveContext, useServerNow } from "@/components/live/LiveProvider";
import { ago, centsText, clockText, pct, span } from "@/lib/format";
import { DollarBar } from "@/components/ui/DollarBar";
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

export interface HeroProps {
  view: HeroView | null;
  delayMs: number;
  medianLifeMin: number | null;
  headline: string;
  sub: string;
  cta: string;
  serverNow: number;
  scanner: { live: boolean; lastScanAt: number | null };
}

const round1 = (c: number) => Math.round(c * 10) / 10;
/** A title as a sentence: ends in exactly one stop ("Will X win?" stays as is). */
const sentence = (t: string) => (/[.?!]$/.test(t.trim()) ? t.trim() : t.trim() + ".");
/** The bar's segments: "YES on Kalshi" etc. */
const barLegs = (legs: HeroLeg[]) => legs.map(l => ({ label: `${l.side} on ${l.venueName}`, cents: l.priceCents }));
const legText = (l: HeroLeg) => `${l.venueName} ${l.side} ${centsText(l.priceCents)}`;

function Side({ leg, which }: { leg: HeroLeg; which: "a" | "b" }) {
  return (
    <div className={`split__side split__side--${which}`}>
      <p className="split__venue">{leg.venueName}</p>
      <p className="split__price"><span className="split__dir">{leg.side}</span><Rolling value={leg.priceCents} format={centsText} className="split__num" /></p>
    </div>
  );
}

export function Hero({ view: initial, delayMs, medianLifeMin, headline, sub, cta, serverNow, scanner: initialScanner }: HeroProps) {
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
    // Not a deal: the bar shows the two prices against $1 (over $1 leaves nothing; under, the fees eat it).
    seam = <>
      <p className="split__math"><span className="mono">{centsText(n.totalCents)}</span> in. <span className="mono">$1</span> back.</p>
      <DollarBar legs={barLegs(n.legs)} feesCents={edge > 0 ? edge : 0} size="lg" animate
        keepLabel={edge > 0 ? "Fees eat the rest" : undefined} />
    </>;
    caption = <><span className="hero__title">{sentence(n.title)}</span> {legText(n.legs[0]!)} / {legText(n.legs[1]!)}. Not a deal yet: <span className="mono">{centsText(n.totalCents)}</span> in.</>;
    label = `${n.title}: ${legText(n.legs[0]!)}, ${legText(n.legs[1]!)}. Not a deal yet: ${centsText(n.totalCents)} in.`;
  } else if (view) {
    const s = view.split;
    legs = s.legs;
    const inCents = round1(s.legs[0]!.priceCents + s.legs[1]!.priceCents);
    // The $1 bar: what the two sides cost, the fees, and what's left. Cents per $1 of payout, not dollars at a
    // stake: the free page never sends a deal's size.
    const keep = profitCentsPerDollar(s.roi);
    seam = <>
      <p className="split__math"><span className="mono">{centsText(inCents)}</span> in. <span className="mono">$1</span> back. Either way.</p>
      <DollarBar legs={barLegs(s.legs)} feesCents={Math.max(0, round1(100 - inCents - keep))} size="lg" animate
        keepLabel={`You keep ${centsText(keep)}${view.mode === "last" ? " (when found)" : ""}`} />
    </>;
    if (view.mode === "last") {
      caption = <>Last deal: <span className="hero__title">{s.title}</span>, <span className="mono">{pct(s.roi)}</span> after fees, closed {ago(s.closedAt ?? clock, now)}.</>;
    } else if (closed && delayMs > 0) {
      caption = <><span className="hero__title">{s.title}</span> This gap has now closed. Members got it at <span className="mono">{clockText(s.firstSeenAt)}</span>; free viewers see deals 30 minutes later.</>;
    } else if (closed) {
      caption = <><span className="hero__title">{s.title}</span> This gap closed after <span className="mono">{span(closed.closedAt - s.firstSeenAt)}</span>.</>;
    } else {
      const t = <span className="mono">{span(clock - s.firstSeenAt)}</span>;
      const most = medianLifeMin !== null ? <> Most close within {Math.max(1, Math.round(medianLifeMin))} min.</> : null;
      caption = <><span className="hero__title">{s.title}</span> {delayMs > 0 ? <>Shown 30 minutes late. By then this gap had been open {t}.{most}</> : <>This gap has been open {t}.{most}</>}</>;
    }
    label = `${s.title}: buy ${legText(s.legs[0]!)} and ${legText(s.legs[1]!)}.`;
  }

  return (
    <section className="hero" data-section="hero" data-hero={view?.mode ?? "none"} aria-labelledby="hero-h">
      <h1 id="hero-h" className="hero__h">{headline}</h1>
      {view && legs.length === 2 ? (
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
      ) : null}
      <p className="hero__sub">{sub}</p>
      <div className="hero__cta">
        <Link className="btn btn--primary btn--big" href="/terminal">{cta}</Link>
        <span className="hero__note">Free to look. No signup.</span>
      </div>
    </section>
  );
}
