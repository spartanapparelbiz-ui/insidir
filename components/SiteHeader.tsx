/* The top of every page: the nav, white with the black logo and a hairline. Visitors: logo, Trackers, Results, How it
 * works, Pricing, Log in, and "Get started" (36px, the one button besides each page's own). Members:
 * logo, Trackers, Feed, Following, Results, Account. On phones: logo, the button and a menu; on the app pages (feed, top, profiles, markets, results, following, account), members and
 * visitors get a bottom tab bar within thumb reach: Feed, Top, Following, Account.
 * Every target is 44px+. `status` is kept for callers and shown under the nav when given. */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Plan } from "@/lib/types";
import { NAV_CTA } from "@/lib/copy";
import { Wordmark } from "./Wordmark";
import { isReady } from "@/lib/features";
import { TabIcon } from "./TabIcon";
import { ViewAs } from "./ViewAs";

const SECTION: Record<string, string> = { "/settings": "/account", "/alerts": "/account", "/pnl": "/account", "/whales": "/account", "/terminal": "/feed", "/gaps": "/feed", "/p": "/top", "/market": "/feed" };
/** Sections that get the bottom tab bar on phones, for members and visitors alike (the free feed needs no account). */
const APP_SECTIONS = new Set(["/discover", "/feed", "/trackers", "/top", "/following", "/results", "/account", "/check", "/splits"]);

export function SiteHeader({ signedIn, current, status, plan, trialHref = "/start", tone = "dark", minimal = false, offer = true }: {
  plan?: Plan; signedIn: boolean; current?: string; status?: ReactNode; trialHref?: string; tone?: "dark" | "light";
  /** The nav's "Get started" button for visitors (off where a page has nothing to sell, like the checkout). */
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
    ? [...(paid ? [link("/", "Discover", "/discover")] : []), link("/check", "Check your bet"), link("/trackers", "Trackers"), link("/splits", "Splits"), link("/feed", "Feed"), link("/following", "Following"), link("/settings", "Account", "/account")]
    : [link("/check", "Check your bet"), link("/trackers", "Trackers"), link("/splits", "Splits"), link("/results", "Results"), link("/pricing", "Pricing"), <Link key="login" href="/signin">Log in</Link>];
  return (
    <>
      <ViewAs />
      <header className={tone === "light" ? "nav nav--light" : "nav"}>
        <div className="wrap nav__in">
          <Link className="wordmark" href={signedIn ? "/feed" : "/"} aria-label="Insidir home"><Wordmark /></Link>
          <nav className={`nav__links${signedIn ? " nav__links--member" : ""}`} aria-label="Main">{links}</nav>
          {!paid && offer ? <a className="btn btn--primary nav__cta" href={trialHref} data-unlock="nav">{NAV_CTA}</a> : null}
          <details className={`nav__menu${signedIn ? " nav__menu--member" : ""}`}>
            <summary aria-label="Menu"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></summary>
            <nav className="nav__sheet" aria-label="Menu">{links}</nav>
          </details>
        </div>
        {status ? <div className="wrap nav__status">{status}</div> : null}
        {/* how far down the page you are (app/v2.css, components/motion/Motion.tsx) */}
        <span className="nav__prog" aria-hidden="true" />
      </header>
      {signedIn || (at && APP_SECTIONS.has(at)) ? (
        <nav className="tabbar" aria-label="App">
          {/* Check your bet sits in the middle: the app's main action. Trackers stays in the menu and on Discover. */}
          {[paid ? ["/", "Discover", "/discover"] : ["/trackers", "Trackers", "/trackers"], ["/feed", "Feed", "/feed"], ["/check", "Check", "/check"], ["/following", "Following", "/following"], [signedIn ? "/settings" : "/signin", "Account", "/account"]].map(([href, label, section]) => (
            <Link key={href} href={href!} className={`tabbar__item${label === "Check" ? " tabbar__item--main" : ""}`} aria-current={at === section ? "page" : undefined}>
              <TabIcon name={label!} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}
