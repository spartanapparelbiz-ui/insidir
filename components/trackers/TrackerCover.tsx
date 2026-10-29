/* A tracker's cover: deep colour (one family per group: stocks navy, markets indigo, styles plum, sports ocean), a
 * thin white curve of what its settled bets have made over 26 weeks (filings: the money its moves put in), and the
 * return in white. Every point is from TrackerStats (lib/trackers-store.ts); a tracker without a record says "New" and
 * draws no curve. 4:3 on cards; the small square version (thumbs) is the colour and the curve only. */
import type { ReactNode } from "react";
import { dollars } from "@/lib/moves/copy";
import { returnPct, type Tracker, type TrackerRecord } from "@/lib/trackers";
import type { TrackerStats } from "@/lib/trackers-store";

/** Three shades per group, defined in app/tokens.css (--cover-<group>-<n>). */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const coverTone = (t: Pick<Tracker, "slug" | "group">) => `var(--cover-${t.group.toLowerCase()}-${hash(t.slug) % 3})`;

/** The curve as an SVG path in a 400 × 300 box, the line in its lower two-thirds; null under two points. */
export function curvePath(curve: readonly number[], w = 400, h = 300, top = 0.38, bottom = 0.86): string | null {
  if (curve.length < 2) return null;
  const lo = Math.min(...curve), hi = Math.max(...curve), span = hi - lo || 1;
  const y = (v: number) => h * bottom - ((v - lo) / span) * h * (bottom - top);
  return curve.map((v, i) => `${i ? "L" : "M"}${((i / (curve.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
}

export interface CoverStats { record: TrackerRecord | null; curve: readonly number[]; tracked30d: number }

/** What a cover needs from a tracker's stats (its all-time record). */
export const coverStats = (s: TrackerStats | null | undefined): CoverStats | null => (s ? { record: s.records.all, curve: s.curve, tracked30d: s.tracked30d } : null);

/** The figure on the cover and its label: the return, money tracked for filings, or "New". */
export function coverFigure(t: Pick<Tracker, "kind">, s: CoverStats | null | undefined): { figure: string; label: string | null } {
  if (t.kind === "filings") return s && s.tracked30d > 0 ? { figure: dollars(s.tracked30d), label: "bought in 30 days" } : { figure: "New", label: null };
  const r = returnPct(s?.record);
  return r ? { figure: r, label: "return, all settled bets" } : { figure: "New", label: null };
}

export function TrackerCover({ t, s, small = false, className, children }: { t: Tracker; s?: CoverStats | null; small?: boolean; className?: string; children?: ReactNode }) {
  const d = curvePath(s?.curve ?? [], 400, small ? 400 : 300, small ? 0.3 : 0.38, small ? 0.75 : 0.86);
  const f = small ? null : coverFigure(t, s);
  return (
    <span className={`tcover${small ? " tcover--sm" : ""}${className ? ` ${className}` : ""}`} style={{ ["--tc" as string]: coverTone(t) }} aria-hidden={small || undefined}>
      {d ? <svg className="tcover__curve" viewBox={`0 0 400 ${small ? 400 : 300}`} preserveAspectRatio="none" aria-hidden="true"><path d={d} /></svg> : null}
      {f ? <span className="tcover__fig"><span className="tcover__n">{f.figure}</span>{f.label ? <span className="tcover__l">{f.label}</span> : null}</span> : null}
      {children}
    </span>
  );
}
