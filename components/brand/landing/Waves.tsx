/* The landing's hero art, after the brand board's covers: concentric arcs of light rising from the bottom, a volumetric
 * Azure glow with the slightest Yellow at its core, and flowing waves of light drifting across. Pure SVG, drawn on the
 * server; the motion is CSS (app/landing-clean.css) and stops under reduced motion. Decorative only. */

const W = 1440, H = 820;

/** A smooth wave across two widths (so it can drift by one width and loop): y = mid + amp·sin(…). Pure. */
export function wavePath(mid: number, amp: number, period: number, phase: number, width = W * 2, step = 24): string {
  const pts: string[] = [];
  for (let x = 0; x <= width; x += step) {
    const y = mid + amp * Math.sin((x / period) * Math.PI * 2 + phase) + amp * 0.35 * Math.sin((x / (period * 0.47)) * Math.PI * 2 + phase * 1.7);
    pts.push(`${x === 0 ? "M" : "L"}${x},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

const WAVES = [
  { mid: 560, amp: 46, period: 720, phase: 0.2, o: 0.55, d: 38 },
  { mid: 590, amp: 58, period: 900, phase: 1.4, o: 0.4, d: 52 },
  { mid: 620, amp: 40, period: 640, phase: 2.6, o: 0.32, d: 44 },
  { mid: 650, amp: 64, period: 1080, phase: 3.3, o: 0.24, d: 64 },
  { mid: 690, amp: 36, period: 560, phase: 4.1, o: 0.18, d: 34 },
];
const RINGS = [260, 400, 560, 740, 940, 1160];

export function Waves() {
  return (
    <svg className="c-waves" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="cw-core" cx="50%" cy="100%" r="62%">
          <stop offset="0%" style={{ stopColor: "var(--t-cta)", stopOpacity: 0.55 }} />
          <stop offset="14%" style={{ stopColor: "var(--t-blue)", stopOpacity: 0.7 }} />
          <stop offset="46%" style={{ stopColor: "var(--t-blue)", stopOpacity: 0.22 }} />
          <stop offset="100%" style={{ stopColor: "var(--t-page)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id="cw-line" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" style={{ stopColor: "var(--t-blue)", stopOpacity: 0 }} />
          <stop offset="30%" style={{ stopColor: "var(--t-blue)", stopOpacity: 0.9 }} />
          <stop offset="50%" style={{ stopColor: "var(--t-text)", stopOpacity: 1 }} />
          <stop offset="70%" style={{ stopColor: "var(--t-blue)", stopOpacity: 0.9 }} />
          <stop offset="100%" style={{ stopColor: "var(--t-blue)", stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id="cw-ring" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--t-text)", stopOpacity: 0.05 }} />
          <stop offset="100%" style={{ stopColor: "var(--t-blue)", stopOpacity: 0.55 }} />
        </linearGradient>
        <filter id="cw-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="28" /></filter>
        <filter id="cw-soft"><feGaussianBlur stdDeviation="1.2" /></filter>
      </defs>
      {/* The glow, then the arcs, then the waves of light. */}
      <ellipse className="c-waves__core" cx={W / 2} cy={H + 40} rx={760} ry={520} fill="url(#cw-core)" filter="url(#cw-blur)" />
      <g className="c-waves__rings">
        {RINGS.map((r, i) => <ellipse key={r} className="c-waves__ring" style={{ animationDelay: `${-i * 1.4}s` }} cx={W / 2} cy={H + 60} rx={r} ry={r * 0.78} fill="none" stroke="url(#cw-ring)" strokeWidth={i < 2 ? 1.4 : 1} />)}
      </g>
      <g className="c-waves__lines" stroke="url(#cw-line)" fill="none">
        {WAVES.map((w, i) => (
          <g key={i} className="c-waves__flow" style={{ animationDuration: `${w.d}s`, animationDelay: `${-i * 5}s` }}>
            <path d={wavePath(w.mid, w.amp, w.period, w.phase)} strokeWidth={1.4} opacity={w.o} filter="url(#cw-soft)" />
          </g>
        ))}
      </g>
    </svg>
  );
}
