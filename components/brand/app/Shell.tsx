/* The members' app shell: a glass sidebar on desktop (the wordmark, the white "Check a bet" pill, Home, Board, Markets,
 * Following, Library, Account) and, on phones, a bottom pill bar with "Check a bet" in its centre. Black stage behind. */
import type { ReactNode } from "react";
import { Arrow, Logo } from "../Bits";
import { StageMotion } from "../StageMotion";

type Tab = "home" | "board" | "markets" | "following" | "library" | "account";
const I: Record<string, ReactNode> = {
  home: <path d="M3 10.5 10 4l7 6.5V17a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1z" />,
  board: <path d="M4 5h12M4 10h12M4 15h8" />,
  markets: <><rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" /><rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" /><rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" /><rect x="11" y="11" width="5.5" height="5.5" rx="1.2" /></>,
  following: <><circle cx="10" cy="7" r="3" /><path d="M4 17c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" /></>,
  library: <path d="M5 3.5h8.5L16 6v10.5H5zM8 9h5M8 12h5" />,
  account: <><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="8.5" r="2.2" /><path d="M6 14.6c1-1.4 2.4-2.1 4-2.1s3 .7 4 2.1" /></>,
  check: <><circle cx="9" cy="9" r="5" /><path d="m13 13 3.5 3.5" /></>,
};
const Icon = ({ name }: { name: string }) => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[name]}</svg>;
const NAV: Array<[Tab, string, string]> = [["home", "Home", "/"], ["board", "Board", "/board"], ["markets", "Markets", "/markets"], ["following", "Following", "/following"], ["library", "Library", "/library"], ["account", "Account", "/settings"]];
export const CHECK_HREF = "/#ask";

export function Shell({ current, children }: { current: Tab; children: ReactNode }) {
  return (
    <main className="b-root b-app" data-testid="app-shell">
      <aside className="b-sidebar">
        <nav className="b-sidebar__in b-glass" aria-label="App">
          <Logo />
          <a className="b-btn b-btn-lg b-primary" href={CHECK_HREF} style={{ marginBottom: 10 }} data-testid="side-check">Check a bet<Arrow /></a>
          {NAV.map(([k, label, href]) => <a key={k} className="b-navi" href={href} aria-current={current === k ? "page" : undefined}><Icon name={k} />{label}</a>)}
        </nav>
      </aside>
      <header className="b-topbar"><Logo /><a className="b-btn b-panel-pill" href="/settings">Account</a></header>
      <div className="b-main">{children}</div>
      <nav className="b-tabbar b-glass" aria-label="App">
        {NAV.slice(0, 2).map(([k, label, href]) => <a key={k} href={href} aria-current={current === k ? "page" : undefined}><Icon name={k} />{label}</a>)}
        <a className="b-tab-read" href={CHECK_HREF} aria-label="Check a bet" data-testid="tab-check"><Icon name="check" /></a>
        {[NAV[2]!, NAV[3]!].map(([k, label, href]) => <a key={k} href={href} aria-current={current === k ? "page" : undefined}><Icon name={k} />{label}</a>)}
      </nav>
      <StageMotion />
    </main>
  );
}
