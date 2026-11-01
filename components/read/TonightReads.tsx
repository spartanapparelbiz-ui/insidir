/* Under the box on the home page: 3 one-tap Reads for tonight's busiest markets with proven money (lib/read/tonight.ts).
 * Each shows the market, when it starts, and its proven money in dollars and positions. Nothing shows when there are
 * none. Server component; the tap is components/read/ReadPick.tsx. */
import { clockET } from "@/lib/moves/copy";
import { usd } from "@/lib/read/math";
import type { TonightRead } from "@/lib/read/tonight";
import { ReadPick } from "./ReadPick";

export function TonightReads({ rows }: { rows: readonly TonightRead[] }) {
  if (!rows.length) return null;
  return (
    <section className="rtap" aria-labelledby="rtap-h" data-testid="tonight-reads">
      <h2 id="rtap-h" className="rtap__h">Tonight, with proven money</h2>
      <ul className="rtap__list">
        {rows.map(r => (
          <li key={`${r.venue}:${r.id}`}>
            <ReadPick venue={r.venue} id={r.id} className="rtap__b">
              <span className="rtap__t">{r.title}</span>
              <span className="rtap__s">{[r.startAt ? clockET(r.startAt) : null, `${usd(r.provenMoney)} proven in ${r.provenPositions} ${r.provenPositions === 1 ? "position" : "positions"}`].filter(Boolean).join(" · ")}</span>
            </ReadPick>
          </li>
        ))}
      </ul>
    </section>
  );
}
