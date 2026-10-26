/* Price gaps (docs/V2.md §6, Pro only): the existing price-gap scanner, restyled. Pro members get the live table;
 * everyone else sees the free preview (30 minutes late, top 3, sizes hidden) under an upgrade card. While the
 * scanner isn't ready on production the route is the Coming soon page. Rows arrive redacted from lib/feed.ts (paid rows with their 30-minute sparklines);
 * the live pipe keeps them current. Today's totals and the free plan's "closed before you could see them" count are
 * computed here from real rows. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LiveFeed } from "@/components/app/LiveFeed";
import { unlockHref } from "@/components/app/links";
import { SiteHeader } from "@/components/SiteHeader";
import { ComingSoonPage } from "@/components/v2/ComingSoonPage";
import { isReady } from "@/lib/features";
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
export const metadata: Metadata = { title: "Price gaps", description: "Live prediction-market deals found by math: prices on Polymarket and Kalshi that lock in a profit after fees if both sides fill and both markets settle the same way." };

export default async function GapsPage() {
  const now = Date.now();
  const real = await getViewer();
  if (!isReady("price_gaps")) {
    return <ComingSoonPage feature="price_gaps" title="Price gaps" signedIn={Boolean(real.user)} plan={real.plan}
      text="Sometimes Kalshi and Polymarket price the same event differently. Price gaps will show those, with the math, for Pro members." />;
  }
  // Pro sees the live table; everyone else gets the free preview.
  const viewer = real.plan === "pro" ? real : { ...real, plan: "free" as const };
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
      <SiteHeader signedIn={Boolean(user)} plan={real.plan} current="/gaps" />
      <main className="wrap app term-page">
        {real.plan !== "pro" ? (
          <aside className="upsell">
            <p className="upsell__text">Price gaps are part of Pro. This is a preview: 30 minutes late, top 3, sizes hidden.</p>
            <a className="btn btn--primary" href={unlockHref("pro")} data-unlock="gaps">Go Pro</a>
          </aside>
        ) : null}
        <LiveFeed initialRows={rows} initialNow={now} initialStatus={status} plan={viewer.plan} maxRows={ent.maxRows} unlockHref={unlock} unlockLabel={UNLOCK}
          venues={allowedVenues(viewer.region, fv.venues)} medianGapMin={stats.medianGapMin} soundOnGreen={Boolean(user?.settings.soundOnGreen)}
          totals={totals} missedToday={missed} todayStart={todayStart} filtered={filtered} tips={!(user && !user.onboarded)}
          alertsOn={Boolean(user && (user.settings.alertPush || user.settings.alertEmail))} />
      </main>
    </>
  );
}
