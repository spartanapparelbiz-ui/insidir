/* Account (/settings), on the homepage's stage: a headline computed from the plan and the next date, then panels for
 * Copy size, Pings, Location, Billing, Sign-in and Delete. Every change saves itself or with one button; signed-in only.
 * Billing is read from Whop on each visit: the plan, the next charge date and amount, Manage subscription (Whop's own
 * orders page, where they change their card or cancel). */
import { GET_CTA, TRIAL_ADJ } from "@/lib/copy";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ComingSoon } from "@/components/v2/ComingSoon";
import { LocationPill } from "@/components/v2/LocationPill";
import { isReady } from "@/lib/features";
import { unlockHref } from "@/components/app/links";
import { Frame } from "@/components/brand/app/Frame";
import { PingsLink } from "@/components/desk/Act";
import { Insight, Panel, Pill, Stage } from "@/components/system";
import { getViewer } from "@/lib/auth/viewer";
import { fetchMemberships, MANAGE_URL, type MembershipLite } from "@/lib/billing/whop";
import { PHOTOS } from "@/lib/brand/images";
import { getDb, hasDatabase } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { isPaid, PLANS, TRIAL } from "@/lib/plans";
import { eq } from "drizzle-orm";
import { COPY_SIZES, copySizeOf } from "@/lib/copies/size";
import { CANCEL_REASONS } from "@/lib/billing/cancel-reasons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account", robots: { index: false } };

