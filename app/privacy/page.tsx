/* Draft — have counsel review. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/viewer";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy", description: "What Insidir stores and why. We never store your Kalshi API keys or touch your money." };

export default async function PrivacyPage() {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} tone="light" />
      {/* Draft — have counsel review. */}
      <main className="wrap lp">
        <article className="lp-legal">
          <h1>Privacy</h1>
          <p className="small muted">Insidir is run by Aethric LLC. This page says what we collect, why, and what we never do.</p>

          <h2>Trading data</h2>
          <p>The bets, prices and wallet records we show come from Kalshi&apos;s and Polymarket&apos;s public APIs. Polymarket wallets are shown by their public name or a short address; we never try to work out who is behind a wallet. Kalshi trades are anonymous.</p>

          <h2>What we store about you</h2>
          <ul>
            <li>Your email address and a scrambled form of your password (a scrypt hash: we can't read your password), which is how you log in, and your Whop user id, so we know your payment went through. Whop handles payment; we never see your card details.</li>
            <li>Your plan, your location answer (US or outside the US), the traders and markets you follow, and which alerts you turned on.</li>
            <li>If you sign up for a heads-up about a feature that is coming soon, your email and that feature, so we can tell you once when it&apos;s live.</li>
            <li>Push subscriptions for the devices where you turned on alerts, so we can send them.</li>
            <li>First-party events (for example: viewed the landing page, opened the feed, started checkout), tied to a random visitor id kept in a cookie. It is not derived from anything personal, and these events are not sent to third parties.</li>
            <li>Which version of the page you saw, and the campaign tags (utm) of the link that brought you, in cookies.</li>
          </ul>

          <h2>Email</h2>
          <p>We use your email to log you in. We don't send you email.</p>

          <h2>Your Kalshi CSV</h2>
          <p>If you upload a Kalshi CSV on the P&amp;L page, it is processed to compute your P&amp;L and is not stored.</p>

          <h2>What we never do</h2>
          <ul>
            <li>We never request or store your exchange passwords or API keys.</li>
            <li>We never sell your data, and we don&apos;t use third-party ad trackers.</li>
          </ul>

          <h2>Who else handles data</h2>
          <ul>
            <li>Whop: payments and memberships, and confirming it's you when you reset your password.</li>
            <li>Your browser&apos;s push service (Apple, Google or Mozilla): delivering push alerts.</li>
            <li>Our hosting and database providers, to run the service.</li>
          </ul>

          <h2>Your choices</h2>
          <p>Turn alerts off in Account, unsubscribe from any email in one click, and cancel your plan in one click. To have your account data deleted, email hello@aethric.llc.</p>

          <h2>Contact</h2>
          <p>Aethric LLC · hello@aethric.llc</p>
        </article>
        <div className="lp-legal__next">
          <Link className="btn btn--primary" href="/feed">See the live feed</Link>
        </div>
      </main>
    </>
  );
}
