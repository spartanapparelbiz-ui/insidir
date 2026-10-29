/* Account (/settings): Alerts (a summary; the switches live on /alerts and /following), Location, Billing, Account. Every
 * change saves itself with a "Saved" confirmation; no Save button. Signed-in only. No bankroll.
 * Billing is read from Whop on each visit: the plan, the next charge date and amount, Manage billing (Whop's own
 * page) and one-click cancel (at the end of the period you paid for). */
import { GET_CTA } from "@/lib/copy";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CancelButton } from "@/components/account/AccountForms";
import { ComingSoon } from "@/components/v2/ComingSoon";
import { LocationPill } from "@/components/v2/LocationPill";
import { isReady } from "@/lib/features";
import { unlockHref } from "@/components/app/links";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";
import { fetchMemberships, type MembershipLite } from "@/lib/billing/whop";
import { getDb, hasDatabase } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { isPaid, PLANS } from "@/lib/plans";
import { eq } from "drizzle-orm";
import "../app.css";
import "../account.css";
import { PageBand } from "@/components/PageBand";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account", robots: { index: false } };

const DAY = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const day = (ms: number): string => DAY.format(new Date(ms));

async function membership(whopUserId: string | null, id: string | null): Promise<MembershipLite | null | "error"> {
  if (!id || !whopUserId) return null;
  try { return (await fetchMemberships(whopUserId)).find(m => m.id === id) ?? null; } catch { return "error"; }
}

async function deviceCount(userId: string): Promise<number> {
  if (!hasDatabase()) return 0;
  try { return (await getDb().select({ e: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))).length; } catch { return 0; }
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  const user = viewer.user;
  if (!user) redirect("/login?next=/settings");
  const q = await searchParams;
  const paid = isPaid(viewer.plan);
  const [mem, devices] = await Promise.all([paid ? membership(user.whopUserId, user.membershipId) : Promise.resolve(null), deviceCount(user.id)]);
  const m = mem === "error" ? null : mem;
  const s = user.settings;
  const alertsReady = isReady("alerts_push") || isReady("alerts_email");
  // Notices from the no-JS form fallbacks (cancel, saved).
  const notice = q.cancel === "done" ? "Subscription cancelled. You keep access until the end of this billing period."
    : q.cancel === "failed" ? "Couldn't reach our payment provider to cancel. Try again in a minute, or use Manage billing." : q.saved ? "Saved." : null;

  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn current="/settings" />
      <main className="wrap app acct dark">
        <PageBand n={BAND.account} title="Account" />
        {notice ? <p className="banner" role="status">{notice}</p> : null}

        <section className="agroup" aria-labelledby="g-alerts">
          <h2 id="g-alerts" className="agroup__h">Alerts</h2>
          <div className="agroup__body">
            {!alertsReady ? (
              <div className="soonrow">
                <ComingSoon feature="alerts_push" className="btn btn--secondary">Phone alerts</ComingSoon>
                <ComingSoon feature="alerts_email" className="btn btn--secondary">Email alerts</ComingSoon>
              </div>
            ) : paid ? (
              <>
                <p className="asum">{s.alertPush && devices ? `On for ${devices} ${devices === 1 ? "device" : "devices"}` : s.alertEmail ? "Email alerts on" : "Off"}
                  <span className="asum__sub">{s.quietStart && s.quietEnd ? ` · quiet ${s.quietStart}–${s.quietEnd}` : ""}</span></p>
                <Link className="btn btn--primary" href="/alerts">Alert settings</Link>
              </>
            ) : (
              <p className="asum">Alerts come with Insidir. An alert follows when a trader or market you follow has a new large position.</p>
            )}
          </div>
        </section>

        <section className="agroup" aria-labelledby="g-region">
          <h2 id="g-region" className="agroup__h">Location</h2>
          <div className="agroup__body">
            <p className="asum">We only link you to apps that work where you are. Every move shows either way.</p>
            <LocationPill region={viewer.region} />
          </div>
        </section>

        <section className="agroup" aria-labelledby="g-billing" id="billing">
          <h2 id="g-billing" className="agroup__h">Billing</h2>
          <div className="agroup__body">
            <dl className="akv">
              <div><dt>Plan</dt><dd>{PLANS[viewer.plan].name}{paid ? <span className="akv__sub"> · ${PLANS[viewer.plan].price}/mo</span> : null}</dd></div>
              {paid ? (
                <div><dt>{user.cancelAtPeriodEnd ? "Access ends" : m?.status === "trialing" ? "Your $1 week ends" : "Next charge"}</dt>
                  <dd>{m?.renewalPeriodEnd ? <>{day(m.renewalPeriodEnd)}{!user.cancelAtPeriodEnd && m.renewalPrice ? <span className="akv__sub"> · {m.status === "trialing" ? `then ${m.renewalPrice} unless you cancel` : m.renewalPrice}</span> : null}</>
                    : mem === "error" ? <span className="akv__sub">Couldn&apos;t load it now. Manage billing shows it.</span> : <span className="akv__sub">Shown in Manage billing</span>}</dd></div>
              ) : null}
            </dl>
            {paid ? (
              <>
                {user.cancelAtPeriodEnd ? <p className="asum" data-testid="cancels-on">Cancels on {m?.renewalPeriodEnd ? day(m.renewalPeriodEnd) : "the end of this billing period"}. You keep access until then.</p> : null}
                <div className="row-gap">
                  {user.manageUrl ? <a className="btn btn--secondary" href={user.manageUrl} target="_blank" rel="noopener noreferrer">Manage billing</a> : null}
                  {!user.cancelAtPeriodEnd ? <CancelButton /> : null}
                  {viewer.plan === "insidir" ? <a className="btn btn--ghost" href={unlockHref()} data-unlock="settings-pro">Go Pro</a> : null}
                </div>
                {!user.cancelAtPeriodEnd ? <p className="afield__hint">One tap, no forms. You keep access until {m?.renewalPeriodEnd ? day(m.renewalPeriodEnd) : "the end of the period you paid for"}. No refund for the current month.</p> : null}
              </>
            ) : (
              <>
                <p className="asum">You see large positions 30 minutes late. Insidir shows every position live, with trader records and alerts.</p>
                <div className="row-gap"><a className="btn btn--primary" href={unlockHref()} data-unlock="settings-insidir">{GET_CTA}</a></div>
              </>
            )}
          </div>
        </section>

        <section className="agroup" aria-labelledby="g-account">
          <h2 id="g-account" className="agroup__h">Account</h2>
          <div className="agroup__body">
            <dl className="akv">
              <div><dt>Email</dt><dd>{user.email ?? <span className="akv__sub">None yet</span>}</dd></div>
            </dl>
            {viewer.plan === "insidir" ? (
              <div className="row-gap" aria-label="More tools">
                <Link className="btn btn--secondary" href="/whales">Whales</Link>
                <Link className="btn btn--secondary" href="/pnl">Your P&amp;L</Link>
              </div>
            ) : null}
            <form method="post" action="/auth/logout"><button type="submit" className="btn btn--secondary">Sign out</button></form>
          </div>
        </section>
      </main>
    </>
  );
}
