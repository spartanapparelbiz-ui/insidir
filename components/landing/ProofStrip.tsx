/* 2. Live proof: today's counts from the receipts log. Hidden when nothing was found. */
import type { ProofStats } from "@/lib/queries";
import { pct } from "@/lib/format";

export function ProofStrip({ stats }: { stats: ProofStats | null }) {
  if (!stats) return null;
  return (
    <section className="lp-proof" data-section="proof" aria-label="Found today">
      <p><span className="dim">Found today:</span> <b>{stats.found}</b></p>
      <p><span className="dim">Biggest:</span> <b className="profit">{pct(stats.biggestRoi)}</b></p>
      <p><span className="dim">Median:</span> <b>{pct(stats.medianRoi)}</b></p>
    </section>
  );
}
