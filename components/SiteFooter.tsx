import Link from "next/link";
import { FOOTER } from "@/lib/copy";

/** Every page's footer: who builds Insidir and how to reach a person, the links that prove what we say (Receipts,
 *  Privacy, Terms, About), and the risk disclaimer. */
export const SUPPORT_EMAIL = "hello@aethric.llc";

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot__grid">
          <div>
            <p className="foot__who">Insidir is built by Aethric LLC, Pompano Beach, FL.</p>
            <p className="foot__contact">
              <a className="link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              <span>Replies within 24 hours.</span>
            </p>
          </div>
          <nav className="foot__links" aria-label="Footer">
            <Link href="/terminal">Terminal</Link>
            <Link href="/receipts">Receipts</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/about">About</Link>
            <Link href="/#faq">FAQ</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
        <p className="foot__legal">{FOOTER}</p>
        <p className="muted" style={{ marginTop: 8 }}>© 2026 Aethric LLC · insidir.com</p>
      </div>
    </footer>
  );
}
