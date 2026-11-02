/* Account (/settings): Alerts (a summary; the switches live on /alerts and /following), Location, Billing, Account. Every
 * change saves itself with a "Saved" confirmation; no Save button. Signed-in only. No bankroll.
 * Billing is read from Whop on each visit: the plan, the next charge date and amount, Manage subscription (Whop's own
 * orders page, where they change their card or cancel). */
import { GET_CTA, TRIAL_ADJ } from "@/lib/copy";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ComingSoon } from "@/components/v2/ComingSoon";
import { LocationPill } from "@/components/v2/LocationPill";
import { isReady } from "@/lib/features";
import { unlockHref } from "@/components/app/links";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";
import { fetchMemberships, MANAGE_URL, type MembershipLite } from "@/lib/billing/whop";
import { getDb, hasDatabase } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { isPaid, PLANS } from "@/lib/plans";
import { eq } from "drizzle-orm";
import { COPY_SIZES, copySizeOf } from "@/lib/copies/size";
import { CANCEL_REASONS } from "@/lib/billing/cancel-reasons";
import { Shell } from "@/components/sky/Shell";
import { PushButton } from "@/components/app/PushButton";
import { vapidPublicKey } from "@/lib/alerts/vapid";
import { BET_ON } from "@/lib/read/member";
import type { SessionUser } from "@/lib/auth/session";
import type { UserSettings } from "@/lib/db/schema";
import "../app.css";
import "../account.css";

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
  // Notices from the no-JS form fallbacks (saved).
  const cancelNote = q.cancel === "done" ? null : q.cancel === "reason" ? "Pick one reason to cancel." : q.cancel === "failed" ? "Whop didn't take the cancellation. Try again, or cancel on your Whop orders page." : q.cancel === "none" ? "We couldn't find your subscription. Cancel on your Whop orders page." : null;
  const notice = q.saved ? "Saved." : q.cancel === "done" ? "Cancelled. You keep access until the end of the period you paid for." : null;
  const confirmDelete = q.delete === "confirm";

  if (paid) return <MemberAccount user={user} m={m} memError={mem === "error"} notice={notice} cancelNote={cancelNote} confirmDelete={confirmDelete} />;

  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn current="/settings" />
      <main className="wrap app acct dark">
        <header className="phead"><h1 className="phead__h">Account</h1></header>
        {notice ? <p className="banner" role="status">{notice}</p> : null}
        {cancelNote ? <p className="banner banner--err" role="alert">{cancelNote}</p> : null}

        {paid ? (
          <section className="agroup" aria-labelledby="g-copy" id="copy-size">
            <h2 id="g-copy" className="agroup__h">Copy size</h2>
            <form method="post" action="/api/settings" className="agroup__body csize" data-testid="copy-size">
              <p className="asum">What My copies counts on each move from the winners you copy. Insidir never places a bet for you.</p>
              <div className="csize__opts" role="radiogroup" aria-label="Dollars per move">
                {COPY_SIZES.map(v => (
                  <label key={v} className="csize__opt"><input type="radio" name="copySize" value={v} defaultChecked={copySizeOf(s) === v} /> ${v} a move</label>
                ))}
              </div>
              <button type="submit" className="btn btn--secondary">Save size</button>
            </form>
          </section>
        ) : null}

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
            <p className="asum">We only link you to apps that work where you are. Every position shows either way.</p>
            <LocationPill region={viewer.region} />
          </div>
        </section>

        <section className="agroup" aria-labelledby="g-billing" id="billing">
          <h2 id="g-billing" className="agroup__h">Billing</h2>
          <div className="agroup__body">
            <dl className="akv">
              <div><dt>Plan</dt><dd>{PLANS[viewer.plan].name}{paid ? <span className="akv__sub"> · ${PLANS[viewer.plan].price}/mo</span> : null}</dd></div>
              {paid ? (
                <div><dt>{user.cancelAtPeriodEnd ? "Access ends" : m?.status === "trialing" ? `Your ${TRIAL_ADJ} trial ends` : "Next charge"}</dt>
                  <dd>{m?.renewalPeriodEnd ? <>{day(m.renewalPeriodEnd)}{!user.cancelAtPeriodEnd && m.renewalPrice ? <span className="akv__sub"> · {m.status === "trialing" ? `then ${m.renewalPrice} unless you cancel` : m.renewalPrice}</span> : null}</>
                    : mem === "error" ? <span className="akv__sub">Couldn&apos;t load it now. Manage subscription shows it.</span> : <span className="akv__sub">Shown in Manage subscription</span>}</dd></div>
              ) : null}
            </dl>
            {paid ? (
              <>
                {user.cancelAtPeriodEnd ? <p className="asum" data-testid="cancels-on">Cancels on {m?.renewalPeriodEnd ? day(m.renewalPeriodEnd) : "the end of this billing period"}. You keep access until then.</p> : null}
                <div className="row-gap">
                  <a className="btn btn--secondary" href={MANAGE_URL} target="_blank" rel="noopener noreferrer" data-testid="manage-subscription">Manage subscription</a>
                  {viewer.plan === "insidir" ? <a className="btn btn--ghost" href={unlockHref()} data-unlock="settings-pro">Go Pro</a> : null}
                </div>
                <p className="afield__hint">Your subscription is with Whop: change your card on your Whop orders page. If you cancel, you keep access until {m?.renewalPeriodEnd ? day(m.renewalPeriodEnd) : "the end of the period you paid for"}.</p>
                {!user.cancelAtPeriodEnd ? (
                  <details className="acancel" open={Boolean(cancelNote)}>
                    <summary>Cancel subscription</summary>
                    <form method="post" action="/api/billing/cancel" className="acancel__form" data-testid="cancel-form">
                      <fieldset>
                        <legend>Why are you cancelling? Pick one.</legend>
                        {CANCEL_REASONS.map(([k, label]) => <label key={k} className="acancel__opt"><input type="radio" name="reason" value={k} required /> {label}</label>)}
                      </fieldset>
                      <label className="acancel__detail">Anything to add? (optional)<textarea name="detail" maxLength={500} rows={2} className="input" /></label>
                      <button type="submit" className="btn btn--secondary">Cancel at the end of this period</button>
                    </form>
                  </details>
                ) : null}
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

        <section className="agroup" aria-labelledby="g-delete" id="delete">
          <h2 id="g-delete" className="agroup__h">Delete account</h2>
          <div className="agroup__body">
            <p className="asum">Removes your account, follows, alerts and checked bets from Insidir right away. It doesn&apos;t cancel your membership: {paid ? <>cancel it first on your <a href={MANAGE_URL} target="_blank" rel="noopener noreferrer">Whop orders page</a>.</> : "you have none."}</p>
            <form method="post" action="/auth/delete" className="adelete" data-testid="delete-account">
              <label className="afield__hint" htmlFor="confirm-delete">Type DELETE to confirm</label>
              <input id="confirm-delete" className="input" name="confirm" autoComplete="off" required pattern="DELETE" aria-invalid={confirmDelete || undefined} />
              {confirmDelete ? <p className="afield__hint" role="alert">Type DELETE in capitals to delete your account.</p> : null}
              <button type="submit" className="btn btn--secondary">Delete account</button>
            </form>
          </div>
        </section>
      </main>
    </>
  );
}

