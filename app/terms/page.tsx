/* Terms (/terms), in plain English and dated. Matches the product: a data service, Whop for sign-in and payment, the
 * $1 week then $39 a month, cancel on Whop, fair use, liability. Have counsel review before relying on it. */
import type { Metadata } from "next";
import Link from "next/link";
import { TrustPage } from "@/components/TrustPage";
import { COMPANY, DATA_COMPANY, PAST } from "@/lib/copy";
import { isReady } from "@/lib/features";

export const metadata: Metadata = { title: "Terms", description: "The terms for using Insidir, in plain English." };

export default function TermsPage() {
  return (
    <TrustPage path="/terms" title="Terms of service" updated="October 31, 2026"
      lead={`Insidir is run by ${COMPANY.name}. By using insidir.com you agree to these terms. They're written to be read; if anything is unclear, write to us.`}>
      <h2>What Insidir is</h2>
      <p>{DATA_COMPANY}</p>
      <p>Insidir reads public data, large trades on Polymarket and Kalshi{isReady("stocks") ? " and Form 4 and 13F filings on SEC EDGAR" : ""}, and shows it with the records of the accounts behind it where the data allows. We don&apos;t place trades or bets, hold money, or hold positions for you, and nothing on the site is a recommendation. You decide what to do, and you do it yourself on each venue, under its own terms.</p>

      <h2>No promise of results</h2>
      <ul>
        <li>{PAST} A tracker or a wallet that made money before can lose it next.</li>
        <li>Data can be late, incomplete or wrong. Each card links its source, and the source is the record. How we check: <Link href="/data">Our data</Link>.</li>
        <li>Followable returns assume a price you may not get. How they&apos;re computed: <Link href="/methodology">Methodology</Link>.</li>
      </ul>

      <h2>Who can use it</h2>
      <p>You must be 18 or older, and old enough to use prediction markets or sportsbooks where you live if you use them. It&apos;s up to you to check that each venue is legal and available to you, and to follow its rules.</p>

      <h2>Your account and payment</h2>
      <ul>
        <li>You sign in with Whop and pay on Whop&apos;s checkout. Whop&apos;s own terms apply to payment.</li>
        <li>Membership starts with 7 days for $1, then $39 a month, renewing monthly until you cancel. If you cancel within the 7 days, you aren&apos;t charged the $39.</li>
        <li>Cancel anytime on your <a href="https://whop.com/@me/settings/orders" target="_blank" rel="noopener noreferrer">Whop orders page</a> (Settings → Manage subscription). You keep access until the end of the period you paid for.</li>
        <li>Refunds follow Whop&apos;s process and the law where you live. Write to us if something went wrong and we&apos;ll make it right where we can.</li>
        <li>You can delete your account in <Link href="/settings">Settings</Link> at any time.</li>
      </ul>

      <h2>Fair use</h2>
      <p>Your membership is for you. Don&apos;t share your account, resell or republish the feed, scrape the site, or get around the members-only pages. We can suspend accounts that do, and we&apos;ll tell you why.</p>

      <h2>Names and logos</h2>
      <p>Names and logos of venues, leagues, teams and companies identify them and belong to their owners. Photos are used under their licenses: <Link href="/credits">Credits</Link>.</p>

      <h2>Liability</h2>
      <p>Insidir is provided as is. As far as the law allows, {COMPANY.name} isn&apos;t liable for trading or betting losses or for decisions made using Insidir, and our total liability to you is limited to what you paid us in the last 3 months.</p>

      <h2>Changes</h2>
      <p>If we change these terms in a way that matters, we&apos;ll say so on the site before it applies, and the date above will change. What changed: <Link href="/changelog">Changelog</Link>.</p>

      <h2>Contact</h2>
      <p>{COMPANY.name}, {COMPANY.place} · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></p>
    </TrustPage>
  );
}
