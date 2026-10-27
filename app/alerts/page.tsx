/* Alerts (docs/INSIDIR-V2.md §7): push and email for moves by followed traders and $50k+ moves in followed markets, quiet
 * hours, the 8am ET daily email, Pro custom rules, a test alert, and the last 20 alerts actually sent. Signed-in
 * only; alerts come with Insidir, so free members see what they'd get and one way to get it. */
import { ComingSoonPage } from "@/components/v2/ComingSoonPage";
import { isReady } from "@/lib/features";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockButton } from "@/components/lock/Lock";
import { AlertsForm } from "@/components/account/AlertsForm";
import { unlockHref, vapidPublicKey } from "@/components/app/links";
import { SiteHeader } from "@/components/SiteHeader";
import { alertHistory } from "@/lib/alerts/history";
import { getViewer } from "@/lib/auth/viewer";
import { movePlan } from "@/lib/moves/gate";
import "../app.css";
import "../account.css";
import { PageBand } from "@/components/PageBand";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alerts", robots: { index: false } };

const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

export default async function AlertsPage() {
  const viewer = await getViewer();
  const ready = { push: isReady("alerts_push"), email: isReady("alerts_email"), daily: isReady("daily_email"), rules: isReady("custom_rules") };
  if (!ready.push && !ready.email) {
    return <ComingSoonPage feature="alerts_push" title="Alerts" band={BAND.alerts} current="/alerts" signedIn={Boolean(viewer.user)} plan={viewer.plan} text="Follow traders and markets, and we will ping your phone or email the moment they make a big move." />;
  }
  const user = viewer.user;
  if (!user) redirect("/auth/login?next=/alerts");

  if (!movePlan(viewer.plan).alerts) {
    return (
      <>
        <SiteHeader plan={viewer.plan} signedIn current="/alerts" />
        <main className="wrap app acct dark">
          <PageBand n={BAND.alerts} title="Alerts" />
          <section className="agroup">
            <div className="agroup__body">
              <p className="asum">Alerts come with Insidir.</p>
              <ul className="alist">
                <li>A ping the moment a trader you follow makes a move.</li>
                <li>Every $50,000+ move in a market you follow.</li>
                <li>Quiet hours, so nothing wakes you up.</li>
              </ul>
              <div className="row-gap"><LockButton where="alerts" className="btn btn--primary">Turn on alerts</LockButton></div>
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
      <main className="wrap app acct dark">
        <PageBand n={BAND.alerts} title="Alerts" />
        <p className="asum asum--lead">We ping you the moment a trader or market you follow makes a big move.</p>
        <AlertsForm settings={user.settings} vapidKey={vapidPublicKey()} email={user.email} pro={viewer.plan === "pro"} proHref={unlockHref("pro", "/alerts")} ready={ready} />

        <section className="agroup" aria-labelledby="a-history">
          <h2 id="a-history" className="agroup__h">Last 20 alerts</h2>
          <div className="agroup__body">
            {history === null ? <p className="afield__err" role="alert">Couldn&apos;t load your alert history just now. Reload the page to try again.</p>
              : history.length ? (
                <div className="scroll-x">
                  <table className="atable">
                    <thead><tr><th scope="col">Sent (UTC)</th><th scope="col">Move</th><th scope="col">How</th></tr></thead>
                    <tbody>
                      {history.map(h => (
                        <tr key={h.key}>
                          <td className="tnum">{WHEN.format(new Date(h.sentAt))}</td>
                          <td><Link href={h.href}>{h.title ?? "A move we no longer have"}</Link></td>
                          <td>{h.channel === "push" ? "Push" : "Email"}{h.opened ? " · opened" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="aempty">
                  <p>No alerts yet. When someone you follow moves, it shows up here.</p>
                  <Link className="btn btn--secondary" href="/feed">See the live feed</Link>
                </div>
              )}
          </div>
        </section>
      </main>
    </>
  );
}
