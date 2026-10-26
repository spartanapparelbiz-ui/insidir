/* The top of every page (docs/INSIDIR-V2.md §6): a thin grey trial bar, then the nav: a black bar with the white logo,
 * or white with a hairline on the plain white pages (tone="light": pricing, legal, about). Visitors: logo, How it works,
 * Pricing, FAQ, Log in, and "Try it for $1". Members: logo, Feed, Following, Results, Account. On phones: logo, the
 * button and a menu; members also get a bottom tab bar (Feed, Following, Results, Account) within thumb reach.
 * Every target is 44px+. `status` is kept for callers and shown under the nav when given. */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Plan } from "@/lib/types";
import { TRIAL_BAR, TRY_CTA } from "@/lib/copy";
import { Wordmark } from "./Wordmark";

const SECTION: Record<string, string> = { "/settings": "/account", "/alerts": "/account", "/pnl": "/account", "/whales": "/account", "/terminal": "/feed", "/gaps": "/feed" };

export function SiteHeader({ signedIn, current, status, plan, trialHref = "/pricing#plans", tone = "dark", minimal = false }: {
  plan?: Plan; signedIn: boolean; current?: string; status?: ReactNode; trialHref?: string; tone?: "dark" | "light";
  /** Just the logo on white (sign-in): nothing to distract from the one thing on the page. */
  minimal?: boolean;
}) {
  if (minimal) {
    return (
      <header className="nav nav--light">
        <div className="wrap nav__in"><Link className="wordmark" href="/" aria-label="Insidir home"><Wordmark /></Link></div>
      </header>
    );
  }
  const at = current ? (SECTION[current] ?? current) : undefined;
  const paid = plan === "insidir" || plan === "pro";
  const link = (href: string, label: string, section = href) => (
    <Link key={href} href={href} aria-current={at === section ? "page" : undefined}>{label}</Link>
  );
  const links = signedIn
    ? [link("/feed", "Feed"), link("/top", "Top traders"), link("/following", "Following"), link("/results", "Results"), link("/settings", "Account", "/account")]
    : [link("/#how", "How it works", "/how"), link("/pricing", "Pricing"), link("/#faq", "FAQ", "/faq"), <Link key="login" href="/signin">Log in</Link>];
  return (
    <>
      {!paid ? <p className="trialbar"><a href={trialHref} data-unlock="trial-bar">{TRIAL_BAR}</a></p> : null}
      <header className={tone === "light" ? "nav nav--light" : "nav"}>
        <div className="wrap nav__in">
          <Link className="wordmark" href={signedIn ? "/feed" : "/"} aria-label="Insidir home"><Wordmark /></Link>
          <nav className="nav__links" aria-label="Main">{links}</nav>
          {!paid ? <a className="btn btn--primary nav__cta" href={trialHref} data-unlock="nav">{TRY_CTA}</a> : null}
          <details className="nav__menu">
            <summary aria-label="Menu"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></summary>
            <nav className="nav__sheet" aria-label="Menu">{links}</nav>
          </details>
        </div>
        {status ? <div className="wrap nav__status">{status}</div> : null}
      </header>
      {signedIn ? (
        <nav className="tabbar" aria-label="App">
          {[["/feed", "Feed", "/feed"], ["/following", "Following", "/following"], ["/results", "Results", "/results"], ["/settings", "Account", "/account"]].map(([href, label, section]) => (
            <Link key={href} href={href!} className="tabbar__item" aria-current={at === section ? "page" : undefined}>
              <TabIcon name={label!} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}

function TabIcon({ name }: { name: string }) {
  const d: Record<string, string> = {
    Feed: "M4 6h16M4 12h16M4 18h10",
    Following: "M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z",
    Results: "M5 20V10M12 20V4M19 20v-7",
    Account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6",
  };
  return <svg className="tabbar__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={d[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
