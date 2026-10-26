"use client";
/* The Simple view's "Show me how" sheet on the Terminal. The row comes from the live list, so its prices (and every
 * step's numbers) follow live ticks; when the deal closes the sheet says so and keeps the last prices. */
import { Sheet } from "@/components/app/Sheet";
import { Help } from "@/components/Help";
import type { FeedRow } from "@/lib/feed";
import { simpleDeal } from "@/lib/simple";
import { HowTo } from "./HowTo";

export function HowSheet({ row, closed, unlockHref, onClose }: { row: FeedRow; closed: boolean; unlockHref: string; onClose: () => void }) {
  const d = simpleDeal(row);
  const href = `/deal/${encodeURIComponent(row.id)}`;
  return (
    <Sheet labelledBy="hsheet-h" href={href} onClose={onClose}>
      <div className="dd how-sheet">
        <header className="dd-head">
          <h2 id="hsheet-h" className="dd-h" tabIndex={-1}>{row.title}</h2>
          <p className="dd-play">{d.buy}</p>
          <p className="sd__facts"><span className="sd__fact"><span className={`light light--${row.safety}`}>Same rules? {d.sameRules}.</span><Help k="rules" /></span>
            <a className="sd__fact sd__rules" href={`${href}#rules`}>Read both apps&apos; rules</a></p>
        </header>
        {closed ? <p className="banner banner--warn" role="status">This deal just closed. The steps use its last prices.</p>
          : row.locked ? <p className="banner banner--warn">These prices are from 30 minutes ago. They may have changed.</p>
            : row.stale ? <p className="banner banner--warn">We haven&apos;t checked these prices in the last minute. They may have moved.</p> : null}
        <HowTo row={row} unlockHref={unlockHref} />
      </div>
    </Sheet>
  );
}
