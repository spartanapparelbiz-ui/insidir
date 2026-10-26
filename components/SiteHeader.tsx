import Link from "next/link";
import type { Plan } from "@/lib/types";
import { Wordmark } from "./Wordmark";

/** The top bar. Signed-in members get the app's links (on a second row on phones, so nothing scrolls sideways);
 *  visitors get Log in. */
export function SiteHeader({ plan, signedIn, current }: { plan: Plan; signedIn: boolean; current?: string }) {
  const link = (href: string, label: string) => <Link href={href} aria-current={current === href ? "page" : undefined}>{label}</Link>;
  return (
    <header className="hdr">
      <div className="wrap hdr__in">
        <Link className="wordmark" href={signedIn ? "/terminal" : "/"} aria-label="Insidir home"><Wordmark /></Link>
        <nav className={signedIn ? "hdr__nav hdr__nav--app" : "hdr__nav"} aria-label="Main">
          {link("/terminal", "Terminal")}
          {link("/receipts", "Receipts")}
          {plan === "pro" ? link("/whales", "Whales") : null}
          {plan === "pro" ? link("/pnl", "P&L") : null}
          {signedIn ? link("/settings", "Settings") : <Link href="/auth/login?next=/terminal" prefetch={false}>Log in</Link>}
        </nav>
      </div>
    </header>
  );
}
