/* Every question in one place (/faq): what Insidir is, the data, alerts, billing. */
import type { Metadata } from "next";
import Link from "next/link";
import { PageHead, Sec } from "@/components/page/Page";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { FAQ_ALL, FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { getViewer } from "@/lib/auth/viewer";
import { SUPPORT_EMAIL } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "FAQ", description: "What Insidir is, where the data comes from, how alerts work, and how billing and cancelling work." };

export default async function FaqPage() {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/faq" trialHref={unlockHref()} />
      <main className="lp3 pgpage">
        <PageHead kicker="FAQ" title="Questions" sub={<>Short, honest answers. Anything else: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</>} />
        <FaqV2 title="Everything people ask" items={FAQ_ALL} />
        <Sec id="end-h" title="See it for yourself.">
          <div className="mkt__ctas"><Link className="btn btn--primary" href="/start">Start for $1</Link><Link className="btn btn--secondary" href="/methodology">Methodology</Link></div>
        </Sec>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2(FAQ_ALL) }} />
      </main>
    </>
  );
}
