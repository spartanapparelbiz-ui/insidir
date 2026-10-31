/* Our data (/data): every source with its live freshness ("Latest Polymarket trade seen 40s ago"), how late each
 * can be, what it can't tell you, and the history of the hourly accuracy checks (lib/status-page.ts). Linked from the
 * footer and from every profile. Every claim matches what the worker actually does (worker/index.ts,
 * lib/accuracy/check.ts). */
import type { Metadata } from "next";
import Link from "next/link";
import { PageBand } from "@/components/PageBand";
import { SiteHeader } from "@/components/SiteHeader";
import { SUPPORT_EMAIL } from "@/components/SiteFooter";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { clockET, dateTimeET } from "@/lib/moves/copy";
import { readStatus, type Status } from "@/lib/status-page";
import { BAND } from "@/lib/photos";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Our data", description: "Every source behind Insidir with its live freshness, how late each can be, its limits, and the hourly accuracy checks." };

export default async function DataPage() {
  const now = Date.now();
  const [viewer, status] = await Promise.all([getViewer(), hasDatabase() ? readStatus(getDb(), now).catch(() => null) : Promise.resolve<Status | null>(null)]);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/data" tone="light" />
      <main className="wrap lp">
        <PageBand n={BAND.about} title="Our data" />
        <article className="lp-legal lp-about">
          <p className="lp-about__lead">Every position, amount and record on Insidir comes from a public record, and every card links to it under &ldquo;Where this comes from&rdquo;.</p>

          {status ? <>
            <h2>Freshness, live</h2>
            <ul className="stat__list" data-testid="data-fresh">
              {status.sources.map(x => <li key={x.key} className="stat__row"><span className={`stat__dot stat__dot--${x.light}`} aria-hidden="true" /><span className="stat__name">{x.label}</span><span className="stat__note">{x.lastAt ? `${x.note.replace("Latest seen", "Latest seen")} (${clockET(x.lastAt)})` : x.note}</span></li>)}
            </ul>
            <p className="stat__fine">As of {clockET(now)}. Health of every job: <Link href="/status">Status</Link>.</p>
          </> : null}

          <h2>Where it comes from</h2>
          <ul>
            <li><strong>Polymarket</strong>: public trades from Polymarket&apos;s data feed, each one settled on the Polygon blockchain. A card links the transaction on Polygonscan; a profile links the wallet. We name a wallet by its public Polymarket username, or a short address when it has none.</li>
            <li><strong>Kalshi</strong>: Kalshi&apos;s public trade feed. Kalshi trades carry no name or account, so a Kalshi card says &ldquo;Anonymous&rdquo; and links Kalshi&apos;s own record of that trade.</li>
            <li><strong>SEC EDGAR</strong>: Form 4 filings, where a company&apos;s officers, directors and 10% owners report buying or selling its stock, and Form 13F filings, where big funds report what they held at the end of each quarter. A stock card links the filing on sec.gov.</li>
          </ul>

          <h2>How late it can be</h2>
          <ul>
            <li><strong>Polymarket and Kalshi</strong>: we check every 15 seconds, so a large position usually shows within a minute. The public preview on our home page shows positions 30 minutes after they happen.</li>
            <li><strong>Form 4 (insider trades)</strong>: insiders have up to 2 business days after a trade to file. We check EDGAR every 2 minutes, so a card shows both dates: the day they traded and the day they filed.</li>
            <li><strong>13F (fund holdings)</strong>: funds file up to 45 days after the quarter ends, so a 13F card can describe holdings more than six weeks old. Each card says which quarter it covers and the day it was filed, for example &ldquo;Q3 2026 holdings · filed Nov 14&rdquo;.</li>
            <li>When a source is more than 5 minutes behind, the feed says &ldquo;Catching up&rdquo; with the time of the last update, instead of &ldquo;Live&rdquo;.</li>
          </ul>

          <h2>What it can&apos;t tell you</h2>
          <ul>
            <li><strong>A wallet is not a person.</strong> One trader can use several wallets, and a record covers that one wallet only. We never try to work out who is behind a wallet, and we call it a wallet, never an insider.</li>
            <li><strong>Records start at 20 settled markets.</strong> A wallet&apos;s win rate and net P&L come from the markets it has positions in that have settled; before 20, we don&apos;t show a record.</li>
            <li><strong>Form 4 cards are open-market buys of stock.</strong> Option grants, gifts and planned sales are left out.</li>
            <li><strong>13F shows a snapshot.</strong> It lists long US stock positions at the end of the quarter, not when the fund bought, what it paid, or what it has done since.</li>
            <li><strong>It&apos;s a record of what happened, not advice.</strong> Large positions lose too: the <Link href="/results">Track record</Link> page shows every settled position, losses included.</li>
          </ul>

          <h2>How we check it</h2>
          <p>Every hour we re-read 20 random positions and 20 profile numbers from their sources. Anything that doesn&apos;t match is hidden until it does, and we get an email. Spotted something wrong? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
          {status?.checks.length ? <>
            <h3>The last checks</h3>
            <ul className="stat__list" data-testid="data-checks">
              {status.checks.slice(0, 24).map(c => <li key={c.runAt} className="stat__row"><span className={`stat__dot stat__dot--${c.mismatch ? "amber" : "green"}`} aria-hidden="true" /><span className="stat__name">{dateTimeET(c.runAt)}</span><span className="stat__note">{c.ok} of {c.checked} matched the source{c.mismatch ? `, ${c.mismatch} hidden until ${c.mismatch === 1 ? "it matches" : "they match"}` : ""}</span></li>)}
            </ul>
          </> : null}
          <p>The rules behind every number: <Link href="/methodology">Methodology</Link>.</p>
        </article>
        <div className="lp-legal__next">
          <Link className="btn btn--primary" href="/start">Start your 7-day trial</Link>
        </div>
      </main>
    </>
  );
}
