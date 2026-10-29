/* /check: Check your bet. Upload a slip screenshot (any book), or paste a Polymarket / Kalshi link or a ticker, and see
 * where the big money and proven traders are on each leg. Free viewers get one check; members every check, with
 * their history. Data, not a recommendation. Public. */
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { CheckForm } from "@/components/check/CheckForm";
import { getViewer } from "@/lib/auth/viewer";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getDb, hasDatabase } from "@/lib/db";
import { isPaid } from "@/lib/plans";
import { checksUsed, FREE_CHECKS } from "@/lib/check/run";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Position check", description: "Upload a slip to see where large positions and proven traders sit on every leg. Data, not a recommendation." };

export default async function CheckPage() {
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value ?? null;
  const used = !paid && hasDatabase() ? await checksUsed(getDb(), { userId: viewer.user?.id ?? null, visitorId }).catch(() => 0) : 0;
  const left = paid ? Infinity : Math.max(0, FREE_CHECKS - used);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/check" trialHref={unlockHref()} />
      <main className="wrap app2 checkp">
        <header className="phead">
          <h1 className="phead__h">Position check</h1>
          <p className="phead__sub">Upload a slip. Each leg is matched on Polymarket and Kalshi against large positions and proven traders.</p>
        </header>
        {left > 0 ? <CheckForm free={!paid} left={left === Infinity ? 99 : left} /> : (
          <div className="tempty">
            <p className="tempty__h">You&apos;ve used your free check</p>
            <p>Members check every position, every leg, with a history of how each one settled.</p>
            <p className="row-gap"><a className="btn btn--primary" href={unlockHref()} data-unlock="check">Get Insidir</a></p>
          </div>
        )}
        {paid ? <p className="tsec__note"><Link href="/check/history">Your checked positions</Link></p> : null}
      </main>
    </>
  );
}
