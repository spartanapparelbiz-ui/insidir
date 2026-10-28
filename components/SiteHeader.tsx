/* The top of every page (docs/INSIDIR-V2.md §6): a thin grey offer bar ("Try 7 days for $1, then $39/mo, cancel anytime."), then the nav: a black bar with the white logo,
 * or white with a hairline on the plain white pages (tone="light": legal, about). Visitors: logo, Sports, Markets,
 * Stocks, How it works, Pricing, FAQ (each its own page), Log in, and "Try 7 days for $1". Members: logo, Feed, Following, Results, Account. On phones: logo, the
 * button and a menu; on the app pages (feed, top, profiles, markets, results, following, account), members and
 * visitors get a bottom tab bar within thumb reach: Feed, Top, Following, Account.
 * Every target is 44px+. `status` is kept for callers and shown under the nav when given. */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Plan } from "@/lib/types";
import { GET_CTA, OFFER_BAR } from "@/lib/copy";
import { Wordmark } from "./Wordmark";
import { isReady } from "@/lib/features";
import { TabIcon } from "./TabIcon";
import { ViewAs } from "./ViewAs";

const SECTION: Record<string, string> = { "/settings": "/account", "/alerts": "/account", "/pnl": "/account", "/whales": "/account", "/terminal": "/feed", "/gaps": "/feed", "/p": "/top", "/market": "/feed" };
/** Sections that get the bottom tab bar on phones, for members and visitors alike (the free feed needs no account). */
const APP_SECTIONS = new Set(["/feed", "/top", "/following", "/results", "/account"]);

export function SiteHeader({ signedIn, current, status, plan, trialHref = "/start", tone = "dark", minimal = false, offer = true }: {
  plan?: Plan; signedIn: boolean; current?: string; status?: ReactNode; trialHref?: string; tone?: "dark" | "light";
  /** The offer bar and "Try 7 days for $1" button (off on home, where the one action is "See the live feed"). */
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
    ? [link("/feed", "Feed"), link("/top", "Top traders"), link("/following", "Following"), link("/results", "Results"), link("/settings", "Account", "/account")]
    : [link("/sports", "Sports"), link("/markets", "Markets"), ...(isReady("stocks") ? [link("/stocks", "Stocks")] : []),
      link("/how-it-works", "How it works"), link("/pricing", "Pricing"), link("/faq", "FAQ"), <Link key="login" href="/signin">Log in</Link>];
  return (
    <>
      <ViewAs />
      {!paid && offer ? <p className="trialbar"><a href={trialHref} data-unlock="trial-bar">{OFFER_BAR}</a></p> : null}
      <header className={tone === "light" ? "nav nav--light" : "nav"}>
        <div className="wrap nav__in">
          <Link className="wordmark" href={signedIn ? "/feed" : "/"} aria-label="Insidir home"><Wordmark /></Link>
          <nav className={`nav__links${signedIn ? " nav__links--member" : ""}`} aria-label="Main">{links}</nav>
          {!paid && offer ? <a className="btn btn--primary nav__cta" href={trialHref} data-unlock="nav">{GET_CTA}</a> : null}
          <details className={`nav__menu${signedIn ? " nav__menu--member" : ""}`}>
            <summary aria-label="Menu"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></summary>
            <nav className="nav__sheet" aria-label="Menu">{links}</nav>
          </details>
        </div>
        {status ? <div className="wrap nav__status">{status}</div> : null}
        {/* how far down the page you are (app/v2.css, components/motion/Motion.tsx) */}
        <span className="nav__prog" aria-hidden="true" />
      </header>
      {/* Phones: the one action, always within thumb reach, on every public page a visitor sees (not /start, /login). */}
      {!paid && !signedIn && (offer || current === "/") ? (
        <div className={`getbar${at && APP_SECTIONS.has(at) ? " getbar--tabbar" : ""}`} data-testid="sticky-cta">
          <a className="btn btn--primary btn--block" href={trialHref} data-unlock="sticky">{GET_CTA}</a>
        </div>
      ) : null}
      {signedIn || (at && APP_SECTIONS.has(at)) ? (
        <nav className="tabbar" aria-label="App">
          {[["/feed", "Feed", "/feed"], ["/top", "Top", "/top"], ["/following", "Following", "/following"], [signedIn ? "/settings" : "/signin", "Account", "/account"]].map(([href, label, section]) => (
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
