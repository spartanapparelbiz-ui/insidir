/* The 404 page: says what happened and gives two ways back. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default async function NotFound() {
  const viewer = await getViewer().catch(() => null);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer?.user)} plan={viewer?.plan} />
      <main className="wrap state2">
        <p className="state2__code">404</p>
        <h1 className="state2__h">This page doesn&apos;t exist.</h1>
        <p className="state2__p">The link may be old or mistyped. The big money is on the live feed.</p>
        <div className="state2__ctas">
          <Link className="btn btn--primary" href="/feed">See the live feed</Link>
          <Link className="btn btn--secondary" href="/">Go home</Link>
        </div>
      </main>
    </>
  );
}
