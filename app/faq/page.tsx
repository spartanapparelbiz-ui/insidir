/* Every question in one place (/faq): what Insidir is, Kalshi, the data, pings, billing (lib/brand/copy.ts FAQ_ALL), on
 * the homepage's system. */
import type { Metadata } from "next";
import { TrustPage } from "@/components/TrustPage";
import { Faq } from "@/components/brand/Faq";
import { COMPANY } from "@/lib/copy";
import { FAQ_ALL } from "@/lib/brand/copy";

export const metadata: Metadata = { title: "FAQ", description: "What Insidir is, how Kalshi fits, where the data comes from, how pings work, and how billing and cancelling work." };

export default function FaqPage() {
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ_ALL.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  return (
    <TrustPage path="/faq" title="Questions" lead={<>Short, honest answers. Anything else: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.</>}>
      <Faq items={FAQ_ALL} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
    </TrustPage>
  );
}