/** A member's Account, in the member frame: plan and next charge, Manage billing (Whop), copy size, push alerts on
 *  this device, their categories, sign out; Cancel asks for one reason; Delete asks for DELETE. */
function MemberAccount({ user, m, memError, notice, cancelNote, confirmDelete }: { user: SessionUser; m: MembershipLite | null; memError: boolean; notice: string | null; cancelNote: string | null; confirmDelete: boolean }) {
  const cats = BET_ON.filter(([k]) => (user.settings.betOn ?? []).includes(k)).map(([, label]) => label);
  const price = `$${PLANS.insidir.price}`;
  const s = user.settings as UserSettings;
  return (
    <Shell current="account" refresh={false}>
      <div className="skm-sec ska" data-testid="account">
        <h1 className="sk-h2">Account</h1>
        {notice ? <p className="ska-note" role="status">{notice}</p> : null}
        {cancelNote ? <p className="ska-note" role="alert">{cancelNote}</p> : null}

        <section className="sk-panel ska-box" aria-labelledby="a-plan" id="billing">
          <h2 id="a-plan">Plan</h2>
          <p className="ska-big">Insidir · {price}/month</p>
          {m?.renewalPeriodEnd ? (
            user.cancelAtPeriodEnd
              ? <p className="sk-muted" data-testid="cancels-on">Cancels on {day(m.renewalPeriodEnd)}. You keep access until then.</p>
              : m.status === "trialing"
                ? <p data-testid="next-charge">Your {TRIAL_ADJ} trial ends {day(m.renewalPeriodEnd)}, then {m.renewalPrice ?? `${price}.00 / month`} unless you cancel.</p>
                : <p data-testid="next-charge">Next charge: {m.renewalPrice ?? price} on {day(m.renewalPeriodEnd)}.</p>
          ) : <p className="sk-muted">{memError ? "Couldn't load the next charge now. Manage billing shows it." : "Manage billing shows your next charge."}</p>}
          <a className="sk-pill" href={MANAGE_URL} target="_blank" rel="noopener noreferrer" data-testid="manage-subscription">Manage billing</a>
        </section>

        <section className="sk-panel ska-box" aria-labelledby="a-copy" id="copy-size">
          <h2 id="a-copy">Copy size</h2>
          <form method="post" action="/api/settings" className="ska-form" data-testid="copy-size">
            <p className="sk-muted">What My copies counts on each move from the winners you copy. Insidir never places a bet for you.</p>
            <div role="radiogroup" aria-label="Dollars per move" className="sk-chips">
              {COPY_SIZES.map(v => <label key={v} className="ska-opt"><input type="radio" name="copySize" value={v} defaultChecked={copySizeOf(s) === v} /> ${v} a move</label>)}
            </div>
            <button type="submit" className="sk-pill">Save size</button>
          </form>
        </section>

        <section className="sk-panel ska-box" aria-labelledby="a-alerts">
          <h2 id="a-alerts">Alerts on this device</h2>
          <p className="sk-muted">A push alert when proven money moves on a market you&apos;ve read.</p>
          <PushButton vapidKey={vapidPublicKey()} />
        </section>

        <section className="sk-panel ska-box" aria-labelledby="a-cats">
          <h2 id="a-cats">Your categories</h2>
          {cats.length ? <p className="sk-chips">{cats.map(c => <span key={c} className="sk-chip">{c}</span>)}</p> : <p className="sk-muted">None picked yet: your home shows every category.</p>}
          <Link className="sk-pill" href="/onboarding?again=1">Edit categories</Link>
        </section>

        <section className="sk-panel ska-box" aria-labelledby="a-me">
          <h2 id="a-me">Signed in</h2>
          {user.email ? <p>{user.email}</p> : null}
          <form method="post" action="/auth/logout"><button type="submit" className="sk-pill">Sign out</button></form>
          {!user.cancelAtPeriodEnd ? (
            <details className="ska-cancel" open={Boolean(cancelNote)}>
              <summary>Cancel subscription</summary>
              <form method="post" action="/api/billing/cancel" className="ska-form" data-testid="cancel-form">
                <fieldset>
                  <legend>Why are you cancelling? Pick one.</legend>
                  {CANCEL_REASONS.map(([k, label]) => <label key={k} className="ska-opt"><input type="radio" name="reason" value={k} required /> {label}</label>)}
                </fieldset>
                <label className="ska-form">Anything to add? (optional)<textarea name="detail" maxLength={500} rows={2} /></label>
                <button type="submit" className="sk-pill">Cancel at the end of this period</button>
              </form>
              <p className="sk-meta">You keep access until {m?.renewalPeriodEnd ? day(m.renewalPeriodEnd) : "the end of the period you paid for"}.</p>
            </details>
          ) : null}
        </section>

        <details className="ska-cancel" id="delete" open={confirmDelete}>
          <summary>Delete account</summary>
          <p className="sk-muted">Removes your account and your Reads from Insidir right away. It doesn&apos;t cancel your membership: cancel it above first.</p>
          <form method="post" action="/auth/delete" className="ska-form" data-testid="delete-account">
            <label htmlFor="confirm-delete">Type DELETE to confirm</label>
            <input id="confirm-delete" name="confirm" autoComplete="off" required pattern="DELETE" aria-invalid={confirmDelete || undefined} />
            {confirmDelete ? <p role="alert">Type DELETE in capitals to delete your account.</p> : null}
            <button type="submit" className="sk-pill">Delete account</button>
          </form>
        </details>
      </div>
    </Shell>
  );
}
