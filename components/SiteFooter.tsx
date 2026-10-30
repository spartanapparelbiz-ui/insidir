import Link from "next/link";
import { FOOTER } from "@/lib/copy";
import { PHOTOGRAPHERS } from "@/lib/photos";
import { Wordmark } from "./Wordmark";
import { isReady } from "@/lib/features";

/** Every page's footer (docs/INSIDIR-V2.md §6): the logo, who builds Insidir, how to reach a person, Terms, Privacy, the
 * disclaimer, the Unsplash photographers whose photos are the trackers' art, and Logo.dev while its logos are on the free plan. */
export const SUPPORT_EMAIL = "hello@aethric.llc";

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap foot__in">
        <div className="foot__who">
          <Link className="foot__logo" href="/" aria-label="Insidir home"><Wordmark /></Link>
          <p className="foot__company">Insidir is built by Aethric LLC, Pompano Beach, FL.</p>
          <p><a className="link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
        </div>
        <nav className="foot__links" aria-label="Footer">
          <Link href="/trackers">Trackers</Link>
          <Link href="/sports">Sports</Link>
          <Link href="/markets">Markets</Link>
          {isReady("stocks") ? <Link href="/stocks">Stocks</Link> : null}
          <Link href="/how-it-works">How it works</Link>
          <Link href="/results">Track record</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/about">About</Link>
          <Link href="/data">About our data</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <p className="foot__legal">{FOOTER}</p>
        <p className="foot__credits">Photos on <a href="https://unsplash.com/?utm_source=insidir&utm_medium=referral" rel="noopener noreferrer" target="_blank">Unsplash</a> by{" "}
          {PHOTOGRAPHERS.map((u, i) => (
            <span key={u}><a href={`https://unsplash.com/@${u}?utm_source=insidir&utm_medium=referral`} rel="noopener noreferrer" target="_blank">@{u}</a>{i < PHOTOGRAPHERS.length - 2 ? ", " : i === PHOTOGRAPHERS.length - 2 ? " and " : "."}</span>
          ))}
          {process.env.LOGO_DEV_TOKEN ? <> <a href="https://logo.dev" rel="noopener noreferrer" target="_blank">Logos provided by Logo.dev</a>.</> : null}
        </p>
      </div>
    </footer>
  );
}
