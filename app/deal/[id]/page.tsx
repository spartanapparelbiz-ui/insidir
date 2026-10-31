/* One deal: the play, both legs with deep links, the numbers, the calculator (paid) and both markets' rule texts side
 * by side. What the viewer may see comes from lib/deal-view.ts, the same function behind the Terminal's detail sheet
 * (GET /api/deal/[id]): free viewers get the delayed, redacted deal, or "This deal is still live" when it's too new. */
import { ComingSoonPage } from "@/components/v2/ComingSoonPage";
import { isReady } from "@/lib/features";
import type { Metadata } from "next";
import Link from "next/link";
import { Photo } from "@/components/Photo";
import { SPOT } from "@/lib/photos";
import { DealDetail } from "@/components/app/DealDetail";
import { unlockHref } from "@/components/app/links";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";
import { OPEN_TERMINAL, UNLOCK } from "@/lib/copy";
import { dealView } from "@/lib/deal-view";
import "../../app.css";
import "../../pages.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Deal", robots: { index: false } };

const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const id = safeDecode((await params).id);
  const now = Date.now();
  const viewer = await getViewer();
  if (!isReady("price_gaps")) {
    return <ComingSoonPage feature="price_gaps" title="Price gaps" signedIn={Boolean(viewer.user)} plan={viewer.plan} text="Sometimes Kalshi and Polymarket price the same event differently. Price gaps will show those, with the math, for Pro members." />;
  }
  const view = await dealView(id, viewer, now);
  const unlock = unlockHref();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} current="/terminal" />
      <main className="wrap app deal-page">
        <Link href="/terminal" className="backlink">Back to the Terminal</Link>
        {view.state === "ok" ? <DealDetail view={view} now={now} unlockHref={unlock} /> : (
          <section className="empty">
            <Photo n={SPOT.pageEmpty} className="empty__photo" wideOnly />
            <h1 className="empty__h">{view.state === "too_new" ? "This deal is still live" : "Deal not found"}</h1>
            <p className="muted small">{view.state === "too_new"
              ? "Deals reach the free feed 30 minutes after they're found. Members see them as they happen."
              : "It may have closed, or it isn't available where you are. The Terminal has today's deals."}</p>
            <div className="row-gap">
              {view.state === "too_new" ? <a className="btn btn--primary" href={unlock} data-unlock="deal-live">{UNLOCK}</a> : null}
              <Link className={`btn ${view.state === "too_new" ? "btn--secondary" : "btn--primary"}`} href="/terminal">{OPEN_TERMINAL}</Link>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
