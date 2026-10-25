/* Settings: region, venues, filters, alerts (web push + email), plan with a one-click cancel, sign out.
 * Signed-in only. No bankroll. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Beacons } from "@/components/app/Beacons";
import { IosInstallGuide } from "@/components/app/IosInstallGuide";
import { unlockHref, vapidPublicKey } from "@/components/app/links";
import { SettingsForm } from "@/components/app/SettingsForm";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";
import { isPaid, PLANS } from "@/lib/plans";
import "../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  const user = viewer.user;
  if (!user) redirect("/auth/login?next=/settings");
  const q = await searchParams;
  const one = (k: string): string | null => { const v = q[k]; return typeof v === "string" ? v : null; };
  const paid = isPaid(viewer.plan);
  const notice = one("saved") ? "Saved." : one("cancel") === "done" ? "Your subscription is cancelled. You keep access until the end of the paid period."
    : one("cancel") === "failed" ? "Couldn't cancel right now. Try again, or use Manage on Whop below." : null;
  const error = one("error");

  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn current="/settings" />
      <main className="wrap app settings">
        <Beacons where="settings" />
        <h1 className="page__h">Settings</h1>
        {notice ? <p className="banner" role="status">{notice}</p> : null}
        {error ? <p className="banner banner--err" role="alert">{error.slice(0, 300)}</p> : null}
        <IosInstallGuide />

        <SettingsForm settings={user.settings} region={viewer.region} paid={paid} vapidKey={vapidPublicKey()} email={user.email} />

        <section className="card fs" aria-labelledby="plan-h">
          <h2 id="plan-h" className="fs__h">Plan</h2>
          <p className="plan__now"><span className="big">{PLANS[viewer.plan].name}</span>{paid ? <span className="muted"> · ${PLANS[viewer.plan].price}/mo</span> : null}</p>
          <p className="muted small">{PLANS[viewer.plan].tagline}</p>
          {user.cancelAtPeriodEnd ? <p className="notlive">Cancels at period end</p> : null}
          <div className="row-gap">
            {viewer.plan === "free" ? <a className="btn btn--primary" href={unlockHref("insidir", "/settings")} data-unlock="settings-insidir">Upgrade to Insidir · ${PLANS.insidir.price}/mo</a> : null}
            {viewer.plan !== "pro" ? <a className="btn btn--secondary" href={unlockHref("pro", "/settings")} data-unlock="settings-pro">Upgrade to Pro · ${PLANS.pro.price}/mo</a> : null}
            {viewer.plan === "pro" ? <Link className="btn btn--secondary" href="/pnl">Your P&amp;L</Link> : null}
            {user.manageUrl ? <a className="btn btn--ghost" href={user.manageUrl} target="_blank" rel="noopener noreferrer">Manage on Whop</a> : null}
          </div>
          {paid && !user.cancelAtPeriodEnd ? (
            <form method="post" action="/api/account/cancel" className="cancel">
              <button type="submit" className="btn btn--secondary btn--block">Cancel subscription</button>
              <p className="dim tiny">One click. You keep access until the end of the period you paid for.</p>
            </form>
          ) : null}
        </section>

        <form method="post" action="/auth/logout">
          <button type="submit" className="btn btn--ghost btn--block">Sign out</button>
        </form>
      </main>
    </>
  );
}
