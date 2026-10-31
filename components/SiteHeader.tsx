/* The top of every page: the nav, white with the black logo and a hairline. Visitors: logo, Trackers, Activity, Open
 * now, Leaderboard, Pricing, Log in, and "Get started" (36px, the one button besides each page's own).
 * Members: logo, Trackers (their home), Activity, Following, Leaderboard, Track record, Account; the menu also holds
 * Position check (/check), reachable only from there. On phones: logo, the button and a menu; on the app pages,
 * members and visitors get a bottom tab bar within thumb reach: Trackers, Activity, Following, Account.
 * Positioning joins both only once its scorecard shows a positive edge on 100+ scored calls (lib/smart/gate.ts).
 * Every target is 44px+. `status` is kept for callers and shown under the nav when given. */
import Link from "next/link";
import { positioningOn } from "@/lib/smart/gate";
import type { ReactNode } from "react";
import type { Plan } from "@/lib/types";
import { NAV_CTA } from "@/lib/copy";
import { Wordmark } from "./Wordmark";
import { isReady } from "@/lib/features";
import { TabIcon } from "./TabIcon";
import { ViewAs } from "./ViewAs";

const SECTION: Record<string, string> = { "/settings": "/account", "/alerts": "/account", "/pnl": "/account", "/whales": "/account", "/terminal": "/feed", "/gaps": "/feed", "/p": "/top", "/market": "/feed" };
/** Sections that get the bottom tab bar on phones, for members and visitors alike (the free feed needs no account). */
const APP_SECTIONS = new Set(["/discover", "/feed", "/trackers", "/top", "/open", "/following", "/results", "/account", "/check", "/splits"]);

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
  // Trackers first: each one is a live portfolio of large positions. Members open the app on Trackers (home).
  // Research opens the ⌘K palette (components/research/ResearchPalette.tsx); without JavaScript, the /research page.
  const research = <Link key="research" href="/research" data-research-open aria-current={at === "/research" ? "page" : undefined}>Research <kbd className="nav__kbd" aria-label="Command K">⌘K</kbd></Link>;
  const links = signedIn
    ? [link(paid ? "/" : "/trackers", "Trackers", paid ? "/discover" : "/trackers"), link("/feed", "Activity"), link("/following", "Following"), link("/top", "Leaderboard"), research, ...(positioningOn() ? [link("/splits", "Positioning")] : []), link("/results", "Track record"), link("/settings", "Account", "/account")]
    : [link("/trackers", "Trackers"), link("/open", "Open now"), link("/top", "Leaderboard"), research, ...(positioningOn() ? [link("/splits", "Positioning")] : []), link("/pricing", "Pricing"), <Link key="login" href="/signin">Log in</Link>];
  // The app menu also holds the position check, which lives only here.
  const menu = signedIn ? [...links.slice(0, -1), link("/check", "Position check"), links[links.length - 1]!] : links;
  return (
    <>
      <ViewAs />
      <header className={tone === "light" ? "nav nav--light" : "nav"}>
        <div className="wrap nav__in">
          <Link className="wordmark" href={signedIn && !paid ? "/trackers" : "/"} aria-label="Insidir home"><Wordmark /></Link>
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
      {signedIn || (at && APP_SECTIONS.has(at)) ? (
        <nav className="tabbar" aria-label="App">
          {[[paid ? "/" : "/trackers", "Trackers", paid ? "/discover" : "/trackers"], ["/feed", "Activity", "/feed"], ["/following", "Following", "/following"], [signedIn ? "/settings" : "/signin", "Account", "/account"]].map(([href, label, section]) => (
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
