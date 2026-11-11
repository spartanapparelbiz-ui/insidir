/* Methodology (/methodology): how a wallet becomes Verified, read from the code that runs it (lib/verified/checks.ts:
 * MIN_PNL, MIN_SETTLED, MONTHS, MIN_GOOD_MONTHS, MAX_ONE_SHARE, HEDGE_SHARE) with today's count; what we don't do; the
 * data sources; then where every number comes from, who is on the watchlist, what counts as a bet, how a
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
import { ARB_MIN_MARKETS, ARB_SHARE, exclusions, MM_MARKETS, PROVEN_MIN_SETTLED, SCREEN_DAYS } from "@/lib/millionaires/proven";
import { MAX_TRADES_PER_DAY } from "@/lib/moves/detect";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { getDb, hasDatabase } from "@/lib/db";
import { memo } from "@/lib/memo";
import { HEDGE_SHARE, MAX_ONE_SHARE, MIN_GOOD_MONTHS, MIN_PNL, MIN_SETTLED, MONTH_MS, MONTHS } from "@/lib/verified/checks";
import { verifiedCount } from "@/lib/verified/board";

/** Every change to the Verified criteria, newest first, with its date. */
const CRITERIA_LOG: ReadonlyArray<[string, string]> = [
  ["November 11, 2026", `Verified introduced: up ${dollars(MIN_PNL)}+ all time, ${MIN_SETTLED}+ settled trades, profitable in ${MIN_GOOD_MONTHS} of the last ${MONTHS} months, no single trade over ${Math.round(MAX_ONE_SHARE * 100)}% of profit, both sides held in under ${Math.round(HEDGE_SHARE * 100)}% of markets.`],
];

export const metadata: Metadata = { title: "How a wallet becomes Verified", description: "The published criteria for Verified, what we never do, our data sources, and Where every Insidir number comes from: the watchlist, the trades, how a Polymarket market is matched to its Kalshi twin, the delays and the known limits." };

export const dynamic = "force-dynamic";

