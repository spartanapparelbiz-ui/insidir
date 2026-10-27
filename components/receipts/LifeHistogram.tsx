/* "How long deals last": real deal lifetimes in buckets, Paper bars on Ink, the median marked. Inline SVG; a text
 * summary for screen readers. Server-safe. */
import { LIFE_BUCKETS } from "@/lib/ledger";

export function LifeHistogram({ counts, medianMin, n }: { counts: number[]; medianMin: number | null; n: number }) {
  const max = Math.max(1, ...counts);
  const W = 640, H = 160, B = W / counts.length;
  const medIdx = medianMin === null ? -1 : LIFE_BUCKETS.findIndex(b => medianMin >= b.lo && (b.hi === null || medianMin < b.hi));
  const med = medianMin === null ? null : Math.max(1, Math.round(medianMin));
  const summary = `How long deals last, ${n} closed deals: ${LIFE_BUCKETS.map((b, i) => `${b.label} ${counts[i]}`).join(", ")}.${med ? ` Most close within ${med} minutes (the median).` : ""}`;
  return (
    <figure className="rx-viz">
      <figcaption className="rx-viz__cap"><span className="rx-viz__h">How long deals last</span>{med ? <span className="rx-viz__note">Most close within <b className="mono">{med} min</b></span> : null}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 40}`} className="rx-viz__svg" role="img" aria-label={summary}>
        <line x1="0" x2={W} y1={H} y2={H} className="rx-axis" />
        {counts.map((c, i) => {
          const h = (c / max) * (H - 16);
          return (
            <g key={i}>
              <rect x={i * B + 6} y={H - h} width={B - 12} height={Math.max(c ? 2 : 0, h)} className={i === medIdx ? "rx-bar rx-bar--med" : "rx-bar"} />
              {c ? <text x={i * B + B / 2} y={H - h - 4} className="rx-t rx-t--n" textAnchor="middle">{c}</text> : null}
              <text x={i * B + B / 2} y={H + 18} className="rx-t" textAnchor="middle">{LIFE_BUCKETS[i]!.label}</text>
            </g>
          );
        })}
        {medIdx >= 0 ? <text x={medIdx * B + B / 2} y={H + 34} className="rx-t rx-t--med" textAnchor="middle">median</text> : null}
      </svg>
      <p className="rx-viz__axis">Minutes open, from first found to last confirmed. Bars: number of deals.</p>
    </figure>
  );
}
