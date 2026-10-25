/* The Terminal: the ranked feed. Members land here; anyone can open it and see the free, 30-minute-delayed top 3
 * (value before asking). Paid plans refresh live in place. Rows arrive redacted from lib/feed.ts. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Beacons } from "@/components/app/Beacons";
import { IosInstallGuide } from "@/components/app/IosInstallGuide";
import { LiveFeed } from "@/components/app/LiveFeed";
import { Onboarding } from "@/components/app/Onboarding";
import { unlockHref, vapidPublicKey } from "@/components/app/links";
import { SiteHeader } from "@/components/SiteHeader";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { feedViewer, getViewer } from "@/lib/auth/viewer";
import { feedFor } from "@/lib/feed";
import { entitlements, isPaid, PLANS } from "@/lib/plans";
import { storedOpps } from "@/lib/queries";
import { allowedVenues } from "@/lib/region";
import { dataStatus } from "@/lib/status";
import "../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terminal", description: "Live prediction-market deals found by math: prices on Polymarket and Kalshi that lock in a profit after fees if both sides fill and both markets settle the same way." };

/** Refresh interval per plan, ms. */
const POLL_MS = { free: 0, insidir: 5_000, pro: 2_000 } as const;

export default async function TerminalPage() {
  const now = Date.now();
  const viewer = await getViewer();
  const jar = await cookies();
  const [opps, status] = await Promise.all([storedOpps(), dataStatus(now)]);
  const fv = feedViewer(viewer);
  const rows = feedFor(opps, fv, now);
  await recordEvent({ name: "feed_view", visitorId: jar.get(VISITOR_COOKIE)?.value ?? null, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null })
    .catch(() => undefined);

  const paid = isPaid(viewer.plan);
  const unlock = unlockHref("insidir");
  const user = viewer.user;
  const filtered = Boolean(user && (fv.minRoi > 0 || fv.minSizeUsd > 0 || fv.categories.length));
  const empty = paid
    ? `The scanner checks the markets every few seconds; new deals show up here as they're found.${filtered ? " Your filters in Settings may be hiding some." : ""}`
    : `The free feed shows deals 30 minutes after they're found, and nothing from the last 24 hours is waiting.${filtered ? " Your filters in Settings may be hiding some." : ""}`;
  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(user)} current="/terminal" />
      <main className="wrap app">
        <Beacons where="terminal" />
        {!user && !viewer.region ? (
          <form className="regionbar" method="post" action="/api/region">
            <input type="hidden" name="next" value="/terminal" />
            <span className="muted small">Where are you?</span>
            <button className="btn btn--secondary regionbar__btn" name="region" value="us">In the US</button>
            <button className="btn btn--secondary regionbar__btn" name="region" value="non_us">Outside the US</button>
          </form>
        ) : null}
        {!paid ? (
          <div className="planbar">
            <span className="small"><b>Free</b> · 30 min delay · top {entitlements("free").maxRows}</span>
            <a className="btn btn--primary planbar__btn" href={unlock} data-unlock="plan-banner">Unlock</a>
          </div>
        ) : null}
        <IosInstallGuide />
        <LiveFeed initialRows={rows} initialNow={now} initialStatus={status} plan={viewer.plan} pollMs={POLL_MS[viewer.plan]} unlockHref={unlock}
          venues={allowedVenues(viewer.region, fv.venues)} emptyText={empty} />
        {user && !user.onboarded ? (
          <Onboarding paid={paid} vapidKey={vapidPublicKey()} email={user.email} unlockHref={unlock}
            initial={{ categories: user.settings.categories, minRoiPct: Math.round(user.settings.minRoi * 10_000) / 100, minSizeUsd: user.settings.minSizeUsd,
              emailDigest: user.settings.emailDigest, alertEmail: user.settings.alertEmail }} />
        ) : null}
      </main>
      {!paid ? (
        <div className="stickycta">
          <a className="btn btn--primary" href={unlock} data-unlock="sticky">Start for ${PLANS.insidir.price}</a>
        </div>
      ) : null}
    </>
  );
}
