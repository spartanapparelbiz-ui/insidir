/* Draft — have counsel review. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { OPEN_TERMINAL } from "@/lib/copy";
import { getViewer } from "@/lib/auth/viewer";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy", description: "What Insidir stores and why. We never store your Kalshi API keys or touch your money." };

export default async function PrivacyPage() {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} />
      {/* Draft — have counsel review. */}
      <main className="wrap lp">
        <article className="lp-legal">
          <h1>Privacy</h1>
          <p className="small muted">Insidir is run by Aethric LLC. This page says what we collect, why, and what we never do.</p>

          <h2>Market data</h2>
          <p>The prices, order books and rules we show come from Kalshi&apos;s, Polymarket&apos;s and Polymarket US&apos;s public APIs. That data is about markets, not about you.</p>

          <h2>What we store about you</h2>
          <ul>
            <li>Your Whop user id and the email address Whop gives us when you sign in. Whop handles sign-in and payment; we never see your card details.</li>
            <li>Your plan, your region (US or outside the US) and your settings: filters, and which alerts you turned on.</li>
            <li>Push subscriptions for the devices where you turned on alerts, so we can send them.</li>
            <li>First-party events (for example: viewed the landing page, opened the feed, started checkout), tied to a random visitor id kept in a cookie. It is not derived from anything personal, and these events are not sent to third parties.</li>
            <li>Which version of the page you saw, and the campaign tags (utm) of the link that brought you, in cookies.</li>
          </ul>

          <h2>Email</h2>
          <p>We use your email to send only the alerts and digests you turn on, and messages about your account. Every email has a one-click unsubscribe. Email is sent through Resend.</p>

          <h2>Your Kalshi CSV</h2>
          <p>If you upload a Kalshi CSV on the P&amp;L page, it is processed to compute your P&amp;L and is not stored.</p>

          <h2>What we never do</h2>
          <ul>
            <li>We never ask for, or store, your exchange passwords or API keys.</li>
            <li>We never sell your data, and we don&apos;t use third-party ad trackers.</li>
          </ul>

          <h2>Who else handles data</h2>
          <ul>
            <li>Whop: sign-in, payments, memberships.</li>
            <li>Resend: sending email.</li>
            <li>Your browser&apos;s push service (Apple, Google or Mozilla): delivering push alerts.</li>
            <li>Our hosting and database providers, to run the service.</li>
          </ul>

          <h2>Your choices</h2>
          <p>Turn alerts off in Settings, unsubscribe from any email in one click, and cancel your plan in one click. To have your account data deleted, email hello@aethric.llc.</p>

          <h2>Contact</h2>
          <p>Aethric LLC · hello@aethric.llc</p>
        </article>
        <div className="lp-legal__next">
          <p>Questions about how it works? The Terminal shows today&apos;s deals, free.</p>
          <Link className="btn btn--primary" href="/terminal">{OPEN_TERMINAL}</Link>
        </div>
      </main>
    </>
  );
}
