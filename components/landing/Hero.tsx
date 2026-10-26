"use client";
/* 1. The split. Left: one app's price. Right: the other's. In the seam the math resolves: what you pay, $1 back
 * either way, and the profit in large white numbers. The deal is real (the last 24 hours, on the viewer's clock: free visitors see it
 * 30 minutes late, like the feed); its prices tick when the worker sees them move. On load the prices roll in, the
 * seam closes and the profit lands (CSS, app/landing.css): the page's one orchestrated motion. Reduced motion:
 * everything is simply there, and ticks swap the number without moving it.
 * Also here: the scanner heartbeat (real last-scan time) and how long this gap has been open (real elapsed time). */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveContext, useServerNow } from "@/components/live/LiveProvider";
import { centsText, clockText, span } from "@/lib/format";
import { profitCentsPerDollar, type HeroSplit } from "./model";

/** A number that rolls to each new value with a brief highlight (the load-time roll-in is CSS, in app/landing.css). */
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
  split: HeroSplit | null;
  delayMs: number;
  medianLifeMin: number | null;
  headline: string;
  sub: string;
  cta: string;
  serverNow: number;
  scanner: { live: boolean; lastScanAt: number | null };
}

export function Hero({ split: initial, delayMs, medianLifeMin, headline, sub, cta, serverNow, scanner: initialScanner }: HeroProps) {
  const live = useLiveContext();
  const now = useServerNow(serverNow);
  const [split, setSplit] = useState(initial);
  const [closed, setClosed] = useState<{ firstSeenAt: number; closedAt: number } | null>(null);

  useEffect(() => {
    if (!initial) return;
    const offTick = live.on("price_tick", e => {
      if (e.oppId !== initial.oppId) return;
      setSplit(s => s && { ...s, roi: e.data.roi, legs: s.legs.map((l, i) => ({ ...l, priceCents: e.data.legs[i]?.priceCents ?? l.priceCents })) });
    });
    const offClose = live.on("deal_closed", e => {
      if (e.oppId === initial.oppId) setClosed({ firstSeenAt: e.data.firstSeenAt, closedAt: e.data.closedAt });
    });
    return () => { offTick(); offClose(); };
  }, [live, initial]);

  const scan = live.scanner ?? { ...initialScanner };
  const beat = scan.live && scan.lastScanAt !== null
    ? <>Scanning live. Last scan <span className="mono">{Math.max(0, Math.floor((now - scan.lastScanAt) / 1000))}s</span> ago.</>
    : <>Live data paused, retrying.</>;

  const a = split?.legs[0], b = split?.legs[1];
  const inCents = a && b ? Math.round((a.priceCents + b.priceCents) * 10) / 10 : null;
  const profit = split ? profitCentsPerDollar(split.roi) : null;
  const clock = now - delayMs;

  let open: ReactNode = null;
  if (split) {
    const closedAt = closed?.closedAt ?? split.closedAt;
    if (closed && delayMs > 0) {
      open = <>This gap has now closed. Members got it at <span className="mono">{clockText(split.firstSeenAt)}</span>; free viewers see deals 30 minutes later.</>;
    } else if (closedAt !== null && closedAt <= clock) {
      open = <>This gap closed after <span className="mono">{span(closedAt - split.firstSeenAt)}</span>.</>;
    } else {
      const t = <span className="mono">{span(clock - split.firstSeenAt)}</span>;
      const most = medianLifeMin !== null ? <> Most close within {Math.max(1, Math.round(medianLifeMin))} min.</> : null;
      open = delayMs > 0
        ? <>Shown 30 minutes late. By then this gap had been open {t}.{most}</>
        : <>This gap has been open {t}.{most}</>;
    }
  }

  return (
    <section className="hero" data-section="hero" aria-labelledby="hero-h">
      <p className={`beat${scan.live ? "" : " beat--paused"}`} role="status"><span className="beat__dot" aria-hidden="true" />{beat}</p>
      {split && a && b ? (
        <div className="split" data-opp={split.oppId} aria-label={`${split.title}: buy ${a.side} on ${a.venueName} at ${centsText(a.priceCents)} and ${b.side} on ${b.venueName} at ${centsText(b.priceCents)}.`}>
          <div className="split__side split__side--a">
            <p className="split__venue">{a.venueName}</p>
            <p className="split__price"><span className="split__dir">{a.side}</span><Rolling value={a.priceCents} format={centsText} className="split__num" /></p>
          </div>
          <div className="split__seam">
            <p className="split__math"><span className="mono">{inCents !== null ? centsText(inCents) : ""}</span> in. <span className="mono">$1</span> back. Either way.</p>
            <p className="split__profit"><Rolling value={profit ?? 0} format={v => `${v.toFixed(1)}¢`} className="split__win" /><span className="split__per">profit per $1, after fees</span></p>
          </div>
          <div className="split__side split__side--b">
            <p className="split__venue">{b.venueName}</p>
            <p className="split__price"><span className="split__dir">{b.side}</span><Rolling value={b.priceCents} format={centsText} className="split__num" /></p>
          </div>
        </div>
      ) : (
        <div className="split split--empty">
          <div className="split__side split__side--a"><p className="split__venue">Kalshi</p><p className="split__price split__price--none">No deal yet</p></div>
          <div className="split__seam"><p className="split__math">No green deal in the last 24 hours. The next one shows up here.</p></div>
          <div className="split__side split__side--b"><p className="split__venue">Polymarket</p><p className="split__price split__price--none">No deal yet</p></div>
        </div>
      )}
      {split ? <p className="hero__deal"><span className="hero__title">{split.title}</span> <span className="hero__open">{open}</span></p> : null}
      <div className="hero__copy">
        <h1 id="hero-h" className="hero__h">{headline}</h1>
        <p className="hero__sub">{sub}</p>
        <div className="hero__cta">
          <Link className="btn btn--primary btn--big" href="/terminal">{cta}</Link>
          <span className="hero__note">Free to look. No signup.</span>
        </div>
      </div>
    </section>
  );
}
