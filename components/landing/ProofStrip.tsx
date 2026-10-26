/* 2. Live proof: today's counts from the receipts log, and what the green deals were worth at their full size.
 * Each part hides when its number isn't there. */
import { pct, usd } from "@/lib/format";
import type { ProofStats } from "@/lib/queries";

export function ProofStrip({ stats, left }: { stats: ProofStats | null; left: { total: number; deals: number } | null }) {
  if (!stats && !left) return null;
  return (
    <section className="lp-proof" data-section="proof" aria-label="Found today">
      {stats ? (
        <div className="lp-proof__row">
          <p><span className="dim">Found today:</span> <b>{stats.found}</b></p>
          <p><span className="dim">Biggest:</span> <b className="profit">{pct(stats.biggestRoi)}</b></p>
          <p><span className="dim">Median:</span> <b>{pct(stats.medianRoi)}</b></p>
        </div>
      ) : null}
      {left ? <p className="lp-proof__left">Left on the table today: <b className="profit">{usd(left.total)}</b> across {left.deals} green {left.deals === 1 ? "deal" : "deals"}</p> : null}
    </section>
  );
}
