/* About: what Insidir is, where the data comes from, what we will never do, and who is behind it. */
import { GET_CTA } from "@/lib/copy";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SUPPORT_EMAIL } from "@/components/SiteFooter";
import { getViewer } from "@/lib/auth/viewer";
import { isReady } from "@/lib/features";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About", description: "What Insidir is, where the data comes from, and what we will never do." };

export default async function AboutPage() {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/about" tone="light" />
      <main className="wrap lp">
        <article className="lp-legal lp-about">
          <h1>About Insidir</h1>
          <p className="lp-about__lead">Insidir shows you the biggest bets on sports and prediction markets the second they happen, in plain English.</p>

          <h2>Why it exists</h2>
          <p>When someone puts $100,000 on one side of a game or a question, that&apos;s worth knowing. The data is public, but it&apos;s buried in raw trade logs. Insidir watches them all day and turns each big bet into one sentence you can read in a second.</p>

          <h2>Where the data comes from</h2>
          <ul>
            <li><strong>Polymarket</strong>: public trades, with the wallet that made each one. We show a wallet&apos;s public name or a short address, and its record once it has 20 settled markets.</li>
            <li><strong>Kalshi</strong>: public trades. They&apos;re anonymous, so we say &ldquo;someone&rdquo;.</li>
            {isReady("stocks") ? <li><strong>SEC EDGAR</strong>: Form 4 filings, where company insiders report buying their own company&apos;s stock, and Form 13F filings, where big funds report what they held at the end of each quarter (up to 45 days later). Every stock card links to the filing.</li> : null}
            <li>Every move, amount and record on the site comes from that data. When a market settles, we mark each move won or lost on the <Link href="/results">Results</Link> page, losses included.</li>
          </ul>
          <p>How late each source can be, and what it can&apos;t tell you: <Link href="/data">About our data</Link>.</p>

          <h2>What we will never do</h2>
          <ul>
            <li>Tell you what to buy. We show what happened; you decide.</li>
            <li>Hold your money or trade for you.</li>
            <li>Try to work out who is behind a wallet.</li>
            <li>Sell your data. See <Link href="/privacy">Privacy</Link>.</li>
          </ul>

          <h2>Who we are</h2>
          <p>Insidir is built by Aethric LLC, Pompano Beach, FL. Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
        </article>
        <div className="lp-legal__next">
          <Link className="btn btn--primary" href="/start">{GET_CTA}</Link>
        </div>
      </main>
    </>
  );
}
