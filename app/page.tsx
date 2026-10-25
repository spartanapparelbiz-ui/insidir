/* The landing page. One goal: get visitors into the free feed; every CTA says LANDING_CTA and goes to /terminal
 * (only the pricing cards, after the value, offer checkout). Server-rendered; every number comes from the
 * database, and a section without a real number is hidden rather than filled. Section order: hero, proof, how,
 * preview, receipts, safety, pricing, faq, final. Client JS: the "found X ago" ticker, the sticky bar and the
 * funnel beacon. */
import Link from "next/link";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SiteHeader } from "@/components/SiteHeader";
import { Beacons } from "@/components/landing/Beacons";
import { FinalCta } from "@/components/landing/Cta";
import { Faq } from "@/components/landing/Faq";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { ProofStrip } from "@/components/landing/ProofStrip";
import { FollowLine, ReceiptList, TallyLine } from "@/components/landing/Receipts";
import { SafetySection } from "@/components/landing/Safety";
import { Sticky } from "@/components/landing/Sticky";
import { TerminalPreview } from "@/components/landing/TerminalPreview";
import {
  checkoutHref, DAY_MS, followLine, LANDING_CTA, landingReceipts, outsideDelay, PREVIEW_ROWS, publicFeedViewer, RECEIPTS_PUBLIC_DAYS,
  REFUND_MIN_GREEN_PER_DAY, REFUND_WINDOW_DAYS, startOfTodayUTC, tally, visibleReceipts,
} from "@/components/landing/model";
import { AB_COOKIE, AB_TESTS, heroVariant, recordEvent } from "@/lib/analytics";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { checkoutUrl } from "@/lib/auth/whop";
import { feedFor } from "@/lib/feed";
import { entitlements, isPaid } from "@/lib/plans";
import { greenPerDay, heroDeal, leftOnTable, proofStats, receiptRows, storedOpps } from "@/lib/queries";
import { dataStatus } from "@/lib/status";
import "./landing.css";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const now = Date.now();
  const [jar, viewer, opps, month, status] = await Promise.all([cookies(), getViewer(), storedOpps(), receiptRows(REFUND_WINDOW_DAYS), dataStatus(now)]);
  const abRaw = jar.get(AB_COOKIE)?.value;
  const variant = heroVariant(abRaw);
  const hero = AB_TESTS.hero[variant];
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: abRaw ?? null }).catch(() => undefined));

  const paid = isPaid(viewer.plan);
  const ent = entitlements(paid ? viewer.plan : "free");
  const insidir = checkoutHref(checkoutUrl("insidir"));
  const pro = checkoutHref(checkoutUrl("pro"));
  const rows = feedFor(opps, publicFeedViewer(viewer.region), now);

  // The receipts log, cut to the venues this visitor's region may see (US / not chosen: never international
  // Polymarket). A free visitor never sees, anywhere on the page, a deal the delayed feed would still hide.
  const mine = visibleReceipts(month, viewer.region);
  const week = mine.filter(r => r.detectedAt >= now - RECEIPTS_PUBLIC_DAYS * DAY_MS);
  const log = outsideDelay(week, ent, now);
  const deal = heroDeal(outsideDelay(mine.filter(r => r.detectedAt >= now - DAY_MS), ent, now), now);
  const today = startOfTodayUTC(now);
  const stats = proofStats(week, today);
  const left = leftOnTable(week, today);
  const refund = greenPerDay(mine, REFUND_WINDOW_DAYS, now) >= REFUND_MIN_GREEN_PER_DAY;
  const follow = followLine(log);
  const recent = landingReceipts(log);

  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(viewer.user)} current="/" />
      <main className="wrap lp">
        <Hero headline={hero.headline} cta={LANDING_CTA} deal={deal} delayed={!paid} live={status.live} now={now} />
        <ProofStrip stats={stats} left={left} />
        <HowItWorks />
        <TerminalPreview rows={rows.slice(0, PREVIEW_ROWS)} now={now} unlockHref={insidir} cta={LANDING_CTA} />
        {recent.length ? (
          <section className="sec" data-section="receipts" aria-labelledby="rcpt-h">
            <h2 id="rcpt-h" className="sec__h">Receipts</h2>
            <p className="sec__p">Every deal we found in the last 7 days, how it looked when we found it, and how it ended. Wins and misses.</p>
            <FollowLine res={follow} period="in the last 7 days" />
            <TallyLine t={tally(log)} />
            <ReceiptList rows={recent} showSize={paid} />
            <Link className="btn btn--secondary" href="/receipts">See every receipt</Link>
          </section>
        ) : null}
        <SafetySection />
        <Pricing current={viewer.plan} signedIn={Boolean(viewer.user)} insidirHref={insidir} proHref={pro} freeCta={LANDING_CTA} refund={refund} />
        <Faq />
        {/* MOUNT: components/app/IosInstallGuide.tsx (owned by the app agent) goes here, between the FAQ and the final CTA. */}
        <FinalCta cta={LANDING_CTA} />
      </main>
      <Sticky label={LANDING_CTA} href="/terminal" />
      <Beacons />
    </>
  );
}
