/* 4. Terminal preview: the real free feed (30 min delayed, never called live), up to 3 rows, paid fields blurred
 * (never sent). Hidden when empty. */
import Link from "next/link";
import { DealRow } from "@/components/DealRow";
import type { FeedRow } from "@/lib/feed";

export function TerminalPreview({ rows, now, unlockHref, cta }: { rows: readonly FeedRow[]; now: number; unlockHref: string; cta: string }) {
  if (!rows.length) return null;
  return (
    <section className="sec" data-section="preview" aria-labelledby="preview-h">
      <h2 id="preview-h" className="sec__h">What the free feed shows</h2>
      <p className="sec__p">The top {rows.length === 1 ? "deal" : `${rows.length} deals`} as they were 30 minutes ago. Members see every deal as it happens, with how much you can buy and the profit in dollars.</p>
      <div className="deals">{rows.map(r => <DealRow key={r.id} row={r} now={now} unlockHref={unlockHref} />)}</div>
      <Link className="btn btn--primary lp-cta" href="/terminal">{cta}</Link>
    </section>
  );
}
