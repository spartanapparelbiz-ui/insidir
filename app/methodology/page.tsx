/* Methodology (/methodology, which replaces How it works): where every number comes from, how fills become one
 * position, how followable returns and the $100 line are computed, the delays, what counts toward a record and
 * what doesn't, and the known limits. Every rule here is the one the code runs (lib/moves/detect.ts,
 * lib/moves/realize.ts, lib/follow/math.ts, lib/follow/seen.ts, lib/trust.ts). */
import type { Metadata } from "next";
import Link from "next/link";
import { TrustPage } from "@/components/TrustPage";
import { PAST } from "@/lib/copy";
import { MIN_SETTLED, SLIPPAGE, STAKE } from "@/lib/follow/math";
import { MERGE_WINDOW_MS, PRICE_MAX, PRICE_MIN, WHALE_MIN_KALSHI, WHALE_MIN_POLY } from "@/lib/moves/detect";
import { dollars } from "@/lib/moves/copy";
import { RECORD_MIN_RESOLVED } from "@/lib/moves/records";
import { analystModel } from "@/lib/analyst/llm";
import { NOTE_VERSION } from "@/lib/analyst/types";

export const metadata: Metadata = { title: "Methodology", description: "Where every Insidir number comes from, how positions are merged, how followable returns and the $100 line are computed, and the known limits." };

