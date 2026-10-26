/* Pricing (docs/INSIDIR-V2.md §8): a white page with the serif title and the three plans as clean cards (unready features
 * marked "(coming soon)" in the bullets), a thin photo band (photo 4), then the FAQ. Billing is Whop's; the buttons go
 * straight to Whop checkout. */
import type { Metadata } from "next";
import { Photo } from "@/components/Photo";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { FaqV2 } from "@/components/v2/Faq";
import { PricingCards } from "@/components/v2/Pricing";
import { getViewer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing", description: "Free, or Insidir for $1 for 3 days, then $39/mo. Insidir Pro $99/mo. Cancel anytime." };

export default async function PricingPage() {
  const viewer = await getViewer();
  const trial = unlockHref("insidir");
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/pricing" trialHref={trial} tone="light" />
      <main>
        <PricingCards current={viewer.plan} signedIn={Boolean(viewer.user)} insidirHref={trial} proHref={unlockHref("pro")} level={1} primary />
        <Photo n={4} className="band-photo" wideOnly />
        <FaqV2 />
      </main>
    </>
  );
}
