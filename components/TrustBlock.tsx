/* "Why you can trust it", on home and pricing: where every number comes from, the real settled record with the odds
 * and what it made (lib/trust.ts, the same query as the top of /results), the latest accuracy check, and who builds
 * Insidir. Only facts from the database and the company's own details: no reviews, user counts or logos. */
import Link from "next/link";
import type { ReactNode } from "react";
import { SUPPORT_EMAIL } from "@/components/SiteFooter";
import { isReady } from "@/lib/features";
import { clockET, dateTimeET, signedShort } from "@/lib/moves/copy";
import type { SettledRecord, TrustFacts } from "@/lib/trust";

/** An accuracy check older than this isn't "every hour" any more: we just say when it last ran. */
export const STALE_CHECK_MS = 2 * 3_600_000;

/** "Average odds when they bet: 41%" (home and /results), and on /results only "Net for these traders: +$1.2M" with
 *  what it means. */
export function RecordLines({ r, net = false }: { r: SettledRecord; net?: boolean }) {
  return (
    <>
      {r.oddsPct !== null ? <p className="trust__p">Average entry: <b className="num">{Math.round(r.oddsPct)}%</b></p> : null}
      {net ? <>
        <p className="trust__p" data-testid="record-net">Net for these traders: <b className={`num ${r.net >= 0 ? "money" : "loss"}`}>{signedShort(r.net)}</b></p>
        <p className="trust__fine">What these positions realized, from each wallet&apos;s own trades: sales before settlement plus payouts, minus what they paid.</p>
      </> : null}
    </>
  );
}

/** "877 won, 298 lost" (and refunded, sold before the result): the same line on home and /results. */
export function RecordCount({ r }: { r: SettledRecord }) {
  const extra = [r.refunded ? `${r.refunded.toLocaleString("en-US")} voided` : null, r.soldEarly ? `${r.soldEarly.toLocaleString("en-US")} closed before settlement` : null].filter(Boolean);
  return (
    <p className="trust__big num"><span className="money">{r.won.toLocaleString("en-US")} won</span>, <span className="loss">{r.lost.toLocaleString("en-US")} lost</span>{extra.length ? <span className="trust__ref">, {extra.join(", ")}</span> : null}</p>
  );
}

/** `children`: what follows the four cards (home: links to the full pages). */
export function TrustBlock({ facts, now = Date.now(), children }: { facts: TrustFacts | null; now?: number; children?: ReactNode }) {
  const s = facts?.settled, a = facts?.accuracy;
  const fresh = a ? now - a.runAt <= STALE_CHECK_MS : false;
  return (
    <section className="sec2 trust" id="trust" aria-labelledby="trust-h">
      <div className="pg">
        <header className="sec2__head">
          <p className="sec2__label">Proof</p>
          <h2 id="trust-h" className="sec2__h">Where the data comes from</h2>
          <p className="sec2__sub">Public records only, checked against the source. Nothing typed in by hand.</p>
        </header>
        <div className="trust__grid">
          <article className="trust__card">
            <h3 className="trust__h">Public records only</h3>
            <ul className="trust__list">
              <li><b>Polymarket</b>: every trade is public on the Polygon blockchain. Each row links its transaction.</li>
              <li><b>Kalshi</b>: Kalshi&apos;s public trade feed. Trades are anonymous, so we say &quot;Anonymous&quot;. Each row links the market.</li>
              {isReady("stocks") ? <li><b>SEC EDGAR</b>: insiders&apos; Form 4 filings and funds&apos; 13F holdings. Each row links its filing.</li> : null}
            </ul>
          </article>
          <article className="trust__card" data-testid="trust-record">
            <h3 className="trust__h">The real record</h3>
            {s ? <>
              <RecordCount r={s} />
              <RecordLines r={s} />
            </> : <p className="trust__p">Positions appear in the Track record, won or lost, as their markets settle.</p>}
            <p className="trust__fine">Every settled position by the Polymarket wallets we&apos;ve shown, losses included. Not a promise.</p>
            <Link className="trust__link" href="/results">See every result</Link>
          </article>
          <article className="trust__card" data-testid="trust-check">
            <h3 className="trust__h">{fresh ? "Checked every hour" : "Accuracy check"}</h3>
            {a ? (
              <p className="trust__p">Last check {fresh ? clockET(a.runAt) : dateTimeET(a.runAt)}: <b className="num">{a.ok} of {a.checked}</b> matched.{a.hidden ? ` ${a.hidden} hidden until ${a.hidden === 1 ? "it matches" : "they match"}.` : ""}</p>
            ) : <p className="trust__p">We re-read random positions and trader stats from the source. Anything that doesn&apos;t match is hidden until it does.</p>}
            <Link className="trust__link" href="/data">How we check</Link>
          </article>
          <article className="trust__card">
            <h3 className="trust__h">Who builds it</h3>
            <p className="trust__p">Insidir is built by Aethric LLC, Pompano Beach, FL. A real person answers at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
            <p className="trust__fine">Public data. Not financial advice.</p>
          </article>
        </div>
        {children}
      </div>
    </section>
  );
}
