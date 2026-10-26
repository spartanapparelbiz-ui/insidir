/* The Terminal: the ranked feed. Members land here; anyone can open it and see the free, 30-minute-delayed top 3
 * (value before asking). Rows arrive redacted from lib/feed.ts; the live pipe (components/live/useLive.ts) keeps
 * them current in place. One compact line each for the region choice and the free plan, then the deals. */
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
import { liveStats } from "@/lib/live/stats";
import { dataStatus } from "@/lib/status";
import "../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terminal", description: "Live prediction-market deals found by math: prices on Polymarket and Kalshi that lock in a profit after fees if both sides fill and both markets settle the same way." };

/** After checkout Whop sends the buyer to /terminal?welcome=1. Access is asked of Whop past the cache, and while the
 *  payment is still confirming the page reloads itself a few times (welcome=2, 3, …). */
const WELCOME_TRIES = 10;

export default async function TerminalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const now = Date.now();
  const q = await searchParams;
  const welcome = typeof q.welcome === "string" ? Math.max(1, Math.min(WELCOME_TRIES, Number(q.welcome) || 1)) : 0;
  const viewer = await getViewer(welcome > 0);
  const jar = await cookies();
  const ent = entitlements(viewer.plan);
  const [opps, status, stats] = await Promise.all([storedOpps(), dataStatus(now), liveStats(viewer.region, ent.feedDelayMinutes * 60_000, now)]);
  const fv = feedViewer(viewer);
  const rows = feedFor(opps, fv, now);
  await recordEvent({ name: "feed_view", visitorId: jar.get(VISITOR_COOKIE)?.value ?? null, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null })
    .catch(() => undefined);

  const paid = isPaid(viewer.plan);
  const unlock = unlockHref("insidir");
  const user = viewer.user;
  const filtered = Boolean(user && (fv.minRoi > 0 || fv.minSizeUsd > 0 || fv.categories.length));
  const empty = (paid
    ? "New deals show up here as the scanner finds them."
    : "The free feed shows deals 30 minutes after they're found, and none from the last day are waiting. Members see every deal as it happens.")
    + (filtered ? " Your filters in Settings may be hiding some." : "");
  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(user)} current="/terminal" />
      {welcome && !paid && welcome < WELCOME_TRIES ? <meta httpEquiv="refresh" content={`3;url=/terminal?welcome=${welcome + 1}`} /> : null}
      <main className="wrap wrap--wide app term">
        <Beacons where="terminal" />
        {welcome && paid ? <p className="banner banner--ok" role="status" data-testid="welcome">You&apos;re in. Here&apos;s what&apos;s live right now.</p> : null}
        {welcome && !paid && user ? (
          <p className="banner" role="status" data-testid="confirming">
            {welcome < WELCOME_TRIES ? "Confirming your payment with Whop…" : "Whop is still confirming your payment. Refresh in a minute; you won't be charged twice."}
          </p>
        ) : null}
        {!user && !viewer.region ? (
          <form className="lineform" method="post" action="/api/region">
            <input type="hidden" name="next" value="/terminal" />
            <span className="lineform__q">Where are you?</span>
            <button className="btn btn--secondary lineform__btn" name="region" value="us">In the US</button>
            <button className="btn btn--secondary lineform__btn" name="region" value="non_us">Outside the US</button>
          </form>
        ) : null}
        {!paid ? (
          <div className="planline">
            <p>Free plan. You see the top {ent.maxRows} deals, 30 minutes late.</p>
            <a className="btn btn--primary planline__btn" href={unlock} data-unlock="plan-banner">Start for ${PLANS.insidir.price}</a>
          </div>
        ) : null}
        <IosInstallGuide />
        <LiveFeed initialRows={rows} initialNow={now} initialStatus={status} plan={viewer.plan} maxRows={ent.maxRows} unlockHref={unlock}
          venues={allowedVenues(viewer.region, fv.venues)} emptyText={empty} medianGapMin={stats.medianGapMin} soundOnGreen={Boolean(user?.settings.soundOnGreen)} />
        {user && !user.onboarded ? (
          <Onboarding paid={paid} vapidKey={vapidPublicKey()} email={user.email} unlockHref={unlock}
            initial={{ categories: user.settings.categories, minRoiPct: Math.round(user.settings.minRoi * 10_000) / 100, minSizeUsd: user.settings.minSizeUsd,
              emailDigest: user.settings.emailDigest, alertEmail: user.settings.alertEmail }} />
        ) : null}
      </main>
    </>
  );
}
