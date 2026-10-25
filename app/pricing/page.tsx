import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { Beacons } from "@/components/landing/Beacons";
import { Faq } from "@/components/landing/Faq";
import { Pricing } from "@/components/landing/Pricing";
import { checkoutHref, LANDING_CTA, REFUND_MIN_GREEN_PER_DAY, REFUND_WINDOW_DAYS, visibleReceipts } from "@/components/landing/model";
import { getViewer } from "@/lib/auth/viewer";
import { checkoutUrl } from "@/lib/auth/whop";
import { greenPerDay, receiptRows } from "@/lib/queries";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing", description: "Free, Insidir $39/mo and Insidir Pro $99/mo. Cancel anytime in one click." };

export default async function PricingPage() {
  const now = Date.now();
  const [viewer, month] = await Promise.all([getViewer(), receiptRows(REFUND_WINDOW_DAYS)]);
  const refund = greenPerDay(visibleReceipts(month, viewer.region), REFUND_WINDOW_DAYS, now) >= REFUND_MIN_GREEN_PER_DAY;
  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(viewer.user)} current="/pricing" />
      <main className="wrap lp">
        <Pricing current={viewer.plan} signedIn={Boolean(viewer.user)} insidirHref={checkoutHref(checkoutUrl("insidir"))} proHref={checkoutHref(checkoutUrl("pro"))}
          freeCta={LANDING_CTA} refund={refund} level={1} />
        <Faq ids={["what", "risk", "trade", "fees", "iphone", "cancel"]} />
      </main>
      <Beacons />
    </>
  );
}
