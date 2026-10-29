/* /check/<id>: a checked bet, shareable by its link. Shows each leg's verdict and numbers; the stake and book only
 * to the person who checked it. A 1080×1920 card to share (./card). Public, not indexed. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { CheckView } from "@/components/check/CheckResult";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { getCheck } from "@/lib/check/run";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checked bet", robots: { index: false } };

export default async function CheckedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9]{8,20}$/.test(id) || !hasDatabase()) notFound();
  const [viewer, c] = await Promise.all([getViewer(), getCheck(getDb(), id)]);
  if (!c) notFound();
  const mine = Boolean(viewer.user && c.userId === viewer.user.id);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/check" trialHref={unlockHref()} />
      <main className="wrap app2 checkp">
        <CheckView c={c} mine={mine} />
        <div className="cres__act">
          <a className="btn btn--primary" href={`/check/${c.id}/card`} download={`insidir-check-${c.id}.png`}>Save the card</a>
          <Link className="btn btn--secondary" href="/check">Check another bet</Link>
          {mine ? <Link className="btn btn--secondary" href="/check/history">Your checked bets</Link> : null}
        </div>
      </main>
    </>
  );
}
