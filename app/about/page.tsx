/* About: what Insidir is, why it exists, how a deal is checked before it shows, and what we will never do. Every
 * line here is true of the code: matching (lib/matching: rules first, a second check only when unsure), fees on
 * every leg (lib/fees), sizes from the live order book (lib/engines), the safety light from both rule texts, every
 * deal saved as a receipt when found (lib/worker/store.ts). Insidir holds no money, places no trades, stores no
 * exchange keys and sells no data (see /privacy). */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SUPPORT_EMAIL } from "@/components/SiteFooter";
import { MONEY_LINE } from "@/components/landing/Trust";
import { OPEN_TERMINAL } from "@/lib/copy";
import { getViewer } from "@/lib/auth/viewer";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "About",
  description: "What Insidir is, how every deal is checked, and what we will never do: hold your money, trade for you, or sell your data.",
};

export default async function AboutPage() {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} current="/about" />
      <main className="wrap lp">
        <article className="lp-legal lp-about">
          <h1>About Insidir</h1>
          <p className="lp-about__lead">Insidir watches Kalshi and Polymarket for the same question priced two ways. When buying both sides costs less than $1, after fees, we show you the deal and the math.</p>

          <h2>Why it exists</h2>
          <p>These gaps are real, but they are small and they close fast. Checking thousands of markets by hand, reading both rule pages and counting fees on every leg takes longer than the gap lasts. Insidir does that part, all day, and shows its work.</p>

          <h2>How a deal is checked</h2>
          <ol>
            <li><strong>Same question.</strong> Markets are matched on the event, the date and the line. When a match is unclear, it gets a second check before it can show, and every decision is saved.</li>
            <li><strong>Same rules.</strong> The safety light compares both rule texts: same rules (green), check the rules (amber), or skip (red). Red pairs are hidden by default.</li>
            <li><strong>Real prices, real size.</strong> Prices come from the live order books. The size is what you could actually buy at those prices, level by level.</li>
            <li><strong>After fees.</strong> Every profit and ROI is after taker fees on every leg, the worst case.</li>
            <li><strong>On the record.</strong> Every deal is saved as a receipt the moment we find it, and the receipt is never edited. When it settles, the result goes next to it, wins and misses alike. <Link href="/receipts">See the receipts</Link>.</li>
          </ol>

          <h2>What we will never do</h2>
          <ul>
            <li>Hold your money. You trade on Kalshi and Polymarket, in your own accounts.</li>
            <li>Trade for you. You place every order yourself. We never ask for your exchange passwords or API keys.</li>
            <li>Sell your data. See <Link href="/privacy">Privacy</Link>.</li>
          </ul>

          <h2>How we make money</h2>
          <p>{MONEY_LINE}</p>

          <h2>Who we are</h2>
          <p>Insidir is built by Aethric LLC, Pompano Beach, FL. Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Replies within 24 hours.</p>

          <h2>The fine print</h2>
          <p>Insidir is information, not advice. A deal locks in a profit only if both sides fill at the prices shown and both markets settle the same way. It is not risk-free. Read <Link href="/#faq-risk">what can go wrong</Link>.</p>
        </article>
        <div className="lp-legal__next">
          <Link className="btn btn--primary" href="/terminal">{OPEN_TERMINAL}</Link>
        </div>
      </main>
    </>
  );
}
