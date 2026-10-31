/* Every question in one place (/faq): what Insidir is, the data, alerts, billing. */
import type { Metadata } from "next";
import Link from "next/link";
import { PageBand } from "@/components/PageBand";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { FAQ_ALL, FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { getViewer } from "@/lib/auth/viewer";
import { BAND } from "@/lib/photos";
import { SUPPORT_EMAIL } from "@/components/SiteFooter";
import { GET_CTA } from "@/lib/copy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "FAQ", description: "What Insidir is, where the data comes from, how alerts work, and how billing and cancelling work." };

export default async function FaqPage() {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/faq" trialHref={unlockHref()} />
      <main className="dark mkt">
        <PageBand n={BAND.faq} title="Questions" kicker="FAQ">
          <p className="pband__sub">Short, honest answers. Anything else: <a className="pband__link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
        </PageBand>
        <FaqV2 title="Everything people ask" items={FAQ_ALL} />
        <section className="sec2">
          <div className="wrap mkt__endIn">
            <h2 className="sec2__h">See it for yourself.</h2>
            <div className="mkt__ctas"><Link className="btn btn--primary" href="/start">{GET_CTA}</Link><Link className="btn btn--secondary" href="/methodology">Methodology</Link></div>
          </div>
        </section>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2(FAQ_ALL) }} />
      </main>
    </>
  );
}
