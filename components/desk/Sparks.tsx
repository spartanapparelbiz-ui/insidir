/* The KPI row: four compact figures, each with an hourly sparkline since midnight ET. A KPI with no data isn't sent. */
import type { Kpi } from "@/lib/desk/data";
import { dollars } from "@/lib/money";

function Spark({ series, id }: { series: number[]; id: string }) {
  if (series.length < 2) return null;
  const W = 96, H = 26, max = Math.max(...series, 1);
  const pts = series.map((v, i) => [(i / (series.length - 1)) * W, H - 2 - (v / max) * (H - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return (
    <svg className="d-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={`sp-${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
      <path d={`${d}L${W},${H}L0,${H}Z`} fill={`url(#sp-${id})`} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  if (!kpis.length) return null;
  return (
    <ul className="d-kpis" data-testid="desk-kpis">
      {kpis.map(k => (
        <li key={k.key} className={`d-kpi d-kpi--${k.key}`} data-kpi={k.key} title={k.detail}>
          <span className="d-kpi__l">{k.label}</span>
          <span className="d-kpi__v d-num">{k.key === "money" || k.key === "biggest" ? dollars(k.value) : k.value.toLocaleString("en-US")}</span>
          {k.detail ? <span className="d-kpi__d">{k.detail}</span> : null}
          <Spark series={k.series} id={k.key} />
        </li>
      ))}
    </ul>
  );
}
