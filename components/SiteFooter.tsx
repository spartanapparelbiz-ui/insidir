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
          {/* No prefetch: five dynamic pages rendered on every page view would slow the tap the visitor makes. */}
          <Link href="/results" prefetch={false}>Results</Link>
          <Link href="/pricing" prefetch={false}>Pricing</Link>
          <Link href="/about" prefetch={false}>About</Link>
          <Link href="/terms" prefetch={false}>Terms</Link>
          <Link href="/privacy" prefetch={false}>Privacy</Link>
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
