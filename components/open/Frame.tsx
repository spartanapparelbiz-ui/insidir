/* The template frame (Cruip "Open" layout, app/open.css): the floating header bar, the footer, and the frame for
 * visitors' pages (/board, a Read, Markets). Insidir's logo: the brackets mark and the Outfit wordmark. */
import type { ReactNode } from "react";
import { ViewAs } from "@/components/ViewAs";
import { Logo } from "@/components/sky/Logo";
import { ADVICE, COMPANY } from "@/lib/copy";
import { TRIAL } from "@/lib/plans";

export function Header({ startHref }: { startHref: string }) {
  return (
    <header className="op-head" data-testid="op-header">
      <div className="op-wrap">
        <div className="op-head__bar op-edge">
          <Logo />
          <ul className="op-head__links">
            <li><a href="/board">Millionaires</a></li>
            <li><a href="/#record">Record</a></li>
            <li><a href="/#pricing">Pricing</a></li>
          </ul>
          <ul className="op-head__acts">
            <li><a className="op-btn-sm op-ghost op-edge op-head__login" href="/login">Log in</a></li>
            <li><a className="op-btn-sm op-primary" href={startHref} data-unlock="nav">Start for ${TRIAL.fee}</a></li>
          </ul>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="op-foot" aria-label="Footer">
      <div className="op-wrap">
        <div className="op-foot__top">
          <Logo />
          <ul className="op-foot__links">
            {[["/board", "Millionaires"], ["/markets", "Markets"], ["/results", "Record"], ["/pricing", "Pricing"], ["/faq", "FAQ"], ["/methodology", "Methodology"], ["/status", "Status"], ["/credits", "Credits"], ["/terms", "Terms"], ["/privacy", "Privacy"]].map(([h, l]) => <li key={h}><a href={h}>{l}</a></li>)}
          </ul>
        </div>
        <p className="op-foot__fine" data-testid="sk-advice">{ADVICE.replace(/\.$/, "")}. Operated by {COMPANY.name}.</p>
      </div>
    </footer>
  );
}

/** A visitor's page in the template: header, content, footer. */
export function OpenFrame({ children, startHref = "/start" }: { children: ReactNode; startHref?: string }) {
  return (
    <div className="sk op">
      <ViewAs />
      <span className="op-glow" aria-hidden="true" />
      <Header startHref={startHref} />
      <main className="op-wrap op-page">{children}</main>
      <Footer />
    </div>
  );
}
