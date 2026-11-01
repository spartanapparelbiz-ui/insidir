/* The Read card: one market, read at one moment.
 *   Proven money   the share of proven wallets' dollars on each side, and how many wallets.
 *   Prices         YES and NO on Kalshi and Polymarket now, the cheaper one marked. In the US (or an unknown region):
 *                  Kalshi only, and no Polymarket link anywhere.
 *   Big bets       the last 24 hours (size, side, price, time), unusual ones flagged. Members only.
 *   Analyst line   one sentence on what the data shows. Members only.
 * Visitors see the split and the prices; the bets and the line are blurred behind "Start for $1", and their content
 * is never sent (the blur is drawn from nothing). Server component. */
import { ADVICE } from "@/lib/copy";
import { clockET, agoText } from "@/lib/moves/copy";
import { cents, pct, pricesFor, UNUSUAL_TEXT, usd } from "@/lib/read/math";
import type { ReadData, SidePrices } from "@/lib/read/types";
import { ShareRead } from "./ShareRead";

function PriceRow({ label, s, us }: { label: string; s: SidePrices; us: boolean }) {
  const cell = (v: "kalshi" | "polymarket") => {
    const p = s[v];
    return <td className={`rprice__c${s.best === v && (!us || v === "kalshi") && p !== null ? " is-best" : ""}`} data-testid={`price-${v}`}>{cents(p)}{s.best === v && p !== null && !us ? <span className="rprice__best">Best</span> : null}</td>;
  };
  return <tr><th scope="row">{label}</th>{cell("kalshi")}{us ? null : cell("polymarket")}</tr>;
}

export function ReadCard({ id, data, member, us, now, startHref }: { id: string; data: ReadData; member: boolean; us: boolean; now: number; startHref: string }) {
  const p = data.proven, prices = pricesFor(data.prices, us);
  const yesShare = p.yesShare;
  const open = us ? (data.kalshi?.url ? { href: data.kalshi.url, venue: "Kalshi" } : null)
    : (prices.yes.best === "kalshi" && data.kalshi?.url ? { href: data.kalshi.url, venue: "Kalshi" } : data.polymarket?.url ? { href: data.polymarket.url, venue: "Polymarket" } : data.kalshi?.url ? { href: data.kalshi.url, venue: "Kalshi" } : null);
  const sideLabel = (s: "yes" | "no") => (s === "yes" ? data.yesLabel : data.noLabel);
  return (
    <article className="rcard" data-testid="read-card">
      <header className="rcard__head">
        <p className="rcard__kicker">The Read · {clockET(data.at)}</p>
        <h1 className="rcard__q">{data.question}</h1>
        {data.event && data.event !== data.question ? <p className="rcard__ev">{data.event}</p> : null}
      </header>

      <section className="rsec" aria-labelledby="r-proven">
        <h2 id="r-proven" className="rsec__h">Proven money</h2>
        {yesShare !== null ? (
          <div data-testid="read-proven">
            <div className="rsplit" role="img" aria-label={`${pct(yesShare)} of proven money on ${data.yesLabel}, ${pct(1 - yesShare)} on ${data.noLabel}`}>
              <span className="rsplit__yes" style={{ width: `${Math.round(yesShare * 100)}%` }} />
            </div>
            <dl className="rsplit__legend">
              <div><dt>{data.yesLabel}</dt><dd><b>{pct(yesShare)}</b> · {usd(p.yes.dollars)} · {p.yes.wallets} {p.yes.wallets === 1 ? "wallet" : "wallets"}</dd></div>
              <div><dt>{data.noLabel}</dt><dd><b>{pct(1 - yesShare)}</b> · {usd(p.no.dollars)} · {p.no.wallets} {p.no.wallets === 1 ? "wallet" : "wallets"}</dd></div>
            </dl>
            <p className="rsec__fine">{p.wallets} proven {p.wallets === 1 ? "wallet" : "wallets"}: 30+ settled positions and a positive followable return. Open positions only.</p>
          </div>
        ) : <p className="rsec__none" data-testid="read-proven-none">No proven wallet holds a position here right now.</p>}
      </section>

      <section className="rsec" aria-labelledby="r-price">
        <h2 id="r-price" className="rsec__h">Price now</h2>
        <table className="rprice" data-testid="read-prices">
          <thead><tr><th scope="col"><span className="sr-only">Side</span></th><th scope="col">Kalshi</th>{us ? null : <th scope="col">Polymarket</th>}</tr></thead>
          <tbody><PriceRow label={data.yesLabel} s={prices.yes} us={us} /><PriceRow label={data.noLabel} s={prices.no} us={us} /></tbody>
        </table>
        {us ? <p className="rsec__fine">In the US we show Kalshi only.</p> : null}
      </section>

      {member ? (
        <>
          <section className="rsec" aria-labelledby="r-bets">
            <h2 id="r-bets" className="rsec__h">Big bets, last 24 hours</h2>
            {data.bets.length ? (
              <ul className="rbets" data-testid="read-bets">
                {data.bets.map((b, i) => (
                  <li key={i} className="rbet">
                    <span className="rbet__main"><b>{usd(b.amount)}</b> on {sideLabel(b.side)} at {cents(b.price)}</span>
                    <span className="rbet__sub">{agoText(b.at, now)} · {b.venue === "kalshi" ? "Kalshi (anonymous)" : `Polymarket · ${b.wallet ?? "wallet"}`}</span>
                    {b.unusual.length ? <span className="rbet__flag" data-testid="bet-unusual">Unusual: {b.unusual.map(u => u === "big_for_market" && b.ofVolume !== null ? `${pct(b.ofVolume)} of the day's volume` : UNUSUAL_TEXT[u]).join(", ")}</span> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="rsec__none">No big bets in the last 24 hours.</p>}
          </section>
          <section className="rsec" aria-labelledby="r-line">
            <h2 id="r-line" className="rsec__h">Analyst line</h2>
            {data.line ? <p className="rline" data-testid="read-line">{data.line.text}</p> : <p className="rsec__none">No line for this Read.</p>}
            <p className="rsec__fine">It describes the data. It isn&apos;t advice.</p>
          </section>
        </>
      ) : (
        <section className="rlock" aria-label="Members only" data-testid="read-locked">
          <div className="rlock__blur" aria-hidden="true">
            <p className="rsec__h">Big bets, last 24 hours</p>
            {[0, 1, 2].map(i => <span key={i} className="rlock__bar" />)}
            <p className="rsec__h">Analyst line</p>
            <span className="rlock__bar rlock__bar--long" />
          </div>
          <div className="rlock__over">
            <p className="rlock__h">{data.bets.length ? `${data.bets.length} big ${data.bets.length === 1 ? "bet" : "bets"} in the last 24 hours, and the analyst line` : "The big bets and the analyst line"}</p>
            <a className="btn btn--primary" href={startHref} data-checkout="read-members">Start for $1</a>
            <p className="rlock__fine">$1 for your first week, then $39/month. Cancel anytime.</p>
          </div>
        </section>
      )}

      <footer className="rcard__acts">
        {open ? <a className="btn btn--primary" href={open.href} target="_blank" rel="noopener noreferrer" data-testid="read-open">Open on {open.venue}</a>
          : <span className="rcard__none" data-testid="read-open-none">{us ? "Not on Kalshi" : "No link"}</span>}
        <ShareRead id={id} />
      </footer>
      <p className="rsec__fine" data-testid="read-advice">{ADVICE} Public data from Polymarket and Kalshi.</p>
    </article>
  );
}
