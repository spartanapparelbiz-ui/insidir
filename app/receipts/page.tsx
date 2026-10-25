/* The public receipts log: every lock we found, as it looked when found (ROI and size at detection, safety light)
 * and how it settled (both sides the same way? realized P&L). Unsettled rows say "open". Everyone sees the last
 * 7 days; Pro members see 90. Per week: what following every green deal with $500 would have made. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { Beacons } from "@/components/landing/Beacons";
import { Sticky } from "@/components/landing/Sticky";
import { dayText, FollowLine, ReceiptList, TallyLine } from "@/components/landing/Receipts";
import { byWeek, LANDING_CTA, outsideDelay, RECEIPTS_FULL_DAYS, RECEIPTS_PUBLIC_DAYS, visibleReceipts } from "@/components/landing/model";
import { getViewer } from "@/lib/auth/viewer";
import { entitlements, isPaid } from "@/lib/plans";
import { receiptRows } from "@/lib/queries";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Receipts", description: "Every deal Insidir found, as it looked when found, and how it settled. Wins and misses." };

export default async function ReceiptsPage() {
  const now = Date.now();
  const viewer = await getViewer();
  const ent = entitlements(viewer.plan);
  const windowDays = ent.fullHistory ? RECEIPTS_FULL_DAYS : RECEIPTS_PUBLIC_DAYS;
  const paid = isPaid(viewer.plan);
  const rows = outsideDelay(visibleReceipts(await receiptRows(windowDays), viewer.region), entitlements(paid ? viewer.plan : "free"), now);
  const weeks = byWeek(rows);

  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(viewer.user)} current="/receipts" />
      <main className="wrap lp">
        <section className="sec">
          <h1 className="sec__h">Receipts</h1>
          <p className="sec__p">Every lock we found in the last {windowDays} days, as it looked when found, and how it settled. Wins and misses, nothing removed. &ldquo;Open&rdquo; means the markets haven&apos;t settled yet. Profit is at the full size that was fillable when found, after fees.</p>
          {!ent.fullHistory ? <p className="small muted">Older history is part of <Link href="/pricing">Insidir Pro</Link>.</p> : null}
          {!paid ? <p className="small muted">Sizes of deals that haven&apos;t settled are for members; deals found in the last 30 minutes appear here after the free delay.</p> : null}
        </section>
        {weeks.length ? weeks.map(w => (
          <section key={w.start} className="lp-week" aria-label={`Week of ${dayText(w.start)}`}>
            <h2 className="lp-week__h">Week of {dayText(w.start)}</h2>
            <FollowLine res={w.follow} period="that week" />
            <TallyLine t={w.tally} />
            <ReceiptList rows={w.rows} showSize={paid} />
          </section>
        )) : <p className="muted" style={{ paddingTop: 24 }}>No deals logged in this window yet.</p>}
      </main>
      {!paid ? <Sticky label={LANDING_CTA} href="/terminal" /> : null}
      <Beacons />
    </>
  );
}
