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
      lead="Insidir tracks every large position on Polymarket, Kalshi and SEC filings, and shows what following each tracker would have made.">
      <h2>What it is</h2>
      <p>A tracker is a live portfolio of large positions that fit one rule: every $100K+ position, the largest NBA positions, CEO purchases of their own stock. Each one has a public record built from settled positions, losses included, and a followable return: what $100 on every position would have made at the price Insidir showed it. Members see every position live; visitors see the same data 30 minutes late.</p>

      <h2>Why</h2>
      <p>Large positions on prediction markets and insider purchases are public, but they&apos;re buried in raw trade logs and filings, and most &ldquo;smart money&rdquo; claims never show their losses. Insidir reads all of it, checks it against the source every hour, and shows the record, so you can see what following big money would really have done.</p>

      <h2>Who builds it</h2>
      <p>Insidir is built by {COMPANY.name} in {COMPANY.place}. It was founded by {COMPANY.founder}, who builds and runs it. There&apos;s no call centre: when you write, the person who builds Insidir reads it.</p>

      <h2>What we&apos;ll never do</h2>
      <ul>
        <li>Tell you what to buy. We show what happened; you decide.</li>
        <li>Hold your money or trade for you.</li>
        <li>Try to work out who is behind a wallet.</li>
        <li>Sell your data. See <Link href="/privacy">Privacy</Link>.</li>
      </ul>

      <h2>Contact</h2>
      <p><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. A person answers within 24 hours. How it all works: <Link href="/methodology">Methodology</Link> and <Link href="/data">Our data</Link>.</p>
    </TrustPage>
  );
}
