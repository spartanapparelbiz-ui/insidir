/* Log in (/login): "Welcome back.", one "Continue" to Whop's sign-in (app/login/start → Whop → app/reset/callback),
 * in the sign-up frame (components/auth/AuthSplit.tsx). Members go on to where they were going; a signed-in account
 * without Insidir goes to /start step 2. Errors are one sentence with the button to try again. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/auth/AuthSplit";
import { ContinueButton } from "@/components/auth/ContinueButton";
import { safeNext } from "@/lib/auth/next";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", description: "Sign in to Insidir with Whop.", robots: { index: false } };

const ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled. Continue when you're ready.",
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
    <AuthSplit>
      <div className="astart rise-in login">
        <h1 className="astart__h">Welcome back.</h1>
        {sp.error && ERRORS[sp.error] ? <p className="aerr" role="alert">{ERRORS[sp.error]}</p> : null}
        <div className="astart__cta"><ContinueButton next={next} /></div>
        <p className="astart__alt">New here? <Link href="/start">Start for $1</Link></p>
      </div>
    </AuthSplit>
  );
}
