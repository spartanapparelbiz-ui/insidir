/* 4. Terminal preview: the real free feed, up to 3 rows, paid fields blurred (never sent). Hidden when empty. */
import Link from "next/link";
import { DealRow } from "@/components/DealRow";
import type { FeedRow } from "@/lib/feed";

export function TerminalPreview({ rows, now, unlockHref }: { rows: readonly FeedRow[]; now: number; unlockHref: string }) {
  if (!rows.length) return null;
  return (
    <section className="sec" data-section="preview" aria-labelledby="preview-h">
      <h2 id="preview-h" className="sec__h">The Terminal, right now</h2>
      <p className="sec__p">The free feed: the top {rows.length === 1 ? "deal" : `${rows.length} deals`} from 30 minutes ago. Members see every deal live, with sizes and dollar profit.</p>
      <div className="deals">{rows.map(r => <DealRow key={r.id} row={r} now={now} unlockHref={unlockHref} />)}</div>
      <Link className="btn btn--secondary" href="/terminal">Open the Terminal</Link>
    </section>
  );
}
