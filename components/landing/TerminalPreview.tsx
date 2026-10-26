/* 3. The Terminal, as the real component: up to 5 rows. First the free feed's rows (30 minutes late, sizes and dollar
 * profit never sent), then the live deals a free visitor can't see yet, which are counted and timed but show nothing
 * else. Every row has one Unlock. Hidden when there's nothing real to show. */
import Link from "next/link";
import { DealRow } from "@/components/DealRow";
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
      <h2 id="preview-h" className="sec__h">The Terminal</h2>
      <p className="sec__p">Real rows from the free feed, shown 30 minutes late. Members see every deal the moment it&apos;s found, with sizes and profit in dollars.</p>
      <div className="deals lp-preview">
        {shown.map(r => <DealRow key={r.id} row={r} now={now} unlockHref={unlockHref} />)}
        {extra.map((h, i) => (
          <Link key={`live-${h.foundAt}-${i}`} className="deal deal--hidden" href={unlockHref} data-unlock="preview-live">
            <span className="deal__title">A live deal members can see now</span>
            <span className="deal__play">Found <Ago at={h.foundAt} now={now} />. You&apos;d see it 30 minutes after that.</span>
            <span className="deal__unlock">Unlock</span>
          </Link>
        ))}
      </div>
      <Link className="btn btn--primary btn--big" href="/terminal">{cta}</Link>
    </section>
  );
}
