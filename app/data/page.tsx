/* About our data (/data): where every number comes from, how late each source can be, and what it can't tell you.
 * Linked from the footer and from every profile. Plain words; every claim here matches what the worker actually does
 * (worker/index.ts, lib/accuracy/check.ts). */
import { GET_CTA } from "@/lib/copy";
import type { Metadata } from "next";
import Link from "next/link";
import { PageBand } from "@/components/PageBand";
import { SiteHeader } from "@/components/SiteHeader";
import { SUPPORT_EMAIL } from "@/components/SiteFooter";
import { getViewer } from "@/lib/auth/viewer";
import { BAND } from "@/lib/photos";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About our data", description: "Where Insidir's data comes from, how late each source can be, and its limits." };

export default async function DataPage() {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/data" tone="light" />
      <main className="wrap lp">
        <PageBand n={BAND.about} title="About our data" />
        <article className="lp-legal lp-about">
          <p className="lp-about__lead">Every move, amount and record on Insidir comes from a public record, and every card links to it under &ldquo;Where this comes from&rdquo;.</p>

          <h2>Where it comes from</h2>
          <ul>
            <li><strong>Polymarket</strong>: public trades from Polymarket&apos;s data feed, each one settled on the Polygon blockchain. A card links the transaction on Polygonscan; a profile links the wallet. We name a wallet by its public Polymarket username, or a short address when it has none.</li>
            <li><strong>Kalshi</strong>: Kalshi&apos;s public trade feed. Kalshi trades carry no name or account, so a Kalshi card says &ldquo;Someone&rdquo; and links Kalshi&apos;s own record of that trade.</li>
            <li><strong>SEC EDGAR</strong>: Form 4 filings, where a company&apos;s officers, directors and 10% owners report buying or selling its stock, and Form 13F filings, where big funds report what they held at the end of each quarter. A stock card links the filing on sec.gov.</li>
          </ul>

          <h2>How late it can be</h2>
          <ul>
            <li><strong>Polymarket and Kalshi</strong>: we check every 15 seconds, so a big move usually shows within a minute. The public preview on our home page shows moves 30 minutes after they happen.</li>
            <li><strong>Form 4 (insider trades)</strong>: insiders have up to 2 business days after a trade to file. We check EDGAR every 2 minutes, so a card shows both dates: the day they traded and the day they filed. We never say &ldquo;just bought&rdquo;.</li>
            <li><strong>13F (fund holdings)</strong>: funds file up to 45 days after the quarter ends, so a 13F card can describe holdings more than six weeks old. Each card says which quarter it covers and the day it was filed, for example &ldquo;Q3 2026 holdings · filed Nov 14&rdquo;.</li>
            <li>When a source is more than 5 minutes behind, the feed says &ldquo;Catching up&rdquo; with the time of the last update, instead of &ldquo;Live&rdquo;.</li>
          </ul>

          <h2>What it can&apos;t tell you</h2>
          <ul>
            <li><strong>A wallet is not a person.</strong> One trader can use several wallets, and a record covers that one wallet only. We never try to work out who is behind a wallet, and we call it a wallet, never an insider.</li>
            <li><strong>Records start at 20 settled markets.</strong> A wallet&apos;s win rate and profit come from the markets it has bet on that have settled; before 20, we don&apos;t show a record.</li>
            <li><strong>Form 4 cards are open-market buys of stock.</strong> Option grants, gifts and planned sales are left out.</li>
            <li><strong>13F shows a snapshot.</strong> It lists long US stock positions at the end of the quarter, not when the fund bought, what it paid, or what it has done since.</li>
            <li><strong>It&apos;s a record of what happened, not advice.</strong> Big money loses too: the <Link href="/results">Results</Link> page shows every settled move, losses included.</li>
          </ul>

          <h2>How we check it</h2>
          <p>Every hour we re-read 20 random moves and 20 profile numbers from their sources. Anything that doesn&apos;t match is hidden until it does, and we get an email. Spotted something wrong? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
        </article>
        <div className="lp-legal__next">
          <Link className="btn btn--primary" href="/start">{GET_CTA}</Link>
        </div>
      </main>
    </>
  );
}
