/* Log in to Insidir (/login): "Continue with Google" (our own Google sign-in, app/login/google), then email and
 * password under it (components/auth/LoginForm.tsx). Members and free-access emails come in; a Google account
 * without Insidir sees "No Insidir membership for <email>" with "Try 7 days for $1". Already logged in: straight on
 * to where they were going. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PENDING_COOKIE, readPending } from "@/lib/billing/pending";
import { Photo } from "@/components/Photo";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { LoginForm } from "@/components/auth/LoginForm";
import { SiteHeader } from "@/components/SiteHeader";
import { safeNext } from "@/lib/auth/next";
import { NO_PLAN_COOKIE } from "@/lib/auth/google";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  expired: "That sign-in took too long. Try again.",
  failed: "Google sign-in didn't go through. Try again, or use your email and password.",
  rate_limited: "Too many tries. Wait 15 minutes and try again.",
  unavailable: "Log-in is unavailable right now. Try again in a few minutes.",
  google_unavailable: "Google sign-in isn't available right now. Use your email and password.",
  unverified: "That Google account's email isn't verified. Use another account, or your email and password.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const viewer = await getViewer();
  if (viewer.user && isPaid(viewer.plan)) redirect(next);
  const jar = await cookies();
  // Made an account on /start but didn't pay: offer to finish, their email filled in.
  const pending = viewer.user ? null : readPending(jar.get(PENDING_COOKIE)?.value);
  const noPlan = sp.error === "no_membership";
  const noPlanEmail = noPlan ? readPending(jar.get(NO_PLAN_COOKIE)?.value) : null;
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
            {noPlan ? (
              <div className="finish" data-testid="no-membership">
                <p className="finish__h">No Insidir membership{noPlanEmail ? <> for <b>{noPlanEmail}</b></> : null}</p>
                <p className="finish__p">Start your trial with that account: your Google email goes straight to checkout.</p>
                <Link className="btn btn--primary btn--block" href="/start">Try 7 days for $1</Link>
              </div>
            ) : pending ? (
              <div className="finish" data-testid="finish-insidir">
                <p className="finish__h">Finish getting Insidir</p>
                <p className="finish__p">You started with <b>{pending}</b>. Pick up where you left off: one step left.</p>
                <Link className="btn btn--primary btn--block" href="/start">Finish getting Insidir</Link>
              </div>
            ) : null}
            <div className="login">
              <h1 className="login__h">Log in to Insidir</h1>
              {sp.error && ERRORS[sp.error] ? <p className="login__err" role="alert">{ERRORS[sp.error]}</p> : null}
              <GoogleButton next={next} />
              <p className="login__or"><span>or</span></p>
              <LoginForm next={next} initialEmail={sp.email ?? viewer.user?.email ?? (noPlan ? null : pending) ?? ""} />
              <p className="login__fine">New here? <Link href="/start">Try 7 days for $1</Link>, then $39/mo. By logging in you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy</Link>.</p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
