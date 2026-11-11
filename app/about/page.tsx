/* About (/about): what Insidir is, who builds it (Aethric LLC, founder Nicholas, Pompano Beach, FL), why, and how to
 * reach a person. No team or investors that don't exist. */
import type { Metadata } from "next";
import Link from "next/link";
import { TrustPage } from "@/components/TrustPage";
import { COMPANY } from "@/lib/copy";

export const metadata: Metadata = { title: "About", description: "What Insidir is, who builds it and why." };

export default function AboutPage() {
  return (
    <TrustPage path="/about" title="About Insidir"
      lead="See who's trading on Kalshi. Kalshi won't show you. Insidir watches the most profitable wallets on Polymarket, where every trade is public, and shows you the same market on Kalshi.">
      <h2>What it is</h2>
      <p>Polymarket&apos;s trades are public: anyone can see which wallet traded what. Kalshi&apos;s are not. Insidir watches the top Polymarket wallets by all-time profit, shows each bet as it lands with the side and the price, and matches the market to its twin on Kalshi, so you can see the same bet, and its price, where you trade. Every wallet has a public record, losses included.</p>

      <h2>Why</h2>
      <p>The trades of people who have made millions on prediction markets are public, but they&apos;re buried in raw trade logs, and most &ldquo;smart money&rdquo; claims never show their losses. Insidir reads all of it, verifies it against the source every hour, and shows the record.</p>

      <h2>Who builds it</h2>
      <p>Insidir is built by {COMPANY.name} in {COMPANY.place}. It was founded by {COMPANY.founder}, who builds and runs it. There&apos;s no call centre: when you write, the person who builds Insidir reads it.</p>

      <h2>What we&apos;ll never do</h2>
      <ul>
        <li>Tell you what to buy. We show what happened; you decide.</li>
        <li>Hold your money or place a trade for you.</li>
        <li>Try to work out who is behind a wallet.</li>
        <li>Sell your data. See <Link href="/privacy">Privacy</Link>.</li>
      </ul>

      <h2>Contact</h2>
      <p><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. A person answers within 24 hours. How it all works: <Link href="/methodology">Methodology</Link> and <Link href="/data">Our data</Link>.</p>
    </TrustPage>
  );
}
