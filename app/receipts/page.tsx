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
export const metadata: Metadata = { title: "Past deals", description: "Every deal Insidir found, and how it ended. Wins and misses." };

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
          <h1 className="sec__h">Past deals</h1>
          <p className="sec__p">Every deal we found in the last {windowDays} days, and how it ended. Wins and misses, nothing removed.</p>
          <p className="small muted">&ldquo;Not over&rdquo; means the game hasn&apos;t ended yet. Dollar results are for the most you could buy, after fees.</p>
          {!ent.fullHistory ? <p className="small muted">Older deals come with <Link href="/pricing">Insidir Pro</Link>.</p> : null}
          {!paid ? <p className="small muted">Deals from the last 30 minutes show up here a bit later.</p> : null}
        </section>
        {weeks.length ? weeks.map(w => (
          <section key={w.start} className="lp-week" aria-label={`Week of ${dayText(w.start)}`}>
            <h2 className="lp-week__h">Week of {dayText(w.start)}</h2>
            <FollowLine res={w.follow} period="that week" />
            <TallyLine t={w.tally} />
            <ReceiptList rows={w.rows} />
          </section>
        )) : <p className="muted" style={{ paddingTop: 24 }}>No deals here yet.</p>}
      </main>
      {!paid ? <Sticky label={LANDING_CTA} href="/terminal" /> : null}
      <Beacons />
    </>
  );
}
