/* Privacy (/privacy), in plain English and dated. Every line matches the code: what lib/db/schema.ts keeps about a
 * person, who else handles data (Whop, OpenRouter for slip images, push services, Railway), retention and deletion
 * (lib/account/delete.ts). Have counsel review before relying on it. */
import type { Metadata } from "next";
import Link from "next/link";
import { TrustPage } from "@/components/TrustPage";
import { COMPANY } from "@/lib/copy";

export const metadata: Metadata = { title: "Privacy", description: "What Insidir keeps about you, why, who else handles it, and how to delete it." };

export default function PrivacyPage() {
  return (
    <TrustPage path="/privacy" title="Privacy" updated="November 1, 2026"
      lead={`Insidir is operated by ${COMPANY.name}, ${COMPANY.place}, which decides what is kept and is responsible for it. This page says what we keep about you, why, who else sees it, and how to delete it. We don't sell your data and we don't use ad trackers.`}>
      <h2>The data we show</h2>
      <p>Bets, prices and records come from public sources: Polymarket&apos;s public trade data and Kalshi&apos;s public market data. A Polymarket wallet is only ever shown by its short address; we never try to work out who is behind it.</p>

      <h2>What we keep about you</h2>
      <ul>
        <li><strong>Your account</strong>: email and Whop user id (from signing in with Whop), your plan and membership status, your US or outside-the-US answer, when you confirmed you are 18 or older, the answers you gave when you joined (categories, where you bet, your usual size), and the reason you gave if you cancel. We never have a password or card number for you.</li>
        <li><strong>What you follow</strong>: wallets and markets, the bets you logged as copied, your ping settings, and push subscriptions for the devices where you turned pings on.</li>
                <li><strong>Heads-ups</strong>: if you sign up to hear when a feature launches, your email and that feature.</li>
        <li><strong>Usage</strong>: first-party events (page viewed, checkout started) with a random visitor id from a cookie and, when you&apos;re signed in, your account id; which version of a page you saw; campaign tags (utm) of the link that brought you.</li>
      </ul>

      <h2>Cookies</h2>
      <p>Your session (signed in), the visitor id, your region answer, and the page version you saw. All first-party; no ad or tracking cookies.</p>

      <h2>Email</h2>
      <p>We use your email to identify your account. We don&apos;t send marketing email. If we ever email you about something you turned on, every email will have a one-click unsubscribe.</p>

      <h2>Who else handles data</h2>
      <ul>
        <li><strong>Whop</strong>: sign-in, payments and memberships.</li>
        <li><strong>OpenRouter</strong> and the AI model it routes to: writing the analyst's notes.</li>
        <li><strong>Your browser&apos;s push service</strong> (Apple, Google or Mozilla): delivering alerts you turned on.</li>
        <li><strong>Railway</strong>: hosting the site and the database.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account data: until you delete your account.</li>
        <li>Sessions: 30 days, or until you sign out.</li>
        <li>Usage events: kept to improve Insidir; when you delete your account, they stay without your account id.</li>
      </ul>

      <h2>Delete your data</h2>
      <p>In <Link href="/settings">Settings</Link>, choose <strong>Delete account</strong>: your account and everything tied to it is removed right away. Cancel your membership on Whop first; deleting here doesn&apos;t cancel it. Or email <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> and we&apos;ll do it, and answer any question about your data. More: <Link href="/security">Security</Link>.</p>

      <h2>Contact</h2>
      <p>{COMPANY.name}, {COMPANY.place} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></p>
    </TrustPage>
  );
}
