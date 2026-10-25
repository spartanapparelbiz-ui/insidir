import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { Beacons } from "@/components/landing/Beacons";
import { Faq } from "@/components/landing/Faq";
import { Pricing } from "@/components/landing/Pricing";
import { checkoutHref } from "@/components/landing/model";
import { getViewer } from "@/lib/auth/viewer";
import { checkoutUrl } from "@/lib/auth/whop";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing", description: "Free, Insidir $39/mo and Insidir Pro $99/mo. Cancel anytime in one click." };

export default async function PricingPage() {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(viewer.user)} current="/pricing" />
      <main className="wrap lp">
        <Pricing current={viewer.plan} signedIn={Boolean(viewer.user)} insidirHref={checkoutHref(checkoutUrl("insidir"))} proHref={checkoutHref(checkoutUrl("pro"))} level={1} />
        <Faq ids={["risk", "trade", "fees", "iphone", "cancel"]} />
      </main>
      <Beacons />
    </>
  );
}