const DAY = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const day = (ms: number): string => DAY.format(new Date(ms));
const BTN = "b-btn b-btn-lg b-ghost";

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
  const plan = PLANS[viewer.plan];
  const next = paid && m?.renewalPeriodEnd ? (user.cancelAtPeriodEnd ? ` Access ends ${day(m.renewalPeriodEnd)}.` : ` ${m.status === "trialing" ? "Trial ends" : "Next charge"} ${day(m.renewalPeriodEnd)}.`) : "";
  const lead = paid ? `Your account: ${plan.name}, ${"$"}${plan.price} a month.${next}` : "Your account.";

  return (
    <Frame member={paid} current="account" testid="account-page">
      <Stage bg={{ kind: "photo", photo: PHOTOS.hero, dark: 0.6, priority: true }} first testid="account-band" labelledBy="acct-h">
        <div className="b-head">
          <Insight id="acct-h" text={lead} fallback={["Account."]} size={52} />
          {notice ? <p className="b-sub" role="status">{notice}</p> : null}
          {cancelNote ? <p className="b-sub" role="alert">{cancelNote}</p> : null}
        </div>
        <div className="s-split">
          {paid ? (
            <Panel className="s-form">
              <h2 className="b-label">Copy size</h2>
              <form method="post" action="/api/settings" className="s-form" data-testid="copy-size" id="copy-size">
                <p className="b-small">The default amount on a copy ticket, and what My copies counts on each move. Insidir never places a bet for you.</p>
                <div className="s-opts" role="radiogroup" aria-label="Dollars per move">
                  {COPY_SIZES.map(v => <label key={v} className="s-opt"><input type="radio" name="copySize" value={v} defaultChecked={copySizeOf(s) === v} /> ${v} a move</label>)}
                </div>
                <div><button type="submit" className={BTN}>Save size</button></div>
              </form>
            </Panel>
          ) : null}

          <Panel className="s-form">
            <h2 className="b-label">Pings</h2>
            {!alertsReady ? (
              <div className="b-ctas"><ComingSoon feature="alerts_push" className={BTN}>Phone alerts</ComingSoon><ComingSoon feature="alerts_email" className={BTN}>Email alerts</ComingSoon></div>
            ) : paid ? (
              <>
                <p className="s-strong">{s.alertPush && devices ? `On for ${devices} ${devices === 1 ? "device" : "devices"}` : s.alertEmail ? "Email alerts on" : "Off"}{s.quietStart && s.quietEnd ? ` · quiet ${s.quietStart}–${s.quietEnd}` : ""}</p>
                <div className="b-ctas"><PingsLink /></div>
                <form method="post" action="/api/settings" className="s-form" data-testid="alert-settings">
                  <label className="s-form b-small">Email pings
                    <select name="alertEmail" defaultValue={s.alertEmail ? "on" : "off"} className="s-input"><option value="on">On</option><option value="off">Off</option></select>
                  </label>
                  <div className="s-split">
                    <label className="s-form b-small">Quiet from<input type="time" name="quietStart" defaultValue={s.quietStart ?? ""} className="s-input" /></label>
                    <label className="s-form b-small">Quiet until<input type="time" name="quietEnd" defaultValue={s.quietEnd ?? ""} className="s-input" /></label>
                  </div>
                  <div><button type="submit" className={BTN}>Save pings</button></div>
                </form>
              </>
            ) : <p className="b-small">Pings come with Insidir: within a minute of a $25K+ millionaire bet, or a new bet from a wallet you follow.</p>}
          </Panel>

          <Panel className="s-form">
            <h2 className="b-label">Location</h2>
            <p className="b-small">We only link you to apps that work where you are: in the US, Kalshi only. Every bet shows either way.</p>
            <LocationPill region={viewer.region} />
          </Panel>

          <Panel className="s-form" testid="billing">
            <h2 id="billing" className="b-label">Billing</h2>
            <dl className="s-kv">
              <div><dt className="b-small">Plan</dt><dd className="s-strong">{plan.name}{paid ? ` · $${plan.price}/mo` : ""}</dd></div>
              {paid ? (
                <div><dt className="b-small">{user.cancelAtPeriodEnd ? "Access ends" : m?.status === "trialing" ? `Your ${TRIAL_ADJ} trial ends` : "Next charge"}</dt>
                  <dd className="s-strong">{m?.renewalPeriodEnd ? <>{day(m.renewalPeriodEnd)}{!user.cancelAtPeriodEnd && m.renewalPrice ? <span className="b-small"> · {m.status === "trialing" ? `then ${m.renewalPrice} unless you cancel` : m.renewalPrice}</span> : null}</>
                    : mem === "error" ? <span className="b-small">Couldn&apos;t load it now. Manage subscription shows it.</span> : <span className="b-small">Shown in Manage subscription</span>}</dd></div>
              ) : null}
            </dl>
            {paid ? (
              <>
                {user.cancelAtPeriodEnd ? <p className="b-small" data-testid="cancels-on">Cancels on {m?.renewalPeriodEnd ? day(m.renewalPeriodEnd) : "the end of this billing period"}. You keep access until then.</p> : null}
                <div className="b-ctas">
                  <a className={BTN} href={MANAGE_URL} target="_blank" rel="noopener noreferrer" data-testid="manage-subscription">Manage subscription</a>
                  {viewer.plan === "insidir" ? <a className={BTN} href={unlockHref()} data-unlock="settings-pro">Go Pro</a> : null}
                </div>
                <p className="b-small">Your subscription is with Whop: change your card on your Whop orders page. If you cancel, you keep access until {m?.renewalPeriodEnd ? day(m.renewalPeriodEnd) : "the end of the period you paid for"}.</p>
                {!user.cancelAtPeriodEnd ? (
                  <details className="s-details" open={Boolean(cancelNote)}>
                    <summary className="s-link">Cancel subscription</summary>
                    <form method="post" action="/api/billing/cancel" className="s-form" data-testid="cancel-form">
                      <fieldset className="s-opts">
                        <legend className="b-small">Why are you cancelling? Pick one.</legend>
                        {CANCEL_REASONS.map(([k, label]) => <label key={k} className="s-opt"><input type="radio" name="reason" value={k} required /> {label}</label>)}
                      </fieldset>
                      <label className="s-form b-small">Anything to add? (optional)<textarea name="detail" maxLength={500} rows={2} className="s-input" /></label>
                      <div><button type="submit" className={BTN}>Cancel at the end of this period</button></div>
                    </form>
                  </details>
                ) : null}
              </>
            ) : (
              <>
                <p className="b-small">Start for ${TRIAL.fee}: every millionaire bet live, the copy ticket, wallets to follow, and pings.</p>
                <div className="b-ctas"><Pill href="/go" data-checkout="settings">{GET_CTA}</Pill></div>
              </>
            )}
          </Panel>

          <Panel className="s-form">
            <h2 className="b-label">Sign-in</h2>
            <dl className="s-kv"><div><dt className="b-small">Email</dt><dd className="s-strong">{user.email ?? "Not set yet"}</dd></div></dl>
            <form method="post" action="/auth/logout"><button type="submit" className={BTN}>Sign out</button></form>
          </Panel>

          <Panel className="s-form">
            <h2 id="delete" className="b-label">Delete account</h2>
            <p className="b-small">Removes your account, follows, pings and checked bets from Insidir right away. It doesn&apos;t cancel your membership: {paid ? <>cancel it first on your <a className="s-link" href={MANAGE_URL} target="_blank" rel="noopener noreferrer">Whop orders page</a>.</> : "you have none."}</p>
            <form method="post" action="/auth/delete" className="s-form" data-testid="delete-account">
              <label className="b-small" htmlFor="confirm-delete">Type DELETE to confirm</label>
              <input id="confirm-delete" className="s-input" name="confirm" autoComplete="off" required pattern="DELETE" aria-invalid={confirmDelete || undefined} />
              {confirmDelete ? <p className="b-small" role="alert">Type DELETE in capitals to delete your account.</p> : null}
              <div><button type="submit" className={BTN}>Delete account</button></div>
            </form>
          </Panel>
        </div>
        <p className="b-small b-center">Information, not advice. Insidir never places a bet or holds money.</p>
      </Stage>
    </Frame>
  );
}
