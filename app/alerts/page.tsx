/* Alerts: turn them on for this device, choose what sends one (return, safety lights, categories), quiet hours,
 * a test alert, and the last 20 alerts actually sent. Signed-in only; alerts are a paid feature, so free members
 * see what they'd get and one way to get it. */
import { ComingSoonPage } from "@/components/v2/ComingSoonPage";
import { isReady } from "@/lib/features";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertsForm } from "@/components/account/AlertsForm";
import { unlockHref, vapidPublicKey } from "@/components/app/links";
import { SiteHeader } from "@/components/SiteHeader";
import { alertHistory } from "@/lib/alerts/history";
import { getViewer } from "@/lib/auth/viewer";
import { OPEN_TERMINAL, UNLOCK } from "@/lib/copy";
import { entitlements, PLANS } from "@/lib/plans";
import "../app.css";
import "../account.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alerts", robots: { index: false } };

const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

export default async function AlertsPage() {
  const viewer = await getViewer();
  if (!isReady("alerts_push")) {
    return <ComingSoonPage feature="alerts_push" title="Alerts" signedIn={Boolean(viewer.user)} plan={viewer.plan} text="Follow traders and markets, and we will ping your phone or email the moment they make a big move." />;
  }
  const user = viewer.user;
  if (!user) redirect("/auth/login?next=/alerts");
  const delay = entitlements(viewer.plan).alertDelaySeconds;

  if (delay === null) {
    return (
      <>
        <SiteHeader plan={viewer.plan} signedIn current="/alerts" />
        <main className="wrap app acct">
          <h1 className="page__h">Alerts</h1>
          <section className="agroup">
            <div className="agroup__body">
              <p className="asum">Alerts come with Insidir.</p>
              <ul className="alist">
                <li>A push to your phone the moment a deal shows up (within {PLANS.insidir.entitlements.alertDelaySeconds} seconds; instant on Pro).</li>
                <li>You choose the lowest return, the safety lights and the categories.</li>
                <li>Quiet hours, so nothing wakes you up.</li>
              </ul>
              <div className="row-gap"><a className="btn btn--primary" href={unlockHref("insidir", "/alerts")} data-unlock="alerts">{UNLOCK}</a></div>
            </div>
          </section>
        </main>
      </>
    );
  }

  const history = await alertHistory(user.id);
  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn current="/alerts" />
      <main className="wrap app acct">
        <h1 className="page__h">Alerts</h1>
        <p className="asum asum--lead">{viewer.plan === "pro" ? "Pro alerts go out the moment a deal is found." : `Insidir alerts go out within ${delay} seconds of a deal being found.`}</p>
        <AlertsForm settings={user.settings} vapidKey={vapidPublicKey()} email={user.email} />

        <section className="agroup" aria-labelledby="a-history">
          <h2 id="a-history" className="agroup__h">Last 20 alerts</h2>
          <div className="agroup__body">
            {history === null ? <p className="afield__err" role="alert">Couldn&apos;t load your alert history just now. Reload the page to try again.</p>
              : history.length ? (
                <div className="scroll-x">
                  <table className="atable">
                    <thead><tr><th scope="col">Sent (UTC)</th><th scope="col">Deal</th><th scope="col">How</th></tr></thead>
                    <tbody>
                      {history.map(h => (
                        <tr key={`${h.oppId}-${h.channel}`}>
                          <td className="mono">{WHEN.format(new Date(h.sentAt))}</td>
                          <td><Link href={`/deal/${encodeURIComponent(h.oppId)}`}>{h.title ?? "A deal that has since closed"}</Link></td>
                          <td>{h.channel === "push" ? "Push" : "Email"}{h.opened ? " · opened" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="aempty">
                  <p>No alerts yet. When a deal matches, it shows up here.</p>
                  <Link className="btn btn--secondary" href="/terminal">{OPEN_TERMINAL}</Link>
                </div>
              )}
          </div>
        </section>
      </main>
    </>
  );
}
