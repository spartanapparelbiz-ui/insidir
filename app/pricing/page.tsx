/* Pricing: one plan, Insidir: 7 days for $1, then $39/month, cancel anytime. The header band, the plan card (everything that's live, then
 * what's coming soon), three plain promises, where the data comes from, then billing questions. The button opens the
 * checkout embedded on /start; billing is Whop's. */
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
import { PlanPromises, PricingCards } from "@/components/v2/Pricing";
import { getViewer } from "@/lib/auth/viewer";
import { CANCEL_LINE, GET_CTA } from "@/lib/copy";
import { PLANS, isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing", description: `Try Insidir 7 days for $1, then $${PLANS.insidir.price}/month for everything: every big move live, trader records, follows and alerts. Cancel anytime.` };

export default async function PricingPage() {
  const viewer = await getViewer();
  const href = unlockHref();
  const trust = hasDatabase() ? await memo("trust", 60_000, () => trustFacts(getDb())).catch(() => null) : null;
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/pricing" trialHref={href} />
      <main className="dark mkt">
        <PageBand n={BAND.pricing} title="7 days for $1. Then $39 a month." kicker="Pricing">
          <p className="pband__sub">Everything Insidir does, live. {CANCEL_LINE}</p>
        </PageBand>
        <PricingCards current={viewer.plan} signedIn={Boolean(viewer.user)} href={href} title={null} />
        <PlanPromises />
        <TrustBlock facts={trust} />
        <FaqV2 title="Billing questions" items={FAQ_PRICING} />
        {isPaid(viewer.plan) ? null : (
          <section className="sec2 mkt__end">
            <div className="wrap mkt__endIn">
              <h2 className="sec2__h">Follow the big money.</h2>
              <div className="mkt__ctas"><Link className="btn btn--secondary btn--big" href={href} data-checkout="pricing-end">{GET_CTA}</Link></div>
              <p className="mkt__fine">{CANCEL_LINE}</p>
            </div>
          </section>
        )}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2(FAQ_PRICING) }} />
      </main>
    </>
  );
}
