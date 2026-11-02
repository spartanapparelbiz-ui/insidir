/* The nav: fixed, clear over the first screen, a glass bar once you scroll past it (data-glass, set by the scroll
 * engine). Mono links left (MARKETS · BOARD · RECORD · FAQ), the logo centred, Log in and Start for $1 right. On phones:
 * logo left, Start right; the links are in the footer. */
import { START } from "@/lib/brand/copy";
import { BrandLogo } from "./Logo";

export function BrandNav({ startHref = "/go", glass = false }: { startHref?: string; glass?: boolean }) {
  return (
    <header className="b-nav" data-nav="" data-glass={glass ? "true" : "false"} data-testid="brand-nav">
      <div className="b-wrap b-nav__in">
        <nav className="b-nav__links" aria-label="Main">
          <a href="/markets">Markets</a><a href="/board">Board</a><a href="/results">Record</a><a href="/#faq">FAQ</a>
        </nav>
        <span className="b-nav__logo"><BrandLogo /></span>
        <span className="b-nav__right">
          <a className="b-btn b-btn--ghost b-btn--sm b-nav__login" href="/login">Log in</a>
          <a className="b-btn b-btn--sm" href={startHref} data-testid="nav-start" data-checkout="nav">{START} <span aria-hidden="true">→</span></a>
        </span>
      </div>
    </header>
  );
}

/** The footer, set inside the bottom of the final photo. */
export function BrandFoot() {
  return (
    <footer className="b-foot" data-testid="brand-foot">
      <div className="b-wrap b-foot__in">
        <BrandLogo />
        <nav className="b-foot__links" aria-label="Footer">
          <a href="/markets">Markets</a><a href="/board">Board</a><a href="/results">Record</a><a href="/faq">FAQ</a>
          <a href="/login">Log in</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/methodology">Methodology</a>
        </nav>
        <p>Information, not financial or betting advice. Operated by Aethric LLC.</p>
      </div>
    </footer>
  );
}
