/* Our data (/data): every source with its live freshness ("Latest Polymarket trade seen 40s ago"), how late each can
 * be, what it can't tell you, and the history of the hourly accuracy audits (lib/status-page.ts), on the homepage's
 * system (components/TrustPage.tsx). Every claim matches what the worker actually does (worker/index.ts,
 * lib/accuracy/check.ts). */
import type { Metadata } from "next";
import Link from "next/link";
import { TrustPage } from "@/components/TrustPage";
import { COMPANY } from "@/lib/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { VISITOR_DELAY_MS } from "@/lib/millionaires/queries";
import { clockET, dateTimeET } from "@/lib/moves/copy";
import { readStatus, type Status } from "@/lib/status-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Our data", description: "Every source behind Insidir with its live freshness, how late each can be, its limits, and the hourly accuracy audits." };

export default async function DataPage() {
  const now = Date.now();
  const status = hasDatabase() ? await readStatus(getDb(), now).catch(() => null) : null as Status | null;
  return (
    <TrustPage path="/data" title="Our data" lead="Every bet, amount and record on Insidir comes from a public record.">
      {status ? <>
        <h2>Freshness, live</h2>
        <ul className="stat__list" data-testid="data-fresh">
          {status.sources.map(x => <li key={x.key} className="stat__row"><span><span className="stat__dot" aria-hidden="true" /><span className="stat__name">{x.label}</span></span><span className="stat__note">{x.lastAt ? `${x.note} (${clockET(x.lastAt)})` : x.note}</span></li>)}
        </ul>
        <p className="stat__fine">As of {clockET(now)}. Health of every job: <Link href="/status">Status</Link>.</p>
      </> : null}

      <h2>Where it comes from</h2>
      <ul>
        <li><strong>Polymarket</strong>: public trades from Polymarket&apos;s data feed, each one settled on the Polygon blockchain. A wallet is only ever its short address, never a name.</li>
        <li><strong>Kalshi</strong>: Kalshi&apos;s public market data, for the Kalshi twin of a market and its price now.</li>
      </ul>

      <h2>How late it can be</h2>
      <ul>
        <li><strong>Members</strong>: we read Polymarket every 15 seconds, so a bet usually shows within a minute.</li>
        <li><strong>Visitors</strong>: the board shows bets {Math.round(VISITOR_DELAY_MS / 60_000)} minutes after they happen, without the side.</li>
        <li>When a source is more than 5 minutes behind, the board says &ldquo;Catching up&rdquo; with the time of the last update, instead of &ldquo;Live&rdquo;.</li>
      </ul>

      <h2>What it can&apos;t tell you</h2>
      <ul>
        <li><strong>A wallet is not a person.</strong> One trader can use several wallets, and a record covers that one wallet only. We never try to work out who is behind a wallet.</li>
        <li><strong>The price you get is not theirs.</strong> By the time you see a bet, the price may have moved. Every bet page shows their price against the price now.</li>
        <li><strong>It&apos;s a record of what happened, not advice.</strong> Millionaires lose bets too: <Link href="/results">the record</Link> shows every settled result, losses included.</li>
      </ul>

      <h2 id="checks">How we verify it</h2>
      <p>Every hour we re-read random bets and wallet numbers from their sources. Anything that doesn&apos;t match is hidden until it does. Spotted something wrong? Write to <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.</p>
      {status?.checks.length ? <>
        <h3>The latest verifications</h3>
        <ul className="stat__list" data-testid="data-checks">
          {status.checks.slice(0, 24).map(c => <li key={c.runAt} className="stat__row"><span className="stat__name">{dateTimeET(c.runAt)}</span><span className="stat__note">{c.ok} of {c.checked} matched the source{c.mismatch ? `, ${c.mismatch} hidden until ${c.mismatch === 1 ? "it matches" : "they match"}` : ""}</span></li>)}
        </ul>
      </> : null}
      <p>The rules behind every number: <Link href="/methodology">Methodology</Link>.</p>
    </TrustPage>
  );
}
