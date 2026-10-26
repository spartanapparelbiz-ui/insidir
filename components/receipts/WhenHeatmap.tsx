/* "When deals show up": deals found per hour (UTC) × day of week, Steel → Paper by count. Tells you when to have
 * alerts on. Inline SVG; a text summary names the busiest hours for screen readers. Server-safe. */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WhenHeatmap({ grid, max, n }: { grid: number[][]; max: number; n: number }) {
  const C = 24, CW = 26, RH = 22, LX = 40;
  const top = grid.flatMap((row, d) => row.map((v, h) => ({ d, h, v }))).filter(c => c.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
  const summary = `When deals show up, ${n} deals by UTC hour and day. Busiest: ${top.map(c => `${DAYS[c.d]} ${String(c.h).padStart(2, "0")}:00 (${c.v})`).join(", ") || "none yet"}.`;
  const shade = (v: number) => (v === 0 ? "var(--surface)" : `color-mix(in srgb, var(--paper) ${Math.round(25 + 75 * (v / Math.max(1, max)))}%, var(--steel))`);
  return (
    <figure className="rx-viz">
      <figcaption className="rx-viz__cap"><span className="rx-viz__h">When deals show up</span><span className="rx-viz__note">Hours in UTC. Brighter means more deals: a good time to have alerts on.</span></figcaption>
      <div className="rx-viz__scroll">
        <svg viewBox={`0 0 ${LX + C * CW} ${7 * RH + 24}`} className="rx-viz__svg rx-viz__svg--heat" role="img" aria-label={summary}>
          {grid.map((row, d) => (
            <g key={d}>
              <text x={LX - 8} y={d * RH + RH / 2 + 4} className="rx-t" textAnchor="end">{DAYS[d]}</text>
              {row.map((v, h) => <rect key={h} x={LX + h * CW + 1} y={d * RH + 1} width={CW - 2} height={RH - 2} rx="2" style={{ fill: shade(v) }}><title>{`${DAYS[d]} ${String(h).padStart(2, "0")}:00 UTC: ${v} ${v === 1 ? "deal" : "deals"}`}</title></rect>)}
            </g>
          ))}
          {[0, 6, 12, 18, 23].map(h => <text key={h} x={LX + h * CW + CW / 2} y={7 * RH + 16} className="rx-t" textAnchor="middle">{String(h).padStart(2, "0")}</text>)}
        </svg>
      </div>
    </figure>
  );
}
