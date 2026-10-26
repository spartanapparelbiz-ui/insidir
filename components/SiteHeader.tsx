import Link from "next/link";
import type { ReactNode } from "react";
import type { Plan } from "@/lib/types";
import type { View } from "@/lib/view";
import { Wordmark } from "./Wordmark";

/** The "Pro view" switch: a plain form post to /api/view, so it works without JS and is remembered (lib/view.ts). */
function ViewToggle({ view, next }: { view: View; next: string }) {
  const pro = view === "pro";
  return (
    <form className="vt" method="post" action="/api/view">
      <input type="hidden" name="next" value={next} />
      <button className="vt__btn" name="view" value={pro ? "simple" : "pro"} role="switch" aria-checked={pro}>
        <span className="vt__track" aria-hidden="true"><span className="vt__knob" /></span>Pro view
      </button>
    </form>
  );
}

/** The top bar. Signed-in members get the app's links (on a second row on phones, so nothing scrolls sideways);
 *  visitors get Log in. `status` is a small notice beside the wordmark (the landing page's scanner heartbeat).
 *  `view`: pages that show deals pass the current view and their own path, and get the Pro view switch. */
export function SiteHeader({ plan, signedIn, current, status, view }: {
  plan: Plan; signedIn: boolean; current?: string; status?: ReactNode; view?: { mode: View; next: string };
}) {
  const link = (href: string, label: string) => <Link href={href} aria-current={current === href ? "page" : undefined}>{label}</Link>;
  return (
    <header className="hdr">
      <div className={`wrap hdr__in${view ? " hdr__in--vt" : ""}`}>
        <Link className="wordmark" href={signedIn ? "/terminal" : "/"} aria-label="Insidir home"><Wordmark /></Link>
        {status ?? null}
        {view ? <ViewToggle view={view.mode} next={view.next} /> : null}
        <nav className={signedIn || view ? "hdr__nav hdr__nav--app" : "hdr__nav"} aria-label="Main">
          {link("/terminal", "Deals")}
          {link("/receipts", "Past deals")}
          {plan === "pro" ? link("/whales", "Big bets") : null}
          {plan === "pro" ? link("/pnl", "My results") : null}
          {signedIn ? link("/settings", "Settings") : <Link href="/auth/login?next=/terminal" prefetch={false}>Log in</Link>}
        </nav>
      </div>
    </header>
  );
}
