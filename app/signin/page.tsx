/* The sign-in screen: Insidir signs in with Whop (the same account that holds your plan). Shown when someone opens it
 * directly, and after a failed sign-in (?error=...) with what to do next. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/feed";
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} />
      <main className="wrap state2 auth2">
        {sp.error ? <p className="state2__code">Sign-in didn&apos;t finish</p> : null}
        <h1 className="state2__h">{sp.error ? "Let's try that again." : "Log in to Insidir."}</h1>
        <p className="state2__p">
          {sp.error ? "Something went wrong between us and Whop. Nothing was charged. Try again; if it keeps happening, write to hello@aethric.llc."
            : "You log in with Whop, the same account that holds your Insidir plan. No new password."}
        </p>
        <div className="state2__ctas">
          <a className="btn btn--primary" href={`/auth/login?next=${encodeURIComponent(next)}`}>Log in with Whop</a>
          <Link className="btn btn--secondary" href="/feed">See the free feed</Link>
        </div>
      </main>
    </>
  );
}
