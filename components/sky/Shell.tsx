/* The member dashboard's frame: a left sidebar on desktop (logo, white New Read pill, Home, Markets, Your markets,
 * Library, Record, Account); on phones a bottom tab bar (Home · Markets · Read in the centre · Your markets · Account)
 * with safe-area padding. Content up to 1200px. */
import type { ReactNode } from "react";
import { ViewAs } from "@/components/ViewAs";
import { Footer } from "@/components/open/Frame";
import { LiveRefresh } from "./LiveRefresh";
import { Logo, Mark } from "./Logo";
import { Reveal } from "./Reveal";

export type Section = "home" | "board" | "markets" | "yours" | "library" | "record" | "account" | "read";

const ICON: Record<Exclude<Section, "read">, string> = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", board: "M4 6h16M4 12h16M4 18h10", markets: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  yours: "M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 6.5-7 11-7 11z", library: "M5 4h10l4 4v12H5zM15 4v4h4",
  record: "M4 19l5-6 4 3 7-9", account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
};
const Icon = ({ k }: { k: keyof typeof ICON }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[k]} /></svg>;
const SIDE: ReadonlyArray<[keyof typeof ICON, string, string]> = [
  ["home", "Home", "/"], ["board", "Millionaires", "/board"], ["markets", "Markets", "/markets"], ["yours", "Your markets", "/#your-markets"], ["library", "Library", "/library"], ["record", "Record", "/results"], ["account", "Account", "/settings"],
];

export function Shell({ current, children, refresh = true }: { current: Section; children: ReactNode; refresh?: boolean }) {
  return (
    <div className="sk skm">
      {refresh ? <LiveRefresh /> : null}
      <Reveal />
      <div className="skm-viewas"><ViewAs /></div>
      <aside className="skm-side" aria-label="insidir">
        <Logo />
        <a className="sk-btn skm-side__new" href="/?ask=1" data-testid="new-read">New Read</a>
        <nav aria-label="Main"><ul className="skm-side__nav">{SIDE.map(([k, label, href]) => <li key={k}><a href={href} aria-current={current === k ? "page" : undefined}><Icon k={k} />{label}</a></li>)}</ul></nav>
      </aside>
      <header className="skm-top"><Logo /></header>
      <div className="skm-main">
        <main className="skm-content">{children}</main>
        <Footer />
      </div>
      <nav className="skm-tabs" aria-label="Main">
        <a href="/" aria-current={current === "home" ? "page" : undefined}><Icon k="home" /><span>Home</span></a>
        <a href="/board" aria-current={current === "board" ? "page" : undefined}><Icon k="board" /><span>Millionaires</span></a>
        <a href="/?ask=1" className="skm-tabs__read" aria-current={current === "read" ? "page" : undefined}><span className="skm-tabs__dot"><Mark size={18} /></span><span>Read</span></a>
        <a href="/#your-markets" aria-current={current === "yours" ? "page" : undefined}><Icon k="yours" /><span>Your markets</span></a>
        <a href="/settings" aria-current={current === "account" ? "page" : undefined}><Icon k="account" /><span>Account</span></a>
      </nav>
    </div>
  );
}
