/* "Money by category": the last 24 hours of millionaire money as a stream chart, one band per category (the top 5),
 * hour by hour, in white at stepped opacities (no colour of its own: colour is for price changes). Labels at the right
 * legend carries each band's total. Bands grow from the baseline as their stage enters. */
import { category as categoryInfo, type CategorySlug } from "@/lib/brand/categories";
import { dollars } from "@/lib/money";

export interface StreamData { hours: number; bands: Array<{ category: CategorySlug; total: number; series: number[] }> }

export function Stream({ data }: { data: StreamData }) {
  const { hours, bands } = data;
  if (!bands.length || hours < 2) return null;
  const totals = Array.from({ length: hours }, (_, h) => bands.reduce((s, b) => s + (b.series[h] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const x = (h: number) => (h / (hours - 1)) * 100;
  const y = (v: number) => 100 - (v / max) * 100;
  // Stack from the bottom: each band's lower edge is the sum of the bands below it.
  const below = Array.from({ length: hours }, () => 0);
  const paths = bands.map(b => {
    const lo = [...below], hi = lo.map((v, h) => v + (b.series[h] ?? 0));
    for (let h = 0; h < hours; h++) below[h] = hi[h]!;
    const top = hi.map((v, h) => `${h ? "L" : "M"}${x(h).toFixed(2)},${y(v).toFixed(2)}`).join("");
    const bottom = lo.map((v, h) => `L${x(hours - 1 - h).toFixed(2)},${y(lo[hours - 1 - h]!).toFixed(2)}`).join("");
    return { b, d: `${top}${bottom}Z`, mid: y((lo[hours - 1]! + hi[hours - 1]!) / 2) };
  });
  return (
    <figure className="s-stream" data-testid="money-stream" role="img" aria-label={`Millionaire money by category, last 24 hours: ${bands.map(b => `${categoryInfo(b.category).name} ${dollars(b.total)}`).join(", ")}`}>
      <div className="s-stream__plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {paths.map((p, i) => <path key={p.b.category} d={p.d} className={`s-stream__band s-stream__band--${i + 1} s-grow-y`} />)}
        </svg>
      </div>
      <figcaption className="b-small s-chart__axis"><span>24 hours ago</span><span>now</span></figcaption>
      <ul className="s-stream__legend b-small">{bands.map((b, i) => <li key={b.category}><i className={`s-stream__key s-stream__band--${i + 1}`} />{categoryInfo(b.category).name} <b className="b-num">{dollars(b.total)}</b></li>)}</ul>
    </figure>
  );
}
