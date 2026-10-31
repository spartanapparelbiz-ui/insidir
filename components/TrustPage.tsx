/* The shell of every company and trust page (About, Methodology, Our data, Status, Security, Disclosures, Terms,
 * Privacy, Credits, Changelog, Help): the header, a plain article with its title, an optional dated line ("Last
 * updated October 31, 2026") and an optional lead, and the trial as the page's one black button. Server component. */
import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";
import { RevealGroup } from "@/components/motion/Reveal";
import "../app/landing.css";

export async function TrustPage({ path, title, updated, lead, children, cta = true }: {
  path: string; title: string; updated?: string; lead?: ReactNode; children: ReactNode; cta?: boolean;
}) {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current={path} tone="light" />
      <main className="wrap lp">
        <RevealGroup as="article" className="lp-legal lp-about">
          <h1>{title}</h1>
          {updated ? <p className="lp-legal__date">Last updated {updated}</p> : null}
          {lead ? <p className="lp-about__lead">{lead}</p> : null}
          {children}
        </RevealGroup>
        {cta && !viewer.user ? (
          <div className="lp-legal__next">
            <Link className="btn btn--primary" href="/start">Start your 7-day trial</Link>
            <p className="lp-legal__fine">$1 for the first week, then $39 a month. Cancel anytime. Secure sign-in and payments by Whop.</p>
          </div>
        ) : null}
      </main>
    </>
  );
}
