/* Today's deals, as the real Simple-view cards: up to 5. First the free feed's deals (30 minutes late, sizes never
 * sent), then the live deals a free visitor can't see yet, which are counted and timed but show nothing else.
 * Hidden when there's nothing real to show. */
import Link from "next/link";
import { DealCard } from "@/components/simple/DealCard";
import { Ago } from "./Ago";
import type { FeedRow } from "@/lib/feed";

export const PREVIEW_MAX = 5;

export function TerminalPreview({ rows, hidden, now, unlockHref, cta }: {
  rows: readonly FeedRow[]; hidden: ReadonlyArray<{ foundAt: number }>; now: number; unlockHref: string; cta: string;
}) {
  const shown = rows.slice(0, PREVIEW_MAX);
  const extra = hidden.slice(0, Math.max(0, PREVIEW_MAX - shown.length));
  if (!shown.length && !extra.length) return null;
  return (
    <section className="sec" data-section="preview" aria-labelledby="preview-h">
      <h2 id="preview-h" className="sec__h">Today&apos;s deals</h2>
      <p className="sec__p">Real deals, shown 30 minutes late. Members see every deal the moment we find it.</p>
      <div className="sd-list lp-preview">
        {shown.map(r => <DealCard key={r.id} row={r} now={now} unlockHref={unlockHref} />)}
        {extra.map((h, i) => (
          <Link key={`live-${h.foundAt}-${i}`} className="deal deal--hidden" href={unlockHref} data-unlock="preview-live">
            <span className="deal__title">A live deal members can see now</span>
            <span className="deal__play">Found <Ago at={h.foundAt} now={now} />. You&apos;d see it 30 minutes later.</span>
            <span className="deal__unlock">Unlock</span>
          </Link>
        ))}
      </div>
      <Link className="btn btn--primary btn--big" href="/terminal">{cta}</Link>
    </section>
  );
}
