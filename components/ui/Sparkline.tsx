/* A tiny line of real points (the gap over the last 30 minutes). One Paper stroke, no fill, no axes; the last point
 * is a dot. Server-safe. Fewer than 2 points draws nothing. */
export function Sparkline({ points, w = 56, h = 16, label }: { points: ReadonlyArray<{ at: number; v: number }>; w?: number; h?: number; label: string }) {
  if (points.length < 2) return null;
  const xs = points.map(p => p.at), ys = points.map(p => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const x = (t: number) => (x1 === x0 ? w : 1 + ((t - x0) / (x1 - x0)) * (w - 3));
  const y = (v: number) => (y1 === y0 ? h / 2 : h - 2 - ((v - y0) / (y1 - y0)) * (h - 4));
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1]!;
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.at)} cy={y(last.v)} r="1.75" fill="currentColor" />
    </svg>
  );
}
