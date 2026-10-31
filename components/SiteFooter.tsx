import Link from "next/link";
import { COMPANY, DATA_COMPANY, FOOTER, GAMBLER } from "@/lib/copy";
import { Wordmark } from "./Wordmark";
import { isReady } from "@/lib/features";

/** Every page's footer: who builds Insidir and how to reach a person; the product and the trust pages (Methodology,
 * Our data, Status, Security, Disclosures, Terms, Privacy, Credits, Changelog); what Insidir is not; the
 * problem-gambling line. Photo and logo credits live on /credits. */
export const SUPPORT_EMAIL = COMPANY.email;

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap foot__in">
        <div className="foot__who">
          <Link className="foot__logo" href="/" aria-label="Insidir home"><Wordmark /></Link>
          <p className="foot__company">{COMPANY.name} · {COMPANY.place} · <a className="link" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></p>
        </div>
        <div className="foot__cols">
          <nav className="foot__links" aria-label="Product">
            <Link href="/trackers">Trackers</Link>
            <Link href="/sports">Sports</Link>
            <Link href="/markets">Prediction markets</Link>
            {isReady("stocks") ? <Link href="/stocks">Stocks</Link> : null}
            <Link href="/top">Leaderboard</Link>
            <Link href="/results">Track record</Link>
            <Link href="/pricing">Pricing</Link>
          </nav>
          <nav className="foot__links" aria-label="Company">
            <Link href="/about">About</Link>
            <Link href="/methodology">Methodology</Link>
            <Link href="/data">Our data</Link>
            <Link href="/status">Status</Link>
            <Link href="/security">Security</Link>
            <Link href="/help">Help</Link>
            <Link href="/changelog">Changelog</Link>
          </nav>
          <nav className="foot__links" aria-label="Legal">
            <Link href="/disclosures">Disclosures</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/credits">Credits</Link>
          </nav>
        </div>
        <div className="foot__legal">
          <p>{DATA_COMPANY}</p>
          <p>{FOOTER}</p>
          <p className="foot__gambler">{GAMBLER}</p>
        </div>
      </div>
    </footer>
  );
}
