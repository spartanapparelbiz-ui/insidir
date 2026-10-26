/* Draft — have counsel review. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { FOOTER, LOCK_LINE, OPEN_TERMINAL } from "@/lib/copy";
import { getViewer } from "@/lib/auth/viewer";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms", description: "The terms for using Insidir: information only, not financial advice, and how plans, billing and cancellation work." };

export default async function TermsPage() {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} />
      {/* Draft — have counsel review. */}
      <main className="wrap lp">
        <article className="lp-legal">
          <h1>Terms of service</h1>
          <p className="small muted">Insidir is run by Aethric LLC. By using insidir.com you agree to these terms.</p>

          <h2>What Insidir is</h2>
          <p>Insidir is an information service. It reads public market data from Kalshi, Polymarket and Polymarket US through their public APIs, and shows where their prices, after fees, add up to less than the payout. {LOCK_LINE}</p>
          <p>Insidir is not a broker, an exchange or an adviser. We do not place trades, hold money or hold positions for you, and nothing on the site is a recommendation to buy or sell anything. You decide what to do, and you place every trade yourself on each venue, under that venue&apos;s own terms.</p>

          <h2>No promise of results</h2>
          <ul>
            <li>Prices move, and the data we show can be delayed, incomplete or wrong. The venues&apos; own pages are the source of truth.</li>
            <li>An order can fail to fill or fill only in part. Two markets that look alike can settle differently. Fees can change.</li>
            <li>The safety light is our reading of two rule texts, not a promise about how either market will settle.</li>
            <li>Past results in the receipts log do not mean future deals will work the same way.</li>
          </ul>

          <h2>Your eligibility</h2>
          <p>You are responsible for checking that prediction markets, and each venue, are available to you where you live, and for following each venue&apos;s rules. If you tell us you are in the US, Insidir shows only Kalshi and Polymarket US.</p>

          <h2>Accounts and payment</h2>
          <p>Sign-in and payment are handled by Whop. Paid plans renew monthly until cancelled. You can cancel in one click in Settings; access continues to the end of the period you paid for. Refunds follow Whop&apos;s process and the law where you live.</p>

          <h2>Fair use</h2>
          <p>Your plan is for you. Don&apos;t resell or republish the feed, scrape the site, share your account, or try to get around the free plan&apos;s delay. We can suspend accounts that do.</p>

          <h2>Liability</h2>
          <p>Insidir is provided as is. To the extent the law allows, Aethric LLC is not liable for trading losses or for decisions made using the service, and our total liability is limited to what you paid us in the last 3 months.</p>

          <h2>Changes</h2>
          <p>We may update these terms; when we make a material change we will say so on the site or by email before it applies.</p>

          <h2>Contact</h2>
          <p>Aethric LLC · hello@aethric.llc</p>
          <p className="small muted">{FOOTER}</p>
        </article>
        <div className="lp-legal__next">
          <p>Questions about how it works? The Terminal shows today&apos;s deals, free.</p>
          <Link className="btn btn--primary" href="/terminal">{OPEN_TERMINAL}</Link>
        </div>
      </main>
    </>
  );
}
