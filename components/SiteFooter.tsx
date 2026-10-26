import Link from "next/link";
import { FOOTER } from "@/lib/copy";
import { PHOTO_CREDITS } from "./Photo";
import { Wordmark } from "./Wordmark";

/** Every page's footer (docs/INSIDIR-V2.md §6): the logo, who builds Insidir, how to reach a person, Terms, Privacy, the
 * disclaimer, and the photographers whose Unsplash photos set the scene. */
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
          <Link href="/results">Results</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/about">About</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <p className="foot__legal">{FOOTER}</p>
        <p className="foot__credits">Photos on Unsplash by{" "}
          {PHOTO_CREDITS.map((c, i) => (
            <span key={c.user}><a href={`https://unsplash.com/@${c.user}?utm_source=insidir&utm_medium=referral`} rel="noopener noreferrer" target="_blank">{c.name}</a>{i < PHOTO_CREDITS.length - 2 ? ", " : i === PHOTO_CREDITS.length - 2 ? " and " : "."}</span>
          ))}
        </p>
      </div>
    </footer>
  );
}
