"use client";
/* One line chart for every page (P&L, prices): a thin 2px line, green when it ends up and red when it ends down, one
 * faint baseline and nothing else (no gridlines, no border). Hover or drag shows a crisp tooltip with the exact
 * value and date. Optional dots (a market's big moves, sized by amount). Draws in once (off under reduced motion).
 * Windows (1W 1M 3M 1Y All) re-cut the same points on the client; the points are all sent by the server. */
import { useId, useMemo, useRef, useState, type PointerEvent } from "react";

export interface ChartPoint { t: number; v: number }
export interface ChartDot { t: number; v: number; r: number; label: string; tone: "won" | "lost" | "open" }

const W = 720, H = 240, PAD_T = 16, PAD_B = 16;
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export function LineChart({ points, dots = [], windows, format, baseline = "zero", label, empty, time = false, initial = "all" }: {
  points: ChartPoint[];
  dots?: ChartDot[];
  /** Window tabs; each key's `since` (ms) or null for all. */
  windows?: Array<{ key: string; label: string; since: number | null }>;
  /** money: signed P&L ("+$1,200"); usd: a plain price or value ("$182.40", "$1.2B"); cents: a 0..1 price. */
  format: "money" | "usd" | "cents";
  /** Zero (P&L) or the first point of the window (prices). */
  baseline?: "zero" | "first";
  label: string;
  /** Shown instead of the chart when there aren't enough points. */
  empty: string;
  /** Tooltips with the time of day (prices), not just the date. */
  time?: boolean;
  initial?: string;
}) {
  const [win, setWin] = useState(initial);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const id = useId();
  const since = windows?.find(w => w.key === win)?.since ?? null;
  const view = useMemo(() => {
    if (since === null) return points;
    const inside = points.filter(p => p.t >= since);
    if (format === "money") {
      // P&L: the window starts at 0, so it shows what that window made.
      const before = points.filter(p => p.t < since).at(-1)?.v ?? 0;
      return [{ t: since, v: 0 }, ...inside.map(p => ({ t: p.t, v: p.v - before }))];
    }
    const prev = points.filter(p => p.t < since).at(-1);
    return prev ? [{ t: since, v: prev.v }, ...inside] : inside;
  }, [points, since, format]);
  const vdots = since === null ? dots : dots.filter(d => d.t >= since);

  const fmt = (v: number) => format === "cents" ? `${Math.round(v * 100)}¢`
    : format === "usd" ? (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    : `${v < 0 ? "−" : v > 0 ? "+" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
  if (view.length < 2) {
    return (
      <div className="lchart">
        {windows ? <Tabs windows={windows} on={win} set={setWin} /> : null}
        <div className="lchart__empty">{empty}</div>
      </div>
    );
  }
  const t0 = view[0]!.t, t1 = view.at(-1)!.t;
  const vs = [...view.map(p => p.v), ...vdots.map(d => d.v), ...(baseline === "zero" ? [0] : [])];
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (format === "cents") { lo = Math.max(0, lo - 0.05); hi = Math.min(1, hi + 0.05); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const x = (t: number) => (t1 === t0 ? W / 2 : ((t - t0) / (t1 - t0)) * W);
  const y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);
  const d = view.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
  const up = view.at(-1)!.v >= (baseline === "zero" ? 0 : view[0]!.v);
  const base = y(baseline === "zero" ? 0 : view[0]!.v);
  const h = hover === null ? null : view[hover]!;

  function move(e: PointerEvent<SVGSVGElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < view.length; i++) if (Math.abs(view[i]!.t - t) < Math.abs(view[best]!.t - t)) best = i;
    setHover(best);
  }

  return (
    <div className="lchart">
      {windows ? <Tabs windows={windows} on={win} set={setWin} /> : null}
      <figure className="lchart__fig">
        <p className="lchart__now"><span className={up ? "money" : "loss"}>{fmt(h?.v ?? view.at(-1)!.v)}</span>
          <span className="lchart__when">{h ? (time ? DATE_TIME : DATE).format(new Date(h.t)) : label}</span></p>
        <svg ref={ref} key={`${win}-${id}`} className={`lchart__svg ${up ? "lchart--up" : "lchart--down"}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          role="img" aria-label={`${label}: ${fmt(view[0]!.v)} to ${fmt(view.at(-1)!.v)}`}
          onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}>
          <line className="lchart__base" x1="0" x2={W} y1={base} y2={base} />
          <path className="lchart__line" d={d} />
          {vdots.map((p, i) => <circle key={i} className={`lchart__dot lchart__dot--${p.tone}`} cx={x(p.t)} cy={y(p.v)} r={p.r}><title>{p.label}</title></circle>)}
          {h ? <><line className="lchart__cursor" x1={x(h.t)} x2={x(h.t)} y1="0" y2={H} /><circle className="lchart__knob" cx={x(h.t)} cy={y(h.v)} r="4" /></> : null}
        </svg>
      </figure>
    </div>
  );
}

function Tabs({ windows, on, set }: { windows: Array<{ key: string; label: string }>; on: string; set: (k: string) => void }) {
  return (
    <div className="seg seg--sm lchart__tabs" role="group" aria-label="Time window">
      {windows.map(w => <button key={w.key} type="button" className="seg__btn" aria-pressed={on === w.key} onClick={() => set(w.key)}>{w.label}</button>)}
    </div>
  );
}
