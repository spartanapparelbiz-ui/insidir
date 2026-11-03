/* The members' app shell: a glass sidebar on desktop (the wordmark; the white "Turn on pings" pill only while pings are
 * off on this device; Desk, Election Day, Board, Wallets, Markets, Your copies, Library, Account) and, on phones, a
 * bottom pill bar with search (the Desk's ⌘K bar) in its centre. Black stage behind. Checking a bet is a feature of
 * search, not the app's identity: there is no "Check a bet" button. */
import type { ReactNode } from "react";
import { Logo } from "../Bits";
import { PingsPill } from "@/components/desk/PingsPill";
import { StageMotion } from "../StageMotion";
import { BrandFoot } from "../Nav";
import { ViewAs } from "@/components/ViewAs";
import { electionDay } from "@/lib/brand/pulse";

export type Tab = "home" | "election" | "board" | "wallets" | "markets" | "following" | "copies" | "library" | "account";
const I: Record<string, ReactNode> = {
  home: <path d="M3 10.5 10 4l7 6.5V17a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1z" />,
  wallets: <><circle cx="7.5" cy="10" r="3.6" /><circle cx="12.5" cy="10" r="3.6" /></>,
  board: <path d="M4 5h12M4 10h12M4 15h8" />,
  markets: <><rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" /><rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" /><rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" /><rect x="11" y="11" width="5.5" height="5.5" rx="1.2" /></>,
  following: <><circle cx="10" cy="7" r="3" /><path d="M4 17c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" /></>,
  library: <path d="M5 3.5h8.5L16 6v10.5H5zM8 9h5M8 12h5" />,
  account: <><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="8.5" r="2.2" /><path d="M6 14.6c1-1.4 2.4-2.1 4-2.1s3 .7 4 2.1" /></>,
  check: <><circle cx="9" cy="9" r="5" /><path d="m13 13 3.5 3.5" /></>,
  copies: <><rect x="6.5" y="6.5" width="10" height="10" rx="2" /><path d="M13.5 6.5V4.5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2" /></>,
  election: <><path d="M4 16.5h12M5.5 16.5V9h9v7.5M8 9V5.5h4V9" /><path d="m8.5 12.5 1.2 1.2 2.3-2.4" /></>,
};
const Icon = ({ name }: { name: string }) => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[name]}</svg>;
const NAV_ALL: Array<[Tab, string, string]> = [["home", "Desk", "/"], ["election", "Election Day", "/election"], ["board", "Board", "/board"], ["wallets", "Wallets", "/wallets"], ["markets", "Markets", "/markets"], ["copies", "Your copies", "/copies/yours"], ["library", "Library", "/library"], ["account", "Account", "/settings"]];
/** Election Day sits right after the Desk until its board closes (Nov 4 ET, lib/brand/pulse.ts electionDay). */
const navNow = () => NAV_ALL.filter(([k]) => k !== "election" || electionDay(Date.now()));
/** The Desk's search (⌘K): search a market or paste a bet link. */
export const SEARCH_HREF = "/?search=1";

export function Shell({ current, children }: { current: Tab; children: ReactNode }) {
  const NAV = navNow();
  return (
    <>
    <ViewAs />
    <main className="b-root b-app" data-testid="app-shell">
      <aside className="b-sidebar">
        <nav className="b-sidebar__in b-glass" aria-label="App">
          <Logo />
          <PingsPill />
          {NAV.map(([k, label, href]) => <a key={k} className="b-navi" href={href} aria-current={current === k ? "page" : undefined}><Icon name={k} />{label}</a>)}
        </nav>
      </aside>
      <header className="b-topbar"><Logo /><a className="b-btn b-panel-pill" href="/settings">Account</a></header>
      <div className="b-main">{children}<BrandFoot inline /></div>
      <nav className="b-tabbar b-glass" aria-label="App">
        {NAV.slice(0, 2).map(([k, label, href]) => <a key={k} href={href} aria-current={current === k ? "page" : undefined}><Icon name={k} />{label}</a>)}
        <a className="b-tab-read" href={SEARCH_HREF} aria-label="Search a market or paste a bet link" data-testid="tab-search"><Icon name="check" /></a>
        {NAV.filter(([k]) => k === "board" || k === "wallets").map(([k, label, href]) => <a key={k} href={href} aria-current={current === k ? "page" : undefined}><Icon name={k} />{label}</a>)}
      </nav>
      <StageMotion />
    </main>
    </>
  );
}
