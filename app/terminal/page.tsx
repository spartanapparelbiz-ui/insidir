/* The Terminal: the ranked deals table. Members land here; anyone can open it and see the free, 30-minute-delayed
 * top 3 (value before asking). Rows arrive redacted from lib/feed.ts (paid rows with their 30-minute sparklines);
 * the live pipe keeps them current. Today's totals and the free plan's "closed before you could see them" count are
 * computed here from real rows. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Beacons } from "@/components/app/Beacons";
import { LiveFeed } from "@/components/app/LiveFeed";
import { Onboarding } from "@/components/app/Onboarding";
import { unlockHref, vapidPublicKey } from "@/components/app/links";
import { SiteHeader } from "@/components/SiteHeader";
import { AB_COOKIE, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { feedViewer, getViewer } from "@/lib/auth/viewer";
import { feedFor } from "@/lib/feed";
import { entitlements, isPaid } from "@/lib/plans";
import { receiptRows, storedOpps } from "@/lib/queries";
import { missedToday, todayTotals, withSparks } from "@/lib/terminal-data";
import { outsideDelay, startOfTodayUTC, visibleReceipts } from "@/components/landing/model";
import { UNLOCK } from "@/lib/copy";
import { allowedVenues } from "@/lib/region";
import { liveStats } from "@/lib/live/stats";
import { dataStatus } from "@/lib/status";
import "../app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terminal", description: "Live prediction-market deals found by math: prices on Polymarket and Kalshi that lock in a profit after fees if both sides fill and both markets settle the same way." };

export default async function TerminalPage() {
  const now = Date.now();
  const viewer = await getViewer();
  const jar = await cookies();
  const ent = entitlements(viewer.plan);
  const delayMs = ent.feedDelayMinutes * 60_000;
  const [opps, status, stats, month] = await Promise.all([storedOpps(), dataStatus(now), liveStats(viewer.region, delayMs, now), receiptRows(2)]);
  const fv = feedViewer(viewer);
  const paid = isPaid(viewer.plan);
  const base = feedFor(opps, fv, now);
  const rows = paid ? await withSparks(base, opps, now) : base;
  await recordEvent({ name: "feed_view", visitorId: jar.get(VISITOR_COOKIE)?.value ?? null, userId: viewer.user?.id ?? null, variant: jar.get(AB_COOKIE)?.value ?? null })
    .catch(() => undefined);

  // Today's totals on the viewer's clock (free: 30 minutes late), cut to their region.
  const clock = now - delayMs;
  const todayStart = startOfTodayUTC(clock);
  const log = outsideDelay(visibleReceipts(month, viewer.region), ent, now);
  const totals = todayTotals(log, todayStart, clock);
  const missed = paid ? 0 : missedToday(opps, viewer.region, delayMs, startOfTodayUTC(now), now);

  const unlock = unlockHref("insidir");
  const user = viewer.user;
  const filtered = Boolean(user && (fv.minRoi > 0 || fv.minSizeUsd > 0 || fv.categories.length));
  return (
    <>
      <SiteHeader signedIn={Boolean(user)} current="/terminal" />
      <main className="wrap app term-page">
        <Beacons where="terminal" />
        {!user && !viewer.region ? (
          <form className="lineform" method="post" action="/api/region">
            <input type="hidden" name="next" value="/terminal" />
            <span className="lineform__q">Where are you? We only show apps you can use.</span>
            <button className="btn btn--secondary lineform__btn" name="region" value="us">In the US</button>
            <button className="btn btn--secondary lineform__btn" name="region" value="non_us">Outside the US</button>
          </form>
        ) : null}
        <LiveFeed initialRows={rows} initialNow={now} initialStatus={status} plan={viewer.plan} maxRows={ent.maxRows} unlockHref={unlock} unlockLabel={UNLOCK}
          venues={allowedVenues(viewer.region, fv.venues)} medianGapMin={stats.medianGapMin} soundOnGreen={Boolean(user?.settings.soundOnGreen)}
          totals={totals} missedToday={missed} todayStart={todayStart} filtered={filtered} />
        {user && !user.onboarded ? (
          <Onboarding paid={paid} vapidKey={vapidPublicKey()} email={user.email} unlockHref={unlock}
            initial={{ categories: user.settings.categories, minRoiPct: Math.round(user.settings.minRoi * 10_000) / 100, minSizeUsd: user.settings.minSizeUsd,
              emailDigest: user.settings.emailDigest, alertEmail: user.settings.alertEmail }} />
        ) : null}
      </main>
    </>
  );
}
