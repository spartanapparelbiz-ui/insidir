/* Log in to Insidir (/login): email and password (components/auth/LoginForm.tsx). Members only; anyone else is
 * offered "Try 7 days for $1". Already logged in: straight on to where they were going. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PENDING_COOKIE, readPending } from "@/lib/billing/pending";
import { Photo } from "@/components/Photo";
import { LoginForm } from "@/components/auth/LoginForm";
import { SiteHeader } from "@/components/SiteHeader";
import { safeNext } from "@/lib/auth/password";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const viewer = await getViewer();
  if (viewer.user && isPaid(viewer.plan)) redirect(next);
  // Made an account on /start but didn't pay: offer to finish, their email filled in.
  const pending = viewer.user ? null : readPending((await cookies()).get(PENDING_COOKIE)?.value);
  return (
    <>
      <SiteHeader signedIn={false} offer={false} />
      <main className="split dark">
        <div className="split__photo">
          <Photo n={BAND.signin} par eager />
          <p className="split__line serif">Follow the big money.</p>
        </div>
        <div className="split__form">
          <div className="split__box">
            {pending ? (
              <div className="finish" data-testid="finish-insidir">
                <p className="finish__h">Finish getting Insidir</p>
                <p className="finish__p">You started with <b>{pending}</b>. Pick up where you left off: one step left.</p>
                <Link className="btn btn--primary btn--block" href="/start">Finish getting Insidir</Link>
              </div>
            ) : null}
            <LoginForm next={next} initialEmail={sp.email ?? viewer.user?.email ?? pending ?? ""} />
          </div>
        </div>
      </main>
    </>
  );
}
