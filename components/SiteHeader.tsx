import Link from "next/link";
import type { ReactNode } from "react";
import type { Plan } from "@/lib/types";
import { Wordmark } from "./Wordmark";

/** Which top-level section a path belongs to (for the highlight): Whales, P&L and Settings live under Account. */
const SECTION: Record<string, string> = { "/settings": "/account", "/pnl": "/account", "/whales": "/account", "/alerts": "/alerts" };

/** The same top bar on every page: the logo (home), Terminal, Receipts, Pricing, then Log in or Account. The current
 *  section is highlighted. Signed-in members also get a bottom tab bar on phones (Terminal, Receipts, Alerts,
 *  Account), within thumb reach, every target 44px+. `status` is a small notice beside the logo (the landing page's
 *  scanner heartbeat). `plan` is kept for callers; the header itself is the same for every plan. */
export function SiteHeader({ signedIn, current, status }: { plan?: Plan; signedIn: boolean; current?: string; status?: ReactNode }) {
  const at = current ? (SECTION[current] ?? current) : undefined;
  const link = (href: string, label: string, section = href) => (
    <Link href={href} aria-current={at === section ? "page" : undefined}>{label}</Link>
  );
  return (
    <>
      <header className="hdr">
        <div className="wrap hdr__in">
          <Link className="wordmark" href="/" aria-label="Insidir home"><Wordmark /></Link>
          {status ?? null}
          <nav className="hdr__nav" aria-label="Main">
            {link("/terminal", "Terminal")}
            {link("/receipts", "Receipts")}
            {link("/pricing", "Pricing")}
            {signedIn ? link("/settings", "Account", "/account") : <Link className="hdr__login" href="/auth/login?next=/terminal" prefetch={false}>Log in</Link>}
          </nav>
        </div>
      </header>
      {signedIn ? (
        <nav className="tabbar" aria-label="App">
          {[["/terminal", "Terminal", "/terminal"], ["/receipts", "Receipts", "/receipts"], ["/alerts", "Alerts", "/alerts"], ["/settings", "Account", "/account"]].map(([href, label, section]) => (
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
    Terminal: "M3 5h18M3 12h18M3 19h18",
    Receipts: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
    Alerts: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
    Account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6",
  };
  return <svg className="tabbar__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={d[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
