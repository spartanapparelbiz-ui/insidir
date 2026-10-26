/* Log in / sign up: a split screen. The summit (photo 6) on the left with "Follow the big money." in the serif; on
 * the right, on white, "Continue with Whop" (Insidir signs in with Whop, the same account that holds the plan; a new
 * visitor's Whop account is created there). On phones the photo is a short band at the top. After a failed sign-in
 * (?error=...) the right side says what happened and what to do next. */
import type { Metadata } from "next";
import Link from "next/link";
import { Photo } from "@/components/Photo";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/feed";
  return (
    <>
      <SiteHeader signedIn={false} minimal />
      <main className="split">
        <div className="split__photo">
          <Photo n={6} eager />
          <p className="split__line serif">Follow the big money.</p>
        </div>
        <div className="split__form">
          <div className="split__box">
            {sp.error ? <p className="state2__code">Sign-in didn&apos;t finish</p> : null}
            <h1 className="split__h">{sp.error ? "Let's try that again." : "Log in or sign up."}</h1>
            <p className="split__p">
              {sp.error ? "Something went wrong between us and Whop. Nothing was charged. Try again; if it keeps happening, write to hello@aethric.llc."
                : "Insidir uses your Whop account, the same one that holds your plan. New here? Whop sets one up in a few seconds. No new password."}
            </p>
            <a className="btn btn--primary btn--big btn--block" href={`/auth/login?next=${encodeURIComponent(next)}`}>Continue with Whop</a>
            <Link className="btn btn--secondary btn--block" href="/feed">See the free feed</Link>
            <p className="split__fine">Public data. Not financial advice. By continuing you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy</Link>.</p>
          </div>
        </div>
      </main>
    </>
  );
}
