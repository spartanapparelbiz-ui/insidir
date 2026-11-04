/* The top of every page: the nav, white with the black logo and a hairline. One tool: paste any bet, see where the
 * smart money is. Visitors: logo, Pricing, Log in, and "Start for $1" (the one button besides each page's own).
 * Members: logo, Read (their home), Account; the menu also holds everything else Insidir has (My copies, Activity,
 * Winners, Research, Trackers, Following, Position check, Track record), all live by URL. On phones: logo, the
 * button and a menu; members get a bottom tab bar: Read, Account. Every target is 44px+. `status` is kept for
 * callers and shown under the nav when given. */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Plan } from "@/lib/types";
import { NAV_CTA } from "@/lib/copy";
import { Wordmark } from "./Wordmark";
import { TabIcon } from "./TabIcon";
import { ViewAs } from "./ViewAs";

const SECTION: Record<string, string> = { "/settings": "/account", "/wallet": "/wallets", "/market": "/board" };

export function SiteHeader({ signedIn, current, status, plan, trialHref = "/go", tone = "dark", minimal = false, offer = true }: {
  plan?: Plan; signedIn: boolean; current?: string; status?: ReactNode; trialHref?: string; tone?: "dark" | "light";
  /** The nav's "Start for $1" button for visitors (off where a page has nothing to sell, like the checkout). */
  offer?: boolean;
  /** Just the logo on white (sign-in): nothing to distract from the one thing on the page. */
  minimal?: boolean;
}) {
  if (minimal) {
    return (
      <header className="nav nav--light">
        <div className="wrap nav__in"><Link className="wordmark" href="/" aria-label="Insidir home"><Wordmark /></Link></div>
        <span className="nav__prog" aria-hidden="true" />
      </header>
    );
  }
  const at = current ? (SECTION[current] ?? current) : undefined;
  const paid = plan === "insidir";
  const link = (href: string, label: string, section = href) => (
    <Link key={href} href={href} aria-current={at === section ? "page" : undefined}>{label}</Link>
  );
  const links = signedIn
    ? [link("/board", "Board"), link("/settings", "Account", "/account")]
    : [link("/pricing", "Pricing"), <Link key="login" href="/login">Log in</Link>];
  // Everything else lives in the members' menu only.
  const menu = signedIn ? [links[0]!, link("/election", "Election"), link("/markets", "Markets"), link("/wallets", "Wallets"), link("/copies", "My copies"), link("/results", "Track record"), links[1]!] : links;
  return (
    <>
      <ViewAs />
      <header className={tone === "light" ? "nav nav--light" : "nav"}>
        <div className="wrap nav__in">
          <Link className="wordmark" href="/" aria-label="Insidir home"><Wordmark /></Link>
          <nav className={`nav__links${signedIn ? " nav__links--member" : ""}`} aria-label="Main">{links}</nav>
          {!paid && offer ? <a className="btn btn--primary nav__cta" href={trialHref} data-unlock="nav">{NAV_CTA}</a> : null}
          <details className={`nav__menu${signedIn ? " nav__menu--member" : ""}`}>
            <summary aria-label="Menu"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></summary>
            <nav className="nav__sheet" aria-label="Menu">{menu}</nav>
          </details>
        </div>
        {status ? <div className="wrap nav__status">{status}</div> : null}
        {/* how far down the page you are (app/v2.css, components/motion/Motion.tsx) */}
        <span className="nav__prog" aria-hidden="true" />
      </header>
      {signedIn ? (
        <nav className="tabbar" aria-label="App">
          {[["/", "Read", "/"], ["/settings", "Account", "/account"]].map(([href, label, section]) => (
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
