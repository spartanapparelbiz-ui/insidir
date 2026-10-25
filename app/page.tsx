/* The landing page. Server-rendered; every number on it comes from the database, and a section with no real
 * number is hidden rather than filled. Section order: hero, proof, how, preview, receipts, safety, pricing, faq,
 * final. The only client JS: the "found X ago" ticker and the funnel beacon. */
import Link from "next/link";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SiteHeader } from "@/components/SiteHeader";
import { Beacons } from "@/components/landing/Beacons";
import { FinalCta, StickyCta } from "@/components/landing/Cta";
import { Faq } from "@/components/landing/Faq";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { ProofStrip } from "@/components/landing/ProofStrip";
import { FollowLine, ReceiptList, TallyLine } from "@/components/landing/Receipts";
import { SafetySection } from "@/components/landing/Safety";
import { TerminalPreview } from "@/components/landing/TerminalPreview";
import {
  checkoutHref, followLine, landingReceipts, outsideDelay, PREVIEW_ROWS, publicFeedViewer, realCrossArb, RECEIPTS_PUBLIC_DAYS,
  startOfTodayUTC, tally, visibleReceipts,
} from "@/components/landing/model";
import { AB_COOKIE, AB_TESTS, heroVariant, recordEvent } from "@/lib/analytics";
import { getViewer } from "@/lib/auth/viewer";
import { VISITOR_COOKIE } from "@/lib/auth/session";
import { checkoutUrl } from "@/lib/auth/whop";
import { feedFor } from "@/lib/feed";
import { entitlements, isPaid } from "@/lib/plans";
import { proofStats, receiptRows, storedOpps } from "@/lib/queries";
import "./landing.css";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const now = Date.now();
  const [jar, viewer, opps, week] = await Promise.all([cookies(), getViewer(), storedOpps(), receiptRows(RECEIPTS_PUBLIC_DAYS)]);
  const abRaw = jar.get(AB_COOKIE)?.value;
  const variant = heroVariant(abRaw);
  const hero = AB_TESTS.hero[variant];
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null;
  after(() => recordEvent({ name: "landing_view", visitorId, userId: viewer.user?.id ?? null, variant: abRaw ?? null }).catch(() => undefined));

  const insidir = checkoutHref(checkoutUrl("insidir"));
  const pro = checkoutHref(checkoutUrl("pro"));
  const rows = feedFor(opps, publicFeedViewer(viewer.region), now);
  const paid = isPaid(viewer.plan);
  // The public log, on venues this visitor's region may see; a free viewer never sees a deal the delayed feed hides.
  const log = outsideDelay(visibleReceipts(week, viewer.region), entitlements(paid ? viewer.plan : "free"), now);
  const today = proofStats(visibleReceipts(week, viewer.region), startOfTodayUTC(now));
  const follow = followLine(log);
  const recent = landingReceipts(log);

  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(viewer.user)} current="/" />
      <main className="wrap lp">
        <Hero headline={hero.headline} cta={hero.cta} checkout={insidir} top={rows[0] ?? null} now={now} />
        <ProofStrip stats={today} />
        <HowItWorks real={realCrossArb(rows)} />
        <TerminalPreview rows={rows.slice(0, PREVIEW_ROWS)} now={now} unlockHref={insidir} />
        {recent.length ? (
          <section className="sec" data-section="receipts" aria-labelledby="rcpt-h">
            <h2 id="rcpt-h" className="sec__h">Receipts</h2>
            <p className="sec__p">Every deal we found in the last 7 days, as it looked when found, and how it settled. Wins and misses.</p>
            <FollowLine res={follow} period="in the last 7 days" />
            <TallyLine t={tally(log)} />
            <ReceiptList rows={recent} showSize={paid} />
            <Link className="btn btn--secondary" href="/receipts">See the full log</Link>
          </section>
        ) : null}
        <SafetySection />
        <Pricing current={viewer.plan} signedIn={Boolean(viewer.user)} insidirHref={insidir} proHref={pro} />
        <Faq />
        {/* MOUNT: components/app/IosInstallGuide.tsx (owned by the app agent) goes here, between the FAQ and the final CTA. */}
        <FinalCta checkout={insidir} />
      </main>
      <StickyCta checkout={insidir} />
      <Beacons />
    </>
  );
}
