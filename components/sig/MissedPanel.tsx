/* The missed-deals panel for free viewers (docs/BRIEF.md §4.10): "{n} deals closed before you could see them this
 * week. At $500 each, that was $X after fees." Real counts from the receipts; hidden at zero. */
import type { ReactNode } from "react";
import { money2 } from "@/lib/format";

export function MissedPanel({ n, kept, period = "this week", action }: { n: number; kept: number | null; period?: string; action?: ReactNode }) {
  if (!(n > 0)) return null;
  return (
    <aside className="missed" aria-label="Deals you missed">
      <p className="missed__line">
        <span className="mono missed__n">{n}</span> {n === 1 ? "deal" : "deals"} closed before you could see {n === 1 ? "it" : "them"} {period}.
        {kept !== null && kept > 0 ? <> At $500 each, that was <span className="profit">{money2(kept)}</span> after fees.</> : null}
      </p>
      {action}
    </aside>
  );
}
