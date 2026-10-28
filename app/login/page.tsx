/* Log in to Insidir (/login): one button, "Continue", to Whop's sign-in (Google, Apple or email; app/login/start).
 * Members and free-access emails come back signed in; anyone else sees "No Insidir membership for <email>" with
 * "Try 7 days for $1" and "Use a different account". Already logged in: straight on to where they were going. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PENDING_COOKIE, readPending } from "@/lib/billing/pending";
import { Photo } from "@/components/Photo";
import { SiteHeader } from "@/components/SiteHeader";
import { safeNext } from "@/lib/auth/next";
import { getViewer } from "@/lib/auth/viewer";
import { NO_PLAN_COOKIE } from "@/lib/auth/whop-login";
import { isPaid } from "@/lib/plans";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  expired: "That sign-in took too long. Try again.",
  failed: "Sign-in didn't go through. Try again.",
  rate_limited: "Too many tries. Wait 15 minutes and try again.",
  unavailable: "Log-in is unavailable right now. Try again in a few minutes.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const viewer = await getViewer();
  if (viewer.user && isPaid(viewer.plan)) redirect(next);
  const jar = await cookies();
  // Made an account on /start but didn't pay: offer to finish.
  const pending = viewer.user ? null : readPending(jar.get(PENDING_COOKIE)?.value);
  const noPlan = sp.error === "no_membership";
  const noPlanEmail = noPlan ? readPending(jar.get(NO_PLAN_COOKIE)?.value) : null;
  const go = `/login/start${next !== "/feed" ? `?next=${encodeURIComponent(next)}` : ""}`;
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
            {pending && !noPlan ? (
              <div className="finish" data-testid="finish-insidir">
                <p className="finish__h">Finish getting Insidir</p>
                <p className="finish__p">You started with <b>{pending}</b>. Pick up where you left off: one step left.</p>
                <Link className="btn btn--primary btn--block" href="/start">Finish getting Insidir</Link>
              </div>
            ) : null}
            <div className="login">
              {noPlan ? (
                <div data-testid="no-membership">
                  <h1 className="login__h">No Insidir membership{noPlanEmail ? <> for <b>{noPlanEmail}</b></> : null}</h1>
                  <p className="login__p">That account hasn&apos;t got Insidir. Start a trial, or sign in with the account you paid with.</p>
                  <Link className="btn btn--primary btn--big btn--block" href="/start">Try 7 days for $1</Link>
                  <a className="btn btn--secondary btn--block login__alt" href={`/login/start?fresh=1${next !== "/feed" ? `&next=${encodeURIComponent(next)}` : ""}`}>Use a different account</a>
                </div>
              ) : (
                <>
                  <h1 className="login__h">Log in to Insidir</h1>
                  {sp.error && ERRORS[sp.error] ? <p className="login__err" role="alert">{ERRORS[sp.error]}</p> : null}
                  <a className="btn btn--primary btn--big btn--block" href={go} data-testid="login-continue">Continue</a>
                  <p className="login__fine login__via">Google, Apple or email · secure sign-in by Whop</p>
                </>
              )}
              <p className="login__fine">New here? <Link href="/start">Try 7 days for $1</Link>, then $39/mo. By logging in you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy</Link>.</p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