export default async function MethodologyPage() {
  const late = Math.round(VISITOR_DELAY_MS / 60_000);
  const ex = hasDatabase() ? await memo("methodology:exclusions", 5 * 60_000, () => exclusions(getDb())).catch(() => null) : null;
  const vc = hasDatabase() ? await memo("methodology:verified", 5 * 60_000, () => verifiedCount(getDb())).catch(() => null) : null;
  const days = Math.round(MONTH_MS / 86_400_000);
  return (
    <TrustPage path="/methodology" title="How a wallet becomes Verified" updated="November 11, 2026"
      lead="A wallet earns Verified only if it passes every criterion below. We test each one daily from its public record.">
      <h2 id="criteria">The criteria</h2>
      <ol data-testid="criteria">
        <li><strong>Profit</strong>: up {dollars(MIN_PNL)} or more all time on Polymarket&apos;s public leaderboard.</li>
        <li><strong>Settled trades</strong>: {MIN_SETTLED} or more settled positions.</li>
        <li><strong>Profitable months</strong>: realized profit in at least {MIN_GOOD_MONTHS} of the last {MONTHS} months, counted as {days}-day periods ending today, by the day each position closed.</li>
        <li><strong>Concentration</strong>: its single most profitable position is at most {Math.round(MAX_ONE_SHARE * 100)}% of its all-time profit.</li>
        <li><strong>No hedging</strong>: it holds both sides of the same market in under {Math.round(HEDGE_SHARE * 100)}% of the markets it traded in the last {MONTHS * days} days.</li>
      </ol>
      <p>A wallet that stops passing loses Verified the same day, and everyone following it gets a signal saying which criterion it failed. Each wallet&apos;s page shows every criterion with its numbers.{vc && vc.checked ? <span data-testid="verified-today"> Today: {vc.verified} of {vc.checked} wallets up {dollars(MIN_PNL)}+ pass.</span> : null}</p>

      <h2 id="never">What we do not do</h2>
      <ul>
        <li>We never hold funds.</li>
        <li>We never ask for API keys, wallet keys or exchange logins.</li>
        <li>We never place trades for you. You confirm every trade in your own account.</li>
      </ul>

      <h2 id="data">Data sources</h2>
      <ul>
        <li><strong>Polymarket on-chain data</strong>: every trade and position, public on the Polygon blockchain, read from Polymarket&apos;s public data.</li>
        <li><strong>Kalshi prices</strong>: Kalshi&apos;s public market data, for the same market on Kalshi.</li>
        <li><strong>SEC filings</strong>: Forms 4 and 13F from EDGAR, for the SEC pages.</li>
      </ul>
      <h2 id="sources">How every number is computed</h2>
      <ul>
        <li><strong>Trades</strong>: Polymarket trades, public on the Polygon blockchain, read from Polymarket&apos;s public data.</li>
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

      <h2 id="proven">Proven wallets</h2>
      <p>Insidir follows proven wallets only: up {dollars(MILLIONAIRE_MIN)}+ all time <em>and</em> {PROVEN_MIN_SETTLED} or more settled positions. Every day each one&apos;s last {SCREEN_DAYS} days of trades are screened, and these are left out, because they win without picking a side:</p>
      <ul>
        <li><strong>Market makers</strong>: bought both sides of the same market within an hour, in {MM_MARKETS} or more markets.</li>
        <li><strong>High-frequency accounts</strong>: {MAX_TRADES_PER_DAY} or more trades in a day.</li>
        <li><strong>Pure arbitrage</strong>: holding both sides in {Math.round(ARB_SHARE * 100)}% or more of the markets traded ({ARB_MIN_MARKETS}+ markets).</li>
      </ul>
      {ex && ex.screened ? (
        <>
          <p data-testid="proven-counts">Today: {ex.proven} proven of {ex.screened} screened. Left out: {Object.entries(ex.byReason).map(([r, n]) => `${n} ${r}`).join(", ") || "none"}.</p>
          {ex.excluded.length ? (
            <table data-testid="proven-excluded">
              <thead><tr><th scope="col">Wallet</th><th scope="col">All-time profit</th><th scope="col">Why it&apos;s left out</th></tr></thead>
              <tbody>{ex.excluded.slice(0, 60).map(e => <tr key={e.wallet}><th scope="row" className="b-num">{shortWallet(e.wallet)}</th><td className="b-num">{dollars(e.pnl)}</td><td>{e.reason === "under 30 settled" ? `Fewer than ${PROVEN_MIN_SETTLED} settled positions` : e.reason[0]!.toUpperCase() + e.reason.slice(1)}</td></tr>)}</tbody>
            </table>
          ) : null}
        </>
      ) : <p data-testid="proven-counts">The first screen is running; the list shows here once it has screened the wallets.</p>}

      <h2 id="bets">What counts as a trade</h2>
      <ul>
        <li>A watchlist wallet&apos;s purchase of {dollars(BET_MIN)} or more on one side of one market. Purchases close together are one trade.</li>
        <li>Each trade keeps the side, the size, the average price paid, the time, and the result once the market settles.</li>
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

      <h2 id="pings">Signals</h2>
      <ul>
        <li>A signal goes out when a wallet up $1M+ buys, adds to, trims or sells out of a position of $25K or more in one of your categories: at most 8 a day, never in your quiet hours.</li>
        <li><strong>Buys</strong> open a position (it held none of that side we&apos;d seen) or add to one. <strong>Sells</strong> trim it, or sell out when they sell 90% or more of what we&apos;ve seen it hold. A sale of a position we never saw it open isn&apos;t pinged: we can&apos;t tell a trim from a sale.</li>
        <li>Trims and sells are pinged only on markets with a Kalshi twin, with Kalshi&apos;s price for that side. Buys carry Kalshi&apos;s price whenever the market has one.</li>
        <li>Every buy ping on a Kalshi market is kept with Kalshi&apos;s price at that moment; <a className="s-link" href="/results">the record</a> shows how $100 at that price did, before Kalshi&apos;s fees.</li>
      </ul>

      <h2 id="delays">Delays</h2>
      <ul>
        <li><strong>Members</strong> see every trade live: Polymarket is read every 15 seconds, so a trade usually shows within a minute.</li>
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
      <p>Some trades carry a short note, at most 3 sentences. It describes the data; it never recommends, predicts or guesses who is behind a wallet. The writer sees only facts computed from Insidir&apos;s own data, and a note is published only if every number and name in it is in those facts. Notes are written by {analystModel()} at temperature 0, under rules version {NOTE_VERSION}; one that fails the check is replaced by a fixed template.</p>

      <h2 id="limits">Known limits</h2>
      <ul>
        <li>A wallet is not a person. One trader can use several wallets, and we never try to work out who is behind one.</li>
        <li>The price you get is not the price they paid: by the time you see a trade, the price may have moved.</li>
        <li>It&apos;s a record of what happened, not advice. See <Link href="/disclosures">Disclosures</Link>.</li>
      </ul>
      <p>How we test every number against its source: <Link href="/data">Our data</Link>. Live health of every source: <Link href="/status">Status</Link>.</p>

      <h2 id="changes">Criteria changes</h2>
      <ul data-testid="criteria-log">{CRITERIA_LOG.map(([d, t]) => <li key={d}><strong>{d}</strong>: {t}</li>)}</ul>
      <p data-testid="criteria-last">Criteria changes are logged here with the date.</p>
    </TrustPage>
  );
}
