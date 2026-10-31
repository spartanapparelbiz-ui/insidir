/* Log in to Insidir (/login): one button, "Continue", to Whop's sign-in (Google, Apple or email; app/login/start →
 * Whop → app/reset/callback). Members go on to where they were going; a signed-in account without Insidir is sent to
 * /start, where checkout opens. Already in: straight on. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Photo } from "@/components/Photo";
import { SiteHeader } from "@/components/SiteHeader";
import { ContinueButton } from "@/components/auth/ContinueButton";
import { safeNext } from "@/lib/auth/next";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", description: "Sign in to Insidir with Whop.", robots: { index: false } };

const ERRORS: Record<string, string> = {
  expired: "That sign-in took too long. Try again.",
  failed: "Sign-in didn't go through. Try again.",
  rate_limited: "Too many tries. Wait 15 minutes and try again.",
  unavailable: "Sign-in is unavailable right now. Try again in a few minutes.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const viewer = await getViewer();
  if (viewer.user && isPaid(viewer.plan)) redirect(next);
  if (viewer.user) redirect("/start");
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
            <div className="login">
              <h1 className="login__h">Log in to Insidir</h1>
              {sp.error && ERRORS[sp.error] ? <p className="login__err" role="alert">{ERRORS[sp.error]}</p> : null}
              <ContinueButton next={next} />
              <p className="login__fine">New here? <Link href="/start">Try 7 days for $1</Link>, then $39/mo. By continuing you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy</Link>.</p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
