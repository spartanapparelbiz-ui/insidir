"use client";
/* Form 4 filings per hour, last 24 hours: one series, so no legend (the card title names it); a 2px line over a soft
 * fill, recessive grid, three y gridlines, x labels every 6 hours, and a crosshair + tooltip on hover (dataviz skill).
 * Labels come from the data's own timestamp, never the browser clock, so server and browser draw the same chart. */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

const PAD = { l: 34, r: 8, t: 10, b: 24 };
const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const HOUR = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric" });

/** A smooth path through the points (Catmull-Rom as cubic Béziers), clamped so it never dips below zero. */
function smooth(pts: Array<[number, number]>, floor: number): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    const c1y = Math.min(floor, p1[1] + (p2[1] - p0[1]) / 6), c2y = Math.min(floor, p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${c1y} ${p2[0] - (p3[0] - p1[0]) / 6},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}
const nice = (n: number) => { if (n <= 4) return 4; const p = 10 ** Math.floor(Math.log10(n)); const m = n / p; return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

export function AreaChart({ hours, at }: { hours: number[]; at: number }) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  // Drawn at the card's real pixel size (measured), so the text is never stretched; 640×190 until measured.
  const box = useRef<HTMLDivElement>(null);
  const [{ W, H }, setSize] = useState({ W: 640, H: 190 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e!.contentRect.width), h = Math.round(e!.contentRect.height); if (w > 40 && h > 40) setSize({ W: w, H: h }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = nice(Math.max(...hours, 1));
  const geo = useMemo(() => {
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b, base = PAD.t + ih;
    const pts = hours.map((v, i): [number, number] => [PAD.l + (i / (hours.length - 1)) * iw, base - (v / max) * ih]);
    const line = smooth(pts, base);
    return { pts, line, area: `${line} L${pts.at(-1)![0]},${base} L${pts[0]![0]},${base} Z`, base, iw };
  }, [hours, max, W, H]);
  const total = hours.reduce((a, b) => a + b, 0);
  const binStart = (i: number) => at - (hours.length - i) * 3_600_000;

  // The tooltip follows the crosshair (set on the element, not as an inline style prop).
  useLayoutEffect(() => { if (tip.current && hover !== null) tip.current.style.left = `${(geo.pts[hover]![0] / W) * 100}%`; }, [hover, geo, W]);
  if (!total) return <div className="lp-chart"><p className="lp-small">No Form 4s in the last 24 hours yet. They appear here as EDGAR publishes them.</p></div>;
  const h = hover === null ? null : { i: hover, x: geo.pts[hover]![0], y: geo.pts[hover]![1] };
  return (
    <div className="lp-chart" onMouseLeave={() => setHover(null)}>
      <div ref={box} className="lp-chart__box">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Form 4 filings per hour over the last 24 hours, ${total} in all, at most ${Math.max(...hours)} in one hour`}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(hours.length - 1, Math.round(((x - PAD.l) / geo.iw) * (hours.length - 1)))));
        }}>
        <defs>
          <linearGradient id={`lp-area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="grid">{[0, 0.5, 1].map(f => <line key={f} x1={PAD.l} x2={W - PAD.r} y1={geo.base - f * (geo.base - PAD.t)} y2={geo.base - f * (geo.base - PAD.t)} />)}</g>
        <g className="axis">
          {[0, 0.5, 1].map(f => <text key={f} x={PAD.l - 8} y={geo.base - f * (geo.base - PAD.t) + 4} textAnchor="end">{Math.round(max * f)}</text>)}
          {[0, 6, 12, 18, 23].map(i => <text key={i} x={geo.pts[i]![0]} y={H - 4} textAnchor={i === 0 ? "start" : i === 23 ? "end" : "middle"}>{i === 23 ? "Now" : HOUR.format(new Date(binStart(i)))}</text>)}
        </g>
        <path d={geo.area} fill={`url(#lp-area-${id})`} className="lp-area-fill" />
        <path d={geo.line} className="line" />
        {h ? <><line className="cross" x1={h.x} x2={h.x} y1={PAD.t} y2={geo.base} /><circle className="dot" cx={h.x} cy={h.y} r="4.5" /></> : null}
        {/* Hit targets wider than the marks: one invisible column per hour. */}
        {hours.map((_, i) => <rect key={i} x={geo.pts[i]![0] - geo.iw / 46} y={PAD.t} width={geo.iw / 23} height={geo.base - PAD.t} fill="transparent" />)}
      </svg>
      {/* Inside the measured box, so its left offset lines up with the crosshair exactly. */}
      {h ? (
        <div ref={tip} className="lp-tip" role="status">
          <b>{hours[h.i]} Form 4{hours[h.i] === 1 ? "" : "s"}</b> · {TIME.format(new Date(binStart(h.i)))}–{TIME.format(new Date(binStart(h.i) + 3_600_000))} ET
        </div>
      ) : null}
      </div>
    </div>
  );
}
