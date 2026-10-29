"use client";
/* The cumulative "$500 per green deal" line: one Paper line, no fill, one point per settled green deal (real data,
 * by settle date). Hover, or focus the chart and use the arrow keys, to read a point's date and running total. */
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export interface ChartPoint { at: number; value: number; label: string; valueText: string; dateText: string }

const W = 1000, H = 240, PAD_Y = 16;
const fmtAxis = (v: number) => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function ProfitChart({ points, summary }: { points: ChartPoint[]; summary: string }) {
  const [i, setI] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const geo = useMemo(() => {
    const t0 = points[0]!.at, t1 = points[points.length - 1]!.at;
    const vs = points.map(p => p.value);
    const lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
    const x = (t: number) => (t1 === t0 ? W / 2 : ((t - t0) / (t1 - t0)) * W);
    const y = (v: number) => (hi === lo ? H / 2 : PAD_Y + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD_Y));
    return { xy: points.map(p => [x(p.at), y(p.value)] as const), zero: y(0), lo, hi };
  }, [points]);

  const near = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const fx = ((clientX - r.left) / r.width) * W;
    let best = 0;
    geo.xy.forEach(([x], k) => { if (Math.abs(x - fx) < Math.abs(geo.xy[best]![0] - fx)) best = k; });
    setI(best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setI(k => Math.max(0, Math.min(points.length - 1, (k ?? (e.key === "ArrowRight" ? -1 : points.length)) + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Home") { e.preventDefault(); setI(0); }
    else if (e.key === "End") { e.preventDefault(); setI(points.length - 1); }
  };
  const p = i === null ? null : points[i]!;
  const at = i === null ? null : geo.xy[i]!;
  const last = points[points.length - 1]!;
  return (
    <figure className="rx-chart">
      <figcaption className="rx-chart__cap">
        <span>Cumulative net P&L, $500 per green deal, after fees</span>
        <span className="mono rx-chart__now">{p ? `${p.dateText}  ${p.valueText}` : `${last.dateText}  ${last.valueText}`}</span>
      </figcaption>
      <div className="rx-chart__y mono" aria-hidden="true"><span>{fmtAxis(geo.hi)}</span><span className="rx-chart__axis-t">Cumulative, $</span><span>{fmtAxis(geo.lo)}</span></div>
      <div className="rx-chart__box" ref={box} tabIndex={0} role="img" aria-label={summary} onKeyDown={onKey}
        onPointerMove={(e: PointerEvent) => near(e.clientX)} onPointerLeave={() => setI(null)} onBlur={() => setI(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {geo.lo < 0 ? <line x1="0" x2={W} y1={geo.zero} y2={geo.zero} className="rx-chart__zero" vectorEffect="non-scaling-stroke" /> : null}
          <polyline points={geo.xy.map(([x, y]) => `${x},${y}`).join(" ")} className="rx-chart__line" vectorEffect="non-scaling-stroke" />
          {at ? <line x1={at[0]} x2={at[0]} y1="0" y2={H} className="rx-chart__cursor" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {at ? <span className="rx-chart__dot" style={{ left: `${(at[0] / W) * 100}%`, top: `${(at[1] / H) * 100}%` }} aria-hidden="true" /> : null}
      </div>
      <div className="rx-chart__axis mono" aria-hidden="true"><span>{points[0]!.dateText}</span><span className="rx-chart__axis-t">Settled date</span><span>{last.dateText}</span></div>
      <p className="sr-only" aria-live="polite">{p ? `${p.dateText}: ${p.valueText} cumulative, after ${p.label}` : ""}</p>
    </figure>
  );
}
