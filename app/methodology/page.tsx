/* Methodology (/methodology): where every number comes from, who is on the watchlist, what counts as a bet, how a
 * Polymarket market is matched to its Kalshi twin, the delays, what counts toward a record, and the known limits. Every
 * rule here is the one the code runs (lib/millionaires/watchlist.ts, lib/moves/poll.ts, lib/twins/check.ts,
 * lib/twins/structured.ts, lib/millionaires/queries.ts). */
import type { Metadata } from "next";
import Link from "next/link";
import { TrustPage } from "@/components/TrustPage";
import { PAST } from "@/lib/copy";
import { MILLIONAIRE_MIN, PRO_MIN, WATCHLIST_SIZE } from "@/lib/millionaires/watchlist";
import { BET_MIN } from "@/lib/moves/poll";
import { VISITOR_DELAY_MS } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { RECORD_MIN_RESOLVED } from "@/lib/moves/records";
import { analystModel } from "@/lib/analyst/llm";
import { NOTE_VERSION } from "@/lib/analyst/types";

export const metadata: Metadata = { title: "Methodology", description: "Where every Insidir number comes from: the watchlist, the bets, how a Polymarket market is matched to its Kalshi twin, the delays and the known limits." };

export default function MethodologyPage() {
  const late = Math.round(VISITOR_DELAY_MS / 60_000);
  return (
    <TrustPage path="/methodology" title="Methodology" updated="November 4, 2026"
      lead="Every number on Insidir is computed from public records by the rules on this page. Nothing is typed in by hand.">
      <h2 id="sources">Where each number comes from</h2>
      <ul>
        <li><strong>Bets</strong>: Polymarket trades, public on the Polygon blockchain, read from Polymarket&apos;s public data.</li>
        <li><strong>Prices</strong>: each venue&apos;s own price and price history. Kalshi prices come from Kalshi&apos;s public market data.</li>
        <li><strong>Results</strong>: the market&apos;s official resolution on the venue.</li>
        <li><strong>Wallet profit</strong>: Polymarket&apos;s public all-time leaderboard, and each wallet&apos;s own settled positions.</li>
      </ul>

      <h2 id="watchlist">The watchlist</h2>
      <ul>
        <li>The top {WATCHLIST_SIZE.toLocaleString("en-US")} Polymarket wallets by all-time profit, refreshed daily.</li>
        <li><strong>Millionaire</strong>: up {dollars(MILLIONAIRE_MIN)} or more all-time. <strong>Pro</strong>: up {dollars(PRO_MIN)} or more.</li>
        <li>Only the wallet address, its tier and its profit are kept. Names, pictures and leaderboard ranks are never stored: Insidir never shows who is behind a wallet.</li>
      </ul>

      <h2 id="bets">What counts as a bet</h2>
      <ul>
        <li>A watchlist wallet&apos;s purchase of {dollars(BET_MIN)} or more on one side of one market. Purchases close together are one bet.</li>
        <li>Each bet keeps the side, the size, the average price paid, the time, and the result once the market settles.</li>
      </ul>

      <h2 id="twins">Kalshi twins</h2>
      <p>A Polymarket market and a Kalshi market are twins only when all five match:</p>
      <ul>
        <li><strong>Event</strong>: the same game, race or meeting.</li>
        <li><strong>Outcome</strong>: the same thing pays (the same team, side, candidate or move).</li>
        <li><strong>Line or strike</strong>: the same exact number. A −4.5 spread is never a 5.5 spread.</li>
        <li><strong>Resolution source</strong>: both venues settle on the same source.</li>
        <li><strong>Close date</strong>: within 36 hours.</li>
      </ul>
      <p>A twin approves itself only when all five are read from the venues&apos; own structured data: the game&apos;s league, teams and date from Polymarket&apos;s event slug and Kalshi&apos;s event ticker, the line as a number on both venues, the candidate&apos;s exact name, both stated resolution sources and both close times. Anything matched from a market&apos;s title, or with any field missing, waits for a person to approve it. Only approved twins show a Kalshi link or a Kalshi price; a market with no twin says so.</p>

      <h2 id="delays">Delays</h2>
      <ul>
        <li><strong>Members</strong> see every bet live: Polymarket is read every 15 seconds, so a bet usually shows within a minute.</li>
        <li><strong>Visitors</strong> see the board {late} minutes late, without the side.</li>
        <li>Every block of numbers says when it was read.</li>
      </ul>

      <h2 id="records">Records</h2>
      <ul>
        <li>A wallet&apos;s record is built from its own settled markets, losses included. It shows once the wallet has {RECORD_MIN_RESOLVED} settled markets.</li>
        <li>Voided markets (refunded) and positions sold before the result are not wins or losses.</li>
        <li>{PAST}</li>
      </ul>

      <h2 id="analyst-notes">Analyst notes</h2>
      <p>Some bets carry a short note, at most 3 sentences. It describes the data; it never recommends, predicts or guesses who is behind a wallet. The writer sees only facts computed from Insidir&apos;s own data, and a note is published only if every number and name in it is in those facts. Notes are written by {analystModel()} at temperature 0, under rules version {NOTE_VERSION}; one that fails the check is replaced by a fixed template.</p>

      <h2 id="limits">Known limits</h2>
      <ul>
        <li>A wallet is not a person. One trader can use several wallets, and we never try to work out who is behind one.</li>
        <li>The price you get is not the price they paid: by the time you see a bet, the price may have moved.</li>
        <li>It&apos;s a record of what happened, not advice. See <Link href="/disclosures">Disclosures</Link>.</li>
      </ul>
      <p>How we verify every number against its source: <Link href="/data">Our data</Link>. Live health of every source: <Link href="/status">Status</Link>.</p>
    </TrustPage>
  );
}
