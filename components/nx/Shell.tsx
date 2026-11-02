/* The member pages' frame (new design system): on desktop a slim left sidebar like Perplexity (logo, New Read, Home,
 * Markets, Your markets, Library, Record, Account); on phones no sidebar, a bottom tab bar like Kalshi (Home · Markets ·
 * Read in the centre · Your markets · Account) with safe-area padding. Content max-width 1200px. */
import type { ReactNode } from "react";
import { NxFooter } from "./Landing";
import { LiveRefresh } from "./LiveRefresh";
import { Logo, Mark } from "./Logo";

export type Section = "home" | "markets" | "yours" | "library" | "record" | "account" | "read";

const SIDE: ReadonlyArray<[Section, string, string]> = [
  ["home", "Home", "/"], ["markets", "Markets", "/markets"], ["yours", "Your markets", "/#your-markets"], ["library", "Library", "/library"],
  ["record", "Record", "/results"], ["account", "Account", "/settings"],
];

const Icon = ({ d }: { d: string }) => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ICONS: Record<Section, string> = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", markets: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  yours: "M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 6.5-7 11-7 11z", library: "M5 4h10l4 4v12H5zM15 4v4h4",
  record: "M4 19l5-6 4 3 7-9", account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0", read: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
};

export function Shell({ current, children, refresh = true }: { current: Section; children: ReactNode; refresh?: boolean }) {
  return (
    <div className="nx nxm">
      {refresh ? <LiveRefresh /> : null}
      <aside className="nxm-side" aria-label="Insidir">
        <Logo />
        <a className="nx-pill nx-pill--accent nxm-side__new" href="/?ask=1" data-testid="new-read">New Read</a>
        <nav aria-label="Main">
          <ul className="nxm-side__nav">
            {SIDE.map(([k, label, href]) => (
              <li key={k}><a href={href} aria-current={current === k ? "page" : undefined}><Icon d={ICONS[k]} />{label}</a></li>
            ))}
          </ul>
        </nav>
      </aside>
      <header className="nxm-top"><Logo /></header>
      <div className="nxm-main">
        <main className="nxm-content">{children}</main>
        <NxFooter />
      </div>
      <nav className="nxm-tabs" aria-label="Main">
        <a href="/" aria-current={current === "home" ? "page" : undefined}><Icon d={ICONS.home} /><span>Home</span></a>
        <a href="/markets" aria-current={current === "markets" ? "page" : undefined}><Icon d={ICONS.markets} /><span>Markets</span></a>
        <a href="/?ask=1" className="nxm-tabs__read" aria-current={current === "read" ? "page" : undefined}><span className="nxm-tabs__dot"><Mark size={18} /></span><span>Read</span></a>
        <a href="/#your-markets" aria-current={current === "yours" ? "page" : undefined}><Icon d={ICONS.yours} /><span>Your markets</span></a>
        <a href="/settings" aria-current={current === "account" ? "page" : undefined}><Icon d={ICONS.account} /><span>Account</span></a>
      </nav>
    </div>
  );
}
