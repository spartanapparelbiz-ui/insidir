/* Security (/security): sign-in and payments by Whop, card details never touch our servers, what data we keep and for
 * how long, how to delete your account, and how to report a security issue. Every line matches what the code does
 * (lib/auth/whop-login.ts, lib/billing, app/api/account/delete). */
import type { Metadata } from "next";
import Link from "next/link";
import { TrustPage } from "@/components/TrustPage";
import { COMPANY } from "@/lib/copy";

export const metadata: Metadata = { title: "Security", description: "How Insidir handles sign-in, payments and your data, how to delete your account, and how to report a security issue." };

export default function SecurityPage() {
  return (
    <TrustPage path="/security" title="Security" updated="October 31, 2026"
      lead="Insidir holds as little about you as it can. Sign-in and payments run on Whop, so we never have a password or a card number for you.">
      <h2>Sign-in and payments by Whop</h2>
      <ul>
        <li><strong>Sign-in</strong> uses Whop&apos;s OAuth with PKCE: you sign in on Whop (Google, Apple or email) and Whop tells us who you are. We never see or store a password.</li>
        <li><strong>Payments</strong> run on Whop&apos;s checkout. Card details go straight to Whop and never touch our servers.</li>
        <li><strong>Your membership</strong> is read from Whop: we check it at sign-in, when Whop tells us something changed, and at least every 5 minutes after that.</li>
        <li>Sessions are kept in an HTTP-only, secure cookie. Signing out ends the session on our side.</li>
      </ul>

      <h2>What we keep, and for how long</h2>
      <ul>
        <li><strong>While you have an account</strong>: your email and Whop user id, your plan, your region answer, the trackers, traders and markets you follow, your alert settings and push subscriptions.</li>
        <li><strong>Bet slips you check</strong> are sent to an AI model through OpenRouter to read the legs, then thrown away: we never store the image. We keep the legs we matched so you can see your history.</li>
        <li><strong>Usage events</strong> (pages viewed, checkout started) are tied to a random visitor id and, when you&apos;re signed in, your account id. We use them to improve Insidir and don&apos;t sell or share them.</li>
        <li><strong>When you delete your account</strong>, your account, sessions, follows, alerts, push subscriptions and checked bets are removed at once. Usage events stay, without your account id.</li>
      </ul>

      <h2>Delete your account</h2>
      <p>Go to <Link href="/settings">Settings</Link> and choose <strong>Delete account</strong>. It cancels nothing on Whop by itself: cancel your membership first on your <a href="https://whop.com/@me/settings/orders" target="_blank" rel="noopener noreferrer">Whop orders page</a>. You can also email <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> and we&apos;ll delete it for you.</p>

      <h2>How the data itself is protected</h2>
      <ul>
        <li>Everything is served over HTTPS.</li>
        <li>The database is only reachable from our own services on our hosting provider.</li>
        <li>Admin pages need a separate sign-in. Secrets live in the hosting provider&apos;s environment, never in the code.</li>
      </ul>

      <h2>Report a security issue</h2>
      <p>Email <a href={`mailto:${COMPANY.email}?subject=Security`}>{COMPANY.email}</a> with &ldquo;Security&rdquo; in the subject. A person reads it, usually within a day. Please give us a reasonable time to fix an issue before telling anyone else, and don&apos;t access other people&apos;s data while testing.</p>
    </TrustPage>
  );
}
