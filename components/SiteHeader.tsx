import Link from "next/link";
import type { Plan } from "@/lib/types";
import { Wordmark } from "./Wordmark";

/** The top bar. Signed-in members get the app's links; visitors get Log in and the main CTA. */
export function SiteHeader({ plan, signedIn, current }: { plan: Plan; signedIn: boolean; current?: string }) {
  const link = (href: string, label: string) => <Link href={href} aria-current={current === href ? "page" : undefined}>{label}</Link>;
  return (
    <header className="hdr">
      <div className="wrap hdr__in">
        <Link className="wordmark" href={signedIn ? "/terminal" : "/"} aria-label="Insidir home"><Wordmark /></Link>
        <nav className="hdr__nav" aria-label="Main">
          {link("/terminal", "Terminal")}
          {link("/receipts", "Receipts")}
          {plan === "pro" ? link("/whales", "Whales") : null}
          {signedIn ? link("/settings", "Settings") : <Link href="/auth/login?next=/terminal">Log in</Link>}
        </nav>
      </div>
    </header>
  );
}
