/* Pricing (docs/INSIDIR-V2.md §8), dark like the app it sells: the header band, the three plans (Insidir in the
 * middle, "Most popular"), three plain promises (cancel in one tap, Whop's checkout, real data), every plan side by
 * side, where the data comes from (the trust block), then billing questions. Unready features carry a "Soon" badge.
 * Billing is Whop's; the buttons go straight to Whop checkout. */
import type { Metadata } from "next";
import Link from "next/link";
import { PageBand } from "@/components/PageBand";
import { BAND } from "@/lib/photos";
import { TrustBlock } from "@/components/TrustBlock";
import { getDb, hasDatabase } from "@/lib/db";
import { trustFacts } from "@/lib/trust";
import { memo } from "@/lib/memo";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { FAQ_PRICING, FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { PlanCompare, PlanPromises, PricingCards } from "@/components/v2/Pricing";
import { getViewer } from "@/lib/auth/viewer";
import { PLANS, TRIAL } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing", description: `Free, or Insidir for $${TRIAL.price} for ${TRIAL.days} days, then $${PLANS.insidir.price}/mo. Insidir Pro $${PLANS.pro.price}/mo. Cancel anytime.` };

export default async function PricingPage() {
  const viewer = await getViewer();
  const trial = unlockHref("insidir");
  const trust = hasDatabase() ? await memo("trust", 60_000, () => trustFacts(getDb())).catch(() => null) : null;
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/pricing" trialHref={trial} />
      <main className="dark mkt">
        <PageBand n={BAND.pricing} title="Simple pricing" kicker="Pricing">
          <p className="pband__sub">Start free. See every move live for ${TRIAL.price}. Cancel in one tap.</p>
        </PageBand>
        <PricingCards current={viewer.plan} signedIn={Boolean(viewer.user)} insidirHref={trial} proHref={unlockHref("pro")} primary title={null} />
        <PlanPromises />
        <PlanCompare />
        <TrustBlock facts={trust} />
        <FaqV2 title="Billing questions" items={FAQ_PRICING} />
        <section className="sec2 mkt__end">
          <div className="wrap mkt__endIn">
            <h2 className="sec2__h">Still deciding?</h2>
            <p className="mkt__lead">Watch the free feed first. It&apos;s the same moves, 30 minutes late.</p>
            <div className="mkt__ctas"><a className="btn btn--primary" href={trial} data-checkout="pricing-end">Try it for ${TRIAL.price}</a><Link className="btn btn--secondary" href="/feed">See the free feed</Link></div>
          </div>
        </section>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2(FAQ_PRICING) }} />
      </main>
    </>
  );
}
