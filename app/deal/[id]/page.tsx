/* One deal: the play, both legs with deep links, the numbers, the calculator (paid) and both markets' rule texts side
 * by side. What the viewer may see comes from lib/deal-view.ts, the same function behind the Terminal's detail sheet
 * (GET /api/deal/[id]): free viewers get the delayed, redacted deal, or "This deal is still live" when it's too new. */
import type { Metadata } from "next";
import Link from "next/link";
import { Beacons } from "@/components/app/Beacons";
import { DealDetail } from "@/components/app/DealDetail";
import { unlockHref } from "@/components/app/links";
import { SiteHeader } from "@/components/SiteHeader";
import { getView, getViewer } from "@/lib/auth/viewer";
import { SimpleDetail } from "@/components/simple/SimpleDetail";
import { dealView } from "@/lib/deal-view";
import "../../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Deal", robots: { index: false } };

const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const id = safeDecode((await params).id);
  const now = Date.now();
  const viewer = await getViewer();
  const view = await dealView(id, viewer, now);
  const unlock = unlockHref("insidir", `/deal/${encodeURIComponent(id)}`);
  const mode = await getView(viewer);
  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(viewer.user)} current="/deal" view={{ mode, next: `/deal/${encodeURIComponent(id)}` }} />
      <main className="wrap app deal-page">
        <Beacons where="deal" />
        <p className="small"><Link href="/terminal" className="muted">Back to all deals</Link></p>
        {view.state === "ok" ? (mode === "pro" ? <DealDetail view={view} now={now} unlockHref={unlock} /> : <SimpleDetail view={view} now={now} unlockHref={unlock} />) : (
          <section className="empty">
            <h1 className="empty__h">{view.state === "too_new" ? "This deal is still live" : "Deal not found"}</h1>
            <p className="muted small">{view.state === "too_new"
              ? "Free deals show up 30 minutes after we find them. Members see them right away."
              : "It may be over, or it isn't open where you live. See today's deals instead."}</p>
            <div className="row-gap">
              {view.state === "too_new" ? <a className="btn btn--primary" href={unlock} data-unlock="deal-live">Unlock live deals</a> : null}
              <Link className="btn btn--secondary" href="/terminal">See today&apos;s deals</Link>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
