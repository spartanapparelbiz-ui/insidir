"use client";
/* The "What you could have kept" slider (docs/BRIEF.md §4.9). The points are computed on the server (lib/kept.ts),
 * one per stake; the slider only picks between them. Hidden when there's no curve (too few settled deals). */
import { useState } from "react";
import { RollNumber } from "@/components/ui/RollNumber";
import { money2 } from "@/lib/format";
import type { KeptPoint } from "@/lib/kept";

const dollars = (v: number) => "$" + v.toLocaleString("en-US");

export function KeptSlider({ points, period = "last week", initial = 500 }: { points: readonly KeptPoint[] | null; period?: string; initial?: number }) {
  const start = Math.max(0, points?.findIndex(p => p.stake === initial) ?? 0);
  const [i, setI] = useState(start);
  if (!points?.length) return null;
  const p = points[Math.min(i, points.length - 1)]!;
  const lost = p.kept < 0;
  return (
    <div className="kept">
      <p className="kept__line" aria-live="polite">
        If you&apos;d put <span className="kept__stake mono">{dollars(p.stake)}</span> into every green deal {period}, you&apos;d have {lost ? "lost" : "kept"}{" "}
        <RollNumber className="kept__n" text={money2(Math.abs(p.kept))} /> after fees.
      </p>
      <input className="kept__range" type="range" min={0} max={points.length - 1} step={1} value={i}
        aria-label="Amount per deal" aria-valuetext={`${dollars(p.stake)} per deal`} onChange={e => setI(Number(e.target.value))} />
      <div className="kept__ticks" aria-hidden="true">{points.map(q => <span key={q.stake} className="mono">{dollars(q.stake)}</span>)}</div>
      <p className="kept__fine">{p.count} settled green {p.count === 1 ? "deal" : "deals"}, each counted only up to what could actually be bought at the time, wins and misses. Based on {period}&apos;s real deals. Past results don&apos;t guarantee future ones.</p>
    </div>
  );
}
