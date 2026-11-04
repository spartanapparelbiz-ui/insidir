/* Log in (/login), on the homepage's system: "Welcome back.", one Continue to Whop's sign-in (app/login/start → Whop →
 * app/login/callback) on a black stage, no white panel. Members go on to where they were going; a signed-in account
 * without Insidir goes to the paywall. Errors are one sentence with the button to try again. New here? Start for $1
 * goes to /go. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContinueButton } from "@/components/auth/ContinueButton";
import { Lines, Stage } from "@/components/system";
import { BrandNav } from "@/components/brand/Nav";
import { safeNext } from "@/lib/auth/next";
import { getViewer } from "@/lib/auth/viewer";
import { slotPhoto } from "@/lib/brand/images";
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
  if (viewer.user) redirect("/go?step=paywall"); // signed in without Insidir: the paywall, never an empty app
  return (
    <main className="b-root" data-testid="login-page">
      <BrandNav fixed />
      <Stage bg={{ kind: "photo", photo: slotPhoto("cta"), dark: 0.55, priority: true }} first testid="login" labelledBy="login-h">
        <div className="b-head b-center">
          <Lines as="h1" id="login-h" lines={["Welcome back."]} size={64} />
          <p className="b-sub" data-m="lift">Sign in with the Whop account you paid with.</p>
          {sp.error && ERRORS[sp.error] ? <p className="b-msg aerr" role="alert">{ERRORS[sp.error]}</p> : null}
          <div className="b-ctas"><ContinueButton next={next} /></div>
          <p className="b-small">Secure sign-in and payments by Whop. No password here.</p>
          <p className="b-small" data-testid="login-new">New here? <a className="s-link" href="/go" data-checkout="login">Start for $1</a></p>
        </div>
      </Stage>
    </main>
  );
}