export default function MethodologyPage() {
  const pts = Math.round(SLIPPAGE * 100);
  const model = analystModel();
  return (
    <TrustPage path="/methodology" title="Methodology" updated="October 31, 2026"
      lead="Every number on Insidir is computed from public records by the rules on this page. Nothing is typed in by hand, and every row links its source.">
      <h2 id="sources">Where each number comes from</h2>
      <ul>
        <li><strong>Positions</strong>: Polymarket trades (public on the Polygon blockchain) and Kalshi&apos;s public trade feed. Each row links the transaction or the market.</li>
        <li><strong>Insider purchases and fund holdings</strong>: SEC EDGAR Form 4 and 13F filings. Each row links the filing on sec.gov.</li>
        <li><strong>Prices</strong>: the venue&apos;s own market price and price history (Polymarket&apos;s price history, Kalshi&apos;s candlesticks), and daily closing prices for stocks.</li>
        <li><strong>Results</strong>: the market&apos;s official resolution on the venue. A stock&apos;s &ldquo;price since the filing&rdquo; is its latest close against the price in the filing.</li>
      </ul>

      <h2>What counts as a large position</h2>
      <ul>
        <li><strong>Polymarket</strong>: one account&apos;s purchases of one outcome, each within {Math.round(MERGE_WINDOW_MS / 60_000)} minutes of the last, merged into one position once they add up to {dollars(WHALE_MIN_POLY)} or more.</li>
        <li><strong>Kalshi</strong>: a single trade of {dollars(WHALE_MIN_KALSHI)} or more. Kalshi trades are anonymous, so they can&apos;t be merged by account.</li>
        <li><strong>Left out as noise</strong>: prices above {Math.round(PRICE_MAX * 100)}% or below {Math.round(PRICE_MIN * 100)}%, accounts that bought both sides of a market within an hour (market makers), accounts with more than 300 trades a day, and sales (they take money out).</li>
        <li><strong>In lists</strong>, the same account on the same side of the same market within an hour shows as one row, the amounts added.</li>
      </ul>

      <h2 id="followable">Followable returns and the $100 line</h2>
      <p>A tracker&apos;s headline number answers one question: what would you have made following it on Insidir?</p>
      <ul>
        <li><strong>The price you could have followed at</strong> is the price on that side when Insidir showed the position (its &ldquo;seen price&rdquo;), plus {pts} point of slippage. For trackers whose positions join after the fact (Momentum, Early and Late positions), it&apos;s the price when the position joined.</li>
        <li><strong>Each position is ${STAKE}</strong>, held to settlement. A win pays ${STAKE} divided by that price; a loss pays nothing.</li>
        <li><strong>Followable ROI</strong> is what all those positions made, divided by the money in. The <strong>$100 line</strong> says the same in dollars: &ldquo;$100 on every position since we started tracking: $3,200 in, +$420 back.&rdquo;</li>
        <li><strong>A record needs {MIN_SETTLED} settled positions.</strong> Until then a tracker says &ldquo;Building record · N of {MIN_SETTLED}&rdquo; with the tally so far, never a return.</li>
        <li>The traders&apos; own return, from their entry prices, is shown separately and smaller. It&apos;s what they made, not what someone following them could have.</li>
      </ul>
      <p>{PAST}</p>

      <h2>What counts toward a record</h2>
      <ul>
        <li><strong>Counted</strong>: positions whose market has settled, won or lost, that Insidir showed before they settled and had a price to follow at.</li>
        <li><strong>A wallet&apos;s own record</strong> is checked against its own trades on Polymarket: sales before the result plus payouts, minus what it paid. A record shows once the wallet has {RECORD_MIN_RESOLVED} settled markets.</li>
        <li><strong>Not counted</strong>: voided markets (refunded), positions mostly sold before the result (shown as &ldquo;Closed before settlement&rdquo;), multi-leg combos, and Kalshi trades in wallet records, because Kalshi is anonymous: a new position can&apos;t be told apart from someone closing one.</li>
        <li>Losing trackers stay on the trackers list and the leaderboard. They never appear in &ldquo;Open now from winning trackers&rdquo;.</li>
      </ul>

      <h2 id="analyst-notes">Analyst notes</h2>
      <p>Every large position gets a short note, at most 3 sentences, under its headline. It describes the data; it never recommends, predicts or guesses who is behind an account.</p>
      <ul>
        <li><strong>What&apos;s computed.</strong> For each position the worker computes a facts object from Insidir&apos;s own data, in SQL: its size against the account&apos;s median and its rank among their positions this month; the account&apos;s verified record, and its record and followable ROI in this league or topic; how many proven accounts hold the same side and their combined money; the price on their side since entry; the time since the position and to the start; earlier positions in this market; and its share of the market&apos;s large-position money in 24 hours. For an insider purchase: the insider&apos;s earlier purchases at the company, how many insiders bought in 30 days, and the price since the filing.</li>
        <li><strong>Facts only.</strong> The writer sees only that facts object, never the open web. Every fact carries the link it comes from, shown under the note&apos;s Sources toggle.</li>
        <li><strong>The validator.</strong> A note is published only if every number and every name in it appears in its facts, it has at most 3 sentences, and it uses none of the banned words (advice, predictions, certainty, &ldquo;smart money&rdquo;, anything about identity). One that fails is written again once, with the problems listed; a second failure is replaced by a fixed template built from the same facts.</li>
        <li><strong>The model.</strong> Notes are written by {model} through OpenRouter, at temperature 0, under rules version {NOTE_VERSION}. Each note is stored with the facts it used, the model, the rules version and what it cost. Visitors see notes on positions 30 minutes late; members on live ones.</li>
      </ul>
      <p>Research (⌘K) follows the same rules: it reads Insidir&apos;s data through read-only tools, shows the rows themselves, and keeps its 1–2 sentences to numbers that are in those rows. If the data doesn&apos;t cover a question, it says &ldquo;Not in Insidir&apos;s data.&rdquo;</p>

      <h2>Delays</h2>
      <ul>
        <li><strong>Members</strong> see positions live: we read Polymarket and Kalshi every 15 seconds, so a position usually shows within a minute.</li>
        <li><strong>Visitors</strong> see the same data 30 minutes late, marked &ldquo;30-min delay&rdquo;.</li>
        <li><strong>Form 4</strong>: insiders have 2 business days to file; we read EDGAR every 2 minutes. <strong>13F</strong>: funds file up to 45 days after the quarter ends.</li>
        <li>Every block of numbers says when it was read (&ldquo;As of 9:41 PM ET&rdquo;) and where it came from.</li>
      </ul>

      <h2>Known limits</h2>
      <ul>
        <li>A wallet is not a person. One trader can use several wallets, and we never try to work out who is behind one.</li>
        <li>Slippage of one point is an estimate. A large follow order can move a thin market more.</li>
        <li>Seen prices before October 2026 were filled in from the venues&apos; price history at the moment Insidir showed each position. A few had no history near that moment and are left out of followable records.</li>
        <li>13F holdings are a quarter-end snapshot: not when a fund bought, what it paid, or what it has done since.</li>
        <li>It&apos;s a record of what happened, not advice. See <Link href="/disclosures">Disclosures</Link>.</li>
      </ul>
      <p>How we check every number against its source: <Link href="/data">Our data</Link>. Live health of every source: <Link href="/status">Status</Link>.</p>
    </TrustPage>
  );
}
