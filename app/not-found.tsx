/* The 404 page: on-brand, says what happened, and gives two ways back. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default async function NotFound() {
  const viewer = await getViewer().catch(() => null);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer?.user)} />
      <main className="wrap state-page">
        <p className="state-page__code mono">404</p>
        <h1 className="state-page__h">We can&apos;t find that page</h1>
        <p className="state-page__p">The link may be old or mistyped. The live deals are on the Terminal.</p>
        <div className="row-gap">
          <Link className="btn btn--primary" href="/terminal">Open the Terminal</Link>
          <Link className="btn btn--secondary" href="/">Go home</Link>
        </div>
      </main>
    </>
  );
}
