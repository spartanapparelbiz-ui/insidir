/* The Terminal: the ranked feed. Members land here; anyone can open it and see the free, 30-minute-delayed top 3
 * (value before asking). Rows arrive redacted from lib/feed.ts; the live pipe (components/live/useLive.ts) keeps
 * them current in place. One compact line each for the region choice and the free plan, then the deals.
 * Simple view (the default) or Pro view, per the top bar's toggle. The first visit opens with "How it works". */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Beacons } from "@/components/app/Beacons";
import { IosInstallGuide } from "@/components/app/IosInstallGuide";
import { LiveFeed } from "@/components/app/LiveFeed";
import { Onboarding } from "@/components/app/Onboarding";
import { unlockHref, vapidPublicKey } from "@/components/app/links";
import { SiteHeader } from "@/components/SiteHeader";
import { exampleMath } from "@/components/landing/HowItWorks";
import { Explainer } from "@/components/simple/Explainer";
import { FirstVisit } from "@/components/simple/FirstVisit";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { feedViewer, getView, getViewer } from "@/lib/auth/viewer";
import { feedFor } from "@/lib/feed";
import { entitlements, isPaid, startText } from "@/lib/plans";
import { storedOpps } from "@/lib/queries";
import { allowedVenues } from "@/lib/region";
import { liveStats } from "@/lib/live/stats";
import { dataStatus } from "@/lib/status";
import { SEEN_COOKIE } from "@/lib/view";
import "../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Deals", description: "Live price gaps between Kalshi and Polymarket: buy both sides and keep the difference, after fees." };

export default async function TerminalPage() {
  const now = Date.now();
  const viewer = await getViewer();
  const jar = await cookies();
  const ent = entitlements(viewer.plan);
  const [opps, status, stats] = await Promise.all([storedOpps(), dataStatus(now), liveStats(viewer.region, ent.feedDelayMinutes * 60_000, now)]);
  const fv = feedViewer(viewer);
  const rows = feedFor(opps, fv, now);
  await recordEvent({ name: "feed_view", visitorId: jar.get(VISITOR_COOKIE)?.value ?? null, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null })
    .catch(() => undefined);

  const paid = isPaid(viewer.plan);
  const view = await getView(viewer);
  const firstVisit = !jar.get(SEEN_COOKIE);
  const unlock = unlockHref("insidir");
  const user = viewer.user;
  const filtered = Boolean(user && (fv.minRoi > 0 || fv.minSizeUsd > 0 || fv.categories.length));
  const empty = (paid
    ? "New deals show up here as soon as we find them."
    : "Free deals show up here 30 minutes after we find them. None are waiting right now. Members see every deal right away.")
    + (filtered ? " Your filters in Settings may hide some." : "");
  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(user)} current="/terminal" view={{ mode: view, next: "/terminal" }} />
      <main className="wrap wrap--wide app term">
        <Beacons where="terminal" />
        {firstVisit && view === "simple" ? <FirstVisit><Explainer m={exampleMath()} id="first-how-h" /></FirstVisit> : null}
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
            <p>Free plan: the top {ent.maxRows} deals, 30 minutes late.</p>
            <a className="btn btn--primary planline__btn" href={unlock} data-unlock="plan-banner">{startText("insidir")}</a>
          </div>
        ) : null}
        <IosInstallGuide />
        <LiveFeed initialRows={rows} initialNow={now} initialStatus={status} plan={viewer.plan} maxRows={ent.maxRows} unlockHref={unlock}
          venues={allowedVenues(viewer.region, fv.venues)} emptyText={empty} medianGapMin={stats.medianGapMin} soundOnGreen={Boolean(user?.settings.soundOnGreen)} view={view} />
        {user && !user.onboarded ? (
          <Onboarding paid={paid} vapidKey={vapidPublicKey()} email={user.email} unlockHref={unlock}
            initial={{ categories: user.settings.categories, minRoiPct: Math.round(user.settings.minRoi * 10_000) / 100, minSizeUsd: user.settings.minSizeUsd,
              emailDigest: user.settings.emailDigest, alertEmail: user.settings.alertEmail }} />
        ) : null}
      </main>
    </>
  );
}
