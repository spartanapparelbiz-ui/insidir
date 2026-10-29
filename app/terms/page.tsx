/* Draft — have counsel review. */
import { GET_CTA } from "@/lib/copy";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { FOOTER } from "@/lib/copy";
import { getViewer } from "@/lib/auth/viewer";
import { isReady } from "@/lib/features";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms", description: "The terms for using Insidir: information only, not financial advice, and how plans, billing and cancellation work." };

export default async function TermsPage() {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} tone="light" />
      {/* Draft — have counsel review. */}
      <main className="wrap lp">
        <article className="lp-legal">
          <h1>Terms of service</h1>
          <p className="small muted">Insidir is run by Aethric LLC. By using insidir.com you agree to these terms.</p>

          <h2>What Insidir is</h2>
          <p>Insidir is an information service. It reads public trading data from Kalshi and Polymarket through their public APIs and shows the largest positions as they are opened, in plain English, with the public records of the wallets behind them where the data allows.{isReady("stocks") ? " It also shows insider purchases and quarterly fund holdings as reported in public SEC filings (Forms 4 and 13F), linking each to the filing; 13F data can be up to 45 days old." : ""}</p>
          <p>Insidir is not a broker, an exchange or an adviser. We do not place trades, hold money or hold positions for you, and nothing on the site is a recommendation to buy or sell anything. You decide what to do, and you place every trade yourself on each venue, under that venue&apos;s own terms.</p>

          <h2>No promise of results</h2>
          <ul>
            <li>Prices move, and the data we show can be delayed, incomplete or wrong. The venues&apos; own pages are the source of truth.</li>
            <li>Big traders lose too. A wallet&apos;s record shows what happened, not what will happen.</li>
            <li>Past results on the Track record page do not predict future ones.</li>
          </ul>

          <h2>Your eligibility</h2>
          <p>You are responsible for checking that prediction markets, and each venue, are available to you where you live, and for following each venue&apos;s rules. If you tell us you are in the US, Insidir only links you to apps available in the US.</p>

          <h2>Accounts and payment</h2>
          <p>Payment is handled by Whop, on our checkout page. Insidir starts with a 7-day trial for $1, then $39/month, renewing monthly until cancelled. Access starts as soon as the $1 is paid; if you cancel during the 7 days you are not charged the $39. You can cancel in one click in Account; access continues to the end of the period you paid for. Voids follow Whop&apos;s process and the law where you live.</p>

          <h2>Fair use</h2>
          <p>Your plan is for you. Don&apos;t resell or republish the feed, scrape the site, share your account, or try to get around the members-only pages. We can suspend accounts that do.</p>

          <h2>Liability</h2>
          <p>Insidir is provided as is. To the extent the law allows, Aethric LLC is not liable for trading losses or for decisions made using the service, and our total liability is limited to what you paid us in the last 3 months.</p>

          <h2>Changes</h2>
          <p>We may update these terms; when we make a material change we will say so on the site or by email before it applies.</p>

          <h2>Contact</h2>
          <p>Aethric LLC · hello@aethric.llc</p>
          <p className="small muted">{FOOTER}</p>
        </article>
        <div className="lp-legal__next">
          <Link className="btn btn--primary" href="/start">{GET_CTA}</Link>
        </div>
      </main>
    </>
  );
}
