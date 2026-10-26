/* Pricing, and the checkout itself: /pricing?plan=insidir|pro opens that plan's Whop checkout right here, so the
 * buyer never leaves insidir.com (Checkout element; the sandbox and any load failure use POST /api/checkout).
 * Buying needs an account first, so a signed-out visitor goes through Sign in with Whop and comes back. */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckoutFallback, WhopCheckout } from "@/components/app/WhopCheckout";
import { SiteHeader } from "@/components/SiteHeader";
import { Beacons } from "@/components/landing/Beacons";
import { Faq } from "@/components/landing/Faq";
import { Pricing } from "@/components/landing/Pricing";
import { checkoutPath } from "@/components/app/links";
import { LANDING_CTA, REFUND_MIN_GREEN_PER_DAY, REFUND_WINDOW_DAYS, visibleReceipts } from "@/components/landing/model";
import { getViewer } from "@/lib/auth/viewer";
import { PLANS } from "@/lib/plans";
import { greenPerDay, receiptRows } from "@/lib/queries";
import { afterCheckoutUrl, planId, type PaidPlan } from "@/lib/whop/billing";
import { whopConfig } from "@/lib/whop/config";
import { CHECKOUT_CLOSED_TEXT, checkoutOpen } from "@/lib/status";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing", description: "Free, Insidir $39/mo and Insidir Pro $99/mo. Cancel anytime in one click." };

export default async function PricingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const want: PaidPlan | null = q.plan === "pro" ? "pro" : q.plan === "insidir" ? "insidir" : null;
  const now = Date.now();
  const [viewer, month, jar, open] = await Promise.all([getViewer(), receiptRows(REFUND_WINDOW_DAYS), cookies(), checkoutOpen(now).catch(() => false)]);
  if (want && !viewer.user) redirect(`/auth/login?next=${encodeURIComponent(`/pricing?plan=${want}`)}`);
  const refund = greenPerDay(visibleReceipts(month, viewer.region), REFUND_WINDOW_DAYS, now) >= REFUND_MIN_GREEN_PER_DAY;
  const user = viewer.user;
  const c = whopConfig();
  const has = want && (viewer.plan === want || viewer.plan === "pro");
  return (
    <>
      <SiteHeader plan={viewer.plan} signedIn={Boolean(user)} current="/pricing" />
      <main className="wrap lp">
        {want && user ? (
          <section className="sec checkout card" id="checkout" aria-labelledby="checkout-h">
            <h1 id="checkout-h" className="sec__h">{PLANS[want].name} · ${PLANS[want].price}/mo</h1>
            {has ? (
              <p>You already have {PLANS[viewer.plan].name}. <Link href="/terminal">Open the live Terminal</Link></p>
            ) : (
              <>
                <p className="muted small">{PLANS[want].tagline}. Cancel anytime in one click from Settings.</p>
                {q.checkout === "failed" ? <p className="banner banner--err" role="alert">Checkout couldn't start. Try again in a moment.</p> : null}
                {!open ? (
                  <p className="banner banner--err" role="status" data-testid="checkout-paused">{CHECKOUT_CLOSED_TEXT}. Live prices have been paused for a while; nothing is charged until they are back.</p>
                ) : c.embedCheckout && planId(want) ? (
                  <WhopCheckout planId={planId(want)} plan={want} customerId={user.id} buyerEmail={user.email} environment={c.env}
                    affiliateCode={jar.get("insidir_aff")?.value ?? null} returnUrl={afterCheckoutUrl()} />
                ) : (
                  <CheckoutFallback plan={want} />
                )}
                <p className="dim tiny">Payments are processed by Whop. {want === "insidir" ? <Link href={checkoutPath("pro")}>Want Pro instead?</Link> : null}</p>
              </>
            )}
          </section>
        ) : null}
        <Pricing current={viewer.plan} signedIn={Boolean(user)} insidirHref={checkoutPath("insidir")} proHref={checkoutPath("pro")}
          freeCta={LANDING_CTA} refund={refund} level={want ? 2 : 1} />
        <Faq ids={["what", "risk", "trade", "fees", "iphone", "cancel"]} />
      </main>
      <Beacons />
    </>
  );
}
