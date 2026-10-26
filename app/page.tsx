/* The landing page. One goal: get visitors into the live feed; every CTA says LANDING_CTA and goes to /terminal
 * (only the pricing cards, after the value, offer checkout). Server-rendered with real numbers, then kept live by one
 * Server-Sent Events stream (components/live): the hero's prices tick, the scanner heartbeat and "open for" timer count
 * real time, today's count rolls up, the tape and toasts show real events. Everything runs on the viewer's clock:
 * free visitors see deals 30 minutes late, like the feed. A section without a real number is hidden, never filled.
 * Order: the split hero, the live strip, the Terminal, receipts, safety lights, pricing, FAQ, final CTA. */
import Link from "next/link";
import { cookies } from "next/headers";
import { after } from "next/server";
import { IosInstallGuide } from "@/components/app/IosInstallGuide";
import { SiteHeader } from "@/components/SiteHeader";
import { LiveProvider } from "@/components/live/LiveProvider";
import { Beacons } from "@/components/landing/Beacons";
import { FinalCta } from "@/components/landing/Cta";
import { Faq } from "@/components/landing/Faq";
import { Hero } from "@/components/landing/Hero";
import { LiveStrip } from "@/components/landing/LiveStrip";
import { Pricing } from "@/components/landing/Pricing";
import { FollowLine, ReceiptList } from "@/components/landing/Receipts";
import { SafetySection } from "@/components/landing/Safety";
import { Sticky } from "@/components/landing/Sticky";
import { TerminalPreview } from "@/components/landing/TerminalPreview";
import { Toasts } from "@/components/landing/Toasts";
import {
  checkoutHref, DAY_MS, followLine, HERO_SUB, heroSplit, LANDING_CTA, landingReceipts, liveHiddenCount, outsideDelay, publicFeedViewer,
  RECEIPTS_PUBLIC_DAYS, REFUND_MIN_GREEN_PER_DAY, REFUND_WINDOW_DAYS, startOfTodayUTC, visibleReceipts,
} from "@/components/landing/model";
import { AB_COOKIE, AB_TESTS, heroVariant, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { feedViewer, getViewer } from "@/lib/auth/viewer";
import { checkoutUrl } from "@/lib/auth/whop";
import { feedFor } from "@/lib/feed";
import { latestTick, recentFor } from "@/lib/live/queries";
import { liveStats } from "@/lib/live/stats";
import { entitlements, isPaid } from "@/lib/plans";
import { greenPerDay, leftOnTable, proofStats, receiptRows, storedOpps } from "@/lib/queries";
import { dataStatus } from "@/lib/status";
import "./landing.css";

export const dynamic = "force-dynamic";

const LANDING_RECEIPTS = 6;

export default async function Landing() {
  const now = Date.now();
  const [jar, viewer] = await Promise.all([cookies(), getViewer()]);
  const paid = isPaid(viewer.plan);
  const ent = entitlements(paid ? viewer.plan : "free");
  const delayMs = ent.feedDelayMinutes * 60_000;
  const fv = paid ? feedViewer(viewer) : publicFeedViewer(viewer.region);
  const [opps, month, status, stats, initialTape] = await Promise.all([
    storedOpps(), receiptRows(REFUND_WINDOW_DAYS), dataStatus(now), liveStats(viewer.region, delayMs, now), recentFor(fv, now),
  ]);

  const abRaw = jar.get(AB_COOKIE)?.value;
  const hero = AB_TESTS.hero[heroVariant(abRaw)];
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: abRaw ?? null }).catch(() => undefined));

  // The hero deal on the viewer's clock, with its latest real price as of that moment.
  let split = heroSplit(opps, viewer.region, delayMs, now);
  if (split) {
    const tick = await latestTick(split.oppId, now - delayMs);
    if (tick) split = { ...split, roi: tick.roi, legs: split.legs.map((l, i) => ({ ...l, priceCents: tick.legs[i] ? Math.round(tick.legs[i].avgPrice * 1000) / 10 : l.priceCents })) };
  }

  // Receipts on the viewer's clock, cut to the venues their region may see.
  const mine = visibleReceipts(month, viewer.region);
  const log = outsideDelay(mine.filter(r => r.detectedAt >= now - RECEIPTS_PUBLIC_DAYS * DAY_MS), ent, now);
  const todayStart = startOfTodayUTC(now - delayMs);
  const proof = proofStats(log, todayStart);
  const refund = greenPerDay(mine, REFUND_WINDOW_DAYS, now) >= REFUND_MIN_GREEN_PER_DAY;
  const recent = landingReceipts(log, LANDING_RECEIPTS);
  const insidir = checkoutHref(checkoutUrl("insidir"));
  const pro = checkoutHref(checkoutUrl("pro"));

  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(viewer.user)} current="/" />
      <main className="lp">
        <LiveProvider>
          <div className="wrap">
            <Hero split={split} delayMs={delayMs} medianLifeMin={stats.medianLifeMin} headline={hero.headline} sub={HERO_SUB} cta={LANDING_CTA}
              serverNow={now} scanner={{ live: status.live, lastScanAt: status.lastScanAt }} />
            <LiveStrip serverNow={now} initialTape={initialTape} stats={{
              foundToday: proof?.found ?? 0, biggestRoi: proof?.biggestRoi ?? null, medianRoi: proof?.medianRoi ?? null,
              left: leftOnTable(log, todayStart), flagged: stats.flagged, medianGapMin: stats.medianGapMin, todayStart,
            }} />
          </div>
          <Toasts serverNow={now} />
        </LiveProvider>
        <div className="wrap">
          <TerminalPreview rows={feedFor(opps, fv, now)} hidden={liveHiddenCount(opps, viewer.region, delayMs, now)} now={now} unlockHref={insidir} cta={LANDING_CTA} />
          {recent.length ? (
            <section className="sec" data-section="receipts" aria-labelledby="rcpt-h">
              <h2 id="rcpt-h" className="sec__h">Receipts</h2>
              <p className="sec__p">The last 7 days, as found and as they ended. Wins and misses.</p>
              <FollowLine res={followLine(log)} period="in the last 7 days" />
              <ReceiptList rows={recent} />
              <Link className="btn btn--secondary" href="/receipts">See every receipt</Link>
            </section>
          ) : null}
          <SafetySection />
          <Pricing current={viewer.plan} signedIn={Boolean(viewer.user)} insidirHref={insidir} proHref={pro} freeCta={LANDING_CTA} refund={refund} />
          <Faq />
          <IosInstallGuide />
          <FinalCta cta={LANDING_CTA} />
        </div>
      </main>
      <Sticky label={LANDING_CTA} href="/terminal" />
      <Beacons />
    </>
  );
}
