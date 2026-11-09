/* Figures for the deeper pages, in the terminal (app/pages-terminal.css): KPI tiles, a blue line chart, blue bars and
 * dense one-line rows; green and red only on P&L and price direction.
 *   StatTiles   big numbers with their labels (a <dl>, each tile a .s-stat with dt/dd)
 *   SeriesChart a cumulative line (profit over time): draws with scroll, "now" lands last
 *   Bars        labelled bars that grow from 0 (by category, made money / lost)
 *   Rows        written rows: a title, a line under it, an optional figure at the right */
import type { CSSProperties, ReactNode } from "react";
import { dollars } from "@/lib/money";
import "@/app/pages-terminal.css";

export function StatTiles({ tiles, label }: { tiles: Array<{ label: string; value: string }>; label: string }) {
  return (
    <dl className="s-stats" aria-label={label} data-stagger="">
      {tiles.map(t => <div key={t.label} className="s-stat"><dt className="t-label">{t.label}</dt><dd className="t-kpi b-num">{t.value}</dd></div>)}
    </dl>
  );
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const money = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;

/** fmt "money": cumulative dollars from 0; "cents": a price 0..1. dots: positions on the line (a Custodious Blue dot per position,
 *  sized by its money), popping in at their time. */
export function SeriesChart({ points, label, testid, fmt = "money", dots = [] }: { points: Array<{ t: number; v: number }>; label: string; testid?: string; fmt?: "money" | "cents"; dots?: Array<{ t: number; v: number; r: number; title: string }> }) {
  if (points.length < 2) return null;
  const f = fmt === "money" ? money : (v: number) => `${Math.round(v * 100)}¢`;
  const t0 = Math.min(points[0]!.t, ...dots.map(d => d.t)), t1 = points.at(-1)!.t, vs = [...points.map(p => p.v), ...dots.map(d => d.v)];
  const lo = fmt === "money" ? Math.min(0, ...vs) : Math.max(0, Math.min(...vs) - 0.04), hi = fmt === "money" ? Math.max(0, ...vs) : Math.min(1, Math.max(...vs) + 0.04);
  const span = Math.max(fmt === "money" ? 1 : 0.01, hi - lo);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * 100, y = (v: number) => (1 - (v - lo) / span) * 100;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`).join("");
  const last = points.at(-1)!.v;
  return (
    <figure className="s-chart" data-testid={testid} role="img" aria-label={`${label}: ${f(points[0]!.v)} to ${f(last)}`}>
      <div className="s-chart__plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {fmt === "money" ? <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="s-chart__avg" vectorEffect="non-scaling-stroke" /> : null}
          <path d={d} className="s-chart__line s-draw" pathLength={1} vectorEffect="non-scaling-stroke" />
        </svg>
        {dots.map((d, i) => <i key={i} className="s-chart__entry s-pop" style={{ left: `${x(d.t)}%`, top: `${y(d.v)}%`, width: d.r, height: d.r, "--at": (x(d.t) / 100).toFixed(2) } as CSSProperties} title={d.title} />)}
        <span className="s-chart__now s-land" style={{ top: `${y(last)}%` }}>{fmt === "cents" ? `now ${f(last)}` : f(last)}</span>
      </div>
      <figcaption className="b-small s-chart__axis"><span>{DATE.format(new Date(t0))}</span><span>{DATE.format(new Date(t1))}</span></figcaption>
    </figure>
  );
}

/** Bars: share 0..1 each; the text says the numbers. */
export function Bars({ rows, label }: { rows: Array<{ key: string; name: string; share: number; text: ReactNode }>; label: string }) {
  return (
    <ul className="s-bars" aria-label={label} data-stagger="">
      {rows.map(r => (
        <li key={r.key} className="s-barrow">
          <span className="s-barrow__n">{r.name}</span>
          <span className="s-meterbar"><span className="s-grow" style={{ width: `${Math.round(Math.max(0, Math.min(1, r.share)) * 100)}%` } as CSSProperties} /></span>
          <span className="b-small">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function Rows({ rows, label, testid }: { rows: Array<{ key: string; title: ReactNode; sub: ReactNode; right?: ReactNode; attrs?: Record<string, string> }>; label: string; testid?: string }) {
  return (
    <ul className="s-lockrows s-wrows" aria-label={label} data-testid={testid} data-stagger="">
      {rows.map(r => <li key={r.key} {...r.attrs}><span><span className="s-strong">{r.title}</span><br /><span className="b-small">{r.sub}</span></span>{r.right !== undefined ? <span className="b-small b-num">{r.right}</span> : null}</li>)}
    </ul>
  );
}
