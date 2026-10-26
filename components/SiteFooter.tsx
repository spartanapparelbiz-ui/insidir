import Link from "next/link";
import { FOOTER } from "@/lib/copy";

/** Every page's footer (docs/V2.md §6): who builds Insidir, how to reach a person, Terms, Privacy, and the disclaimer. */
export const SUPPORT_EMAIL = "hello@aethric.llc";

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap foot__in">
        <div className="foot__who">
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
      </div>
    </footer>
  );
}
