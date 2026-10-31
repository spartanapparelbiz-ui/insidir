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
    <TrustPage path="/privacy" title="Privacy" updated="October 31, 2026"
      lead={`Insidir is run by ${COMPANY.name}. This page says what we keep about you, why, who else sees it, and how to delete it. We don't sell your data and we don't use ad trackers.`}>
      <h2>The data we show</h2>
      <p>Positions, prices and records come from public sources: Polymarket&apos;s and Kalshi&apos;s public trade data and SEC EDGAR. A Polymarket wallet is shown by its public username or a short address; we never try to work out who is behind it. Kalshi trades carry no name.</p>

      <h2>What we keep about you</h2>
      <ul>
        <li><strong>Your account</strong>: email and Whop user id (from signing in with Whop), your plan and membership status, and your US or outside-the-US answer. We never have a password or card number for you.</li>
        <li><strong>What you follow</strong>: trackers, traders and markets, your alert settings, and push subscriptions for the devices where you turned alerts on.</li>
        <li><strong>Bets you check</strong>: the legs we matched and how they settled. A slip image is sent to an AI model through OpenRouter to read it, and isn&apos;t stored by us. A Kalshi CSV you upload on the P&amp;L page is read and not stored.</li>
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
        <li><strong>OpenRouter</strong> and the AI model it routes to: reading a bet slip image you choose to check.</li>
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
