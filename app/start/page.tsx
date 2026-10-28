/* Get Insidir (/start) = sign up: what you get on the left; on the right the email and password they'll log in with,
 * then Whop's checkout embedded below (components/auth/StartCheckout.tsx): card, Apple Pay where the device has it.
 * $39/month, cancel anytime. Paying makes the account; the buyer lands on "You're in." already logged in. Members go
 * straight to the feed. */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StartCheckout } from "@/components/auth/StartCheckout";
import { SiteHeader } from "@/components/SiteHeader";
import { FeatureList } from "@/components/v2/Pricing";
import { getViewer } from "@/lib/auth/viewer";
import { ELEMENTS_URL } from "@/lib/billing/whop";
import { CANCEL_LINE } from "@/lib/copy";
import { PLANS, isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get Insidir", description: `Insidir is $${PLANS.insidir.price}/month. Cancel anytime.`, robots: { index: false } };

export default async function StartPage() {
  const viewer = await getViewer();
  if (viewer.user && isPaid(viewer.plan)) redirect("/feed");
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} minimal />
      <main className="dark start">
        <div className="wrap start__in">
          <section className="start__what" aria-labelledby="start-h">
            <p className="start__kicker">Insidir</p>
            <h1 id="start-h" className="start__h">Get Insidir.</h1>
            <p className="start__price"><span className="plan2__amt">${PLANS.insidir.price}</span> <span className="plan2__unit">/month</span></p>
            <p className="start__then">{CANCEL_LINE}</p>
            <FeatureList className="plan2__list start__list" />
            <p className="start__fine">Payments are handled by Whop on this page. We never see your card. Already a member? <Link href="/login">Log in</Link>.</p>
          </section>
          <div className="start__checkout">
            <StartCheckout elementsUrl={ELEMENTS_URL} signedInEmail={viewer.user?.email ?? null} />
          </div>
        </div>
      </main>
    </>
  );
}
