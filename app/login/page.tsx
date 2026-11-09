/* Log in (/login), on the homepage's system: "Welcome back.", one Continue to Whop's sign-in (app/login/start → Whop →
 * app/login/callback) on a black stage, no white panel. Members go on to where they were going; a signed-in account
 * without Insidir goes to the paywall. Errors are one sentence with the button to try again. New here? Start for $1
 * goes to /go. */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContinueButton } from "@/components/auth/ContinueButton";
import { BrandFoot } from "@/components/brand/Nav";
import { TerminalChrome } from "@/components/terminal/Chrome";
import { safeNext } from "@/lib/auth/next";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid } from "@/lib/plans";
import "../flow-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", description: "Sign in to Insidir.", robots: { index: false } };

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
      <TerminalChrome fixed start={false} />
      <div className="t-wrap tg-page tg-login" data-testid="login" aria-labelledby="login-h">
        <section className="t-panel">
          <header className="t-panel__head"><h2 className="t-panel__title"><span className="t-panel__n">1)</span>SIGN IN · WHOP</h2><span className="t-panel__meta">No password here</span></header>
          <div className="t-panel__body">
            <h1 className="tg-h1" id="login-h">Welcome back.</h1>
            <p className="tg-sub" style={{ marginTop: 6 }}>Sign in with the email you paid with.</p>
            {sp.error && ERRORS[sp.error] ? <p className="tg-msg tg-msg--error aerr" role="alert" style={{ marginTop: 10 }}>{ERRORS[sp.error]}</p> : null}
            <div className="b-ctas" style={{ marginTop: 14 }}><ContinueButton next={next} /></div>
            <p className="tg-note">No password here.</p>
            <p className="tg-note" data-testid="login-new">New here? <a className="s-link" href="/go" data-checkout="login">Start for $1</a></p>
          </div>
          <footer className="t-panel__src">SIGN-IN BY WHOP · INFORMATION, NOT ADVICE · 18+</footer>
        </section>
      </div>
      <BrandFoot inline />
    </main>
  );
}
