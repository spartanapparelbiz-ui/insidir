/* The money skyline without WebGL (no WebGL, prefers-reduced-motion, or before the 3D scene loads): the same bars in the
 * same layout (lib/sky/sky-pure.ts), drawn as isometric glass prisms in SVG, back to front, the 8 biggest marked with a
 * ring of ice. Static; safe on the server and the client. */
import { barHeight, skyLayout, type SkyBet } from "@/lib/sky/sky-pure";

export function SkylineSvg({ bets, height = 560 }: { bets: readonly SkyBet[]; height?: number }) {
  if (!bets.length) return null;
  const W = 800, H = height, cx = W / 2, cy = H * 0.72, k = 26;
  const pos = skyLayout(bets.length);
  const min = Math.min(...bets.map(b => b.amount)), max = Math.max(...bets.map(b => b.amount));
  const iso = (x: number, z: number) => ({ x: cx + (x - z) * 0.866 * k, y: cy + (x + z) * 0.5 * k });
  const bars = bets.map((b, i) => ({ b, i, p: pos[i]!, h: barHeight(b.amount, min, max, 0.9, 8.5) * k * 0.82 })).sort((a, z) => (a.p.x + a.p.z) - (z.p.x + z.p.z));
  return (
    <svg className="sk-svgsky" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`The ${bets.length} biggest bets of the last 24 hours as bars; the tallest is $${Math.round(max).toLocaleString("en-US")}`}>
      <defs>
        <linearGradient id="skL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8FB8FF" stopOpacity=".55" /><stop offset="1" stopColor="#8FB8FF" stopOpacity=".12" /></linearGradient>
        <linearGradient id="skR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8FB8FF" stopOpacity=".32" /><stop offset="1" stopColor="#8FB8FF" stopOpacity=".06" /></linearGradient>
      </defs>
      <g stroke="rgba(148,163,184,.14)" strokeWidth="1">
        {Array.from({ length: 13 }, (_, i) => i - 6).map(i => {
          const a = iso(i * 2, -12), b = iso(i * 2, 12), c = iso(-12, i * 2), d = iso(12, i * 2);
          return <g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} /><line x1={c.x} y1={c.y} x2={d.x} y2={d.y} /></g>;
        })}
      </g>
      {bars.map(({ b, i, p, h }) => {
        const s = i < 3 ? 0.55 : 0.42;
        const f = iso(p.x + s, p.z + s), l = iso(p.x - s, p.z + s), r = iso(p.x + s, p.z - s), t = iso(p.x - s, p.z - s);
        return (
          <g key={b.id}>
            <polygon points={`${l.x},${l.y} ${f.x},${f.y} ${f.x},${f.y - h} ${l.x},${l.y - h}`} fill="url(#skL)" stroke="rgba(143,184,255,.35)" strokeWidth=".6" />
            <polygon points={`${f.x},${f.y} ${r.x},${r.y} ${r.x},${r.y - h} ${f.x},${f.y - h}`} fill="url(#skR)" stroke="rgba(143,184,255,.25)" strokeWidth=".6" />
            <polygon points={`${l.x},${l.y - h} ${f.x},${f.y - h} ${r.x},${r.y - h} ${t.x},${t.y - h}`} fill="#8FB8FF" fillOpacity={i < 8 ? 0.95 : 0.6} />
          </g>
        );
      })}
    </svg>
  );
}
