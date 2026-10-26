/* "Why you can trust it", on home and pricing: where every number comes from, the real settled record, the latest
 * hourly accuracy check, and who builds Insidir. Only facts from the database and the company's own details: no
 * reviews, user counts or logos. Server component. */
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/components/SiteFooter";
import { isReady } from "@/lib/features";
import { clockET } from "@/lib/moves/copy";
import type { TrustFacts } from "@/lib/trust";

export function TrustBlock({ facts }: { facts: TrustFacts | null }) {
  const s = facts?.settled, a = facts?.accuracy;
  return (
    <section className="sec2 trust" id="trust" aria-labelledby="trust-h">
      <div className="wrap">
        <h2 id="trust-h" className="sec2__h">Where the data comes from</h2>
        <div className="trust__grid">
          <article className="trust__card">
            <h3 className="trust__h">Public records only</h3>
            <ul className="trust__list">
              <li><b>Polymarket</b>: every trade is public on the Polygon blockchain. Each card links its transaction.</li>
              <li><b>Kalshi</b>: Kalshi&apos;s public trade feed. Trades are anonymous, so we say &quot;Someone&quot;.</li>
              {isReady("stocks") ? <li><b>SEC EDGAR</b>: insiders&apos; Form 4 filings and funds&apos; 13F holdings. Each card links its filing.</li> : null}
            </ul>
          </article>
          <article className="trust__card">
            <h3 className="trust__h">The real record</h3>
            {s ? (
              <p className="trust__big"><span className="money">{s.won.toLocaleString("en-US")} won</span>, <span className="loss">{s.lost.toLocaleString("en-US")} lost</span>{s.refunded ? `, ${s.refunded.toLocaleString("en-US")} refunded` : ""}</p>
            ) : <p className="trust__p">Moves show up on Results, won or lost, as their markets settle.</p>}
            <p className="trust__p">Every settled move we&apos;ve shown, losses included. Not a promise.</p>
            <Link className="trust__link" href="/results">See every result</Link>
          </article>
          <article className="trust__card">
            <h3 className="trust__h">Checked every hour</h3>
            {a ? <p className="trust__big">{a.ok} of {a.checked} matched</p> : null}
            <p className="trust__p">{a ? `At ${clockET(a.runAt)} we re-read random moves and trader stats from the source. ` : "Every hour we re-read random moves and trader stats from the source. "}Anything that doesn&apos;t match is hidden until it does.</p>
          </article>
          <article className="trust__card">
            <h3 className="trust__h">Who builds it</h3>
            <p className="trust__p">Insidir is built by Aethric LLC, Pompano Beach, FL. A real person answers at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
            <p className="trust__p">Public data. Not financial advice.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
