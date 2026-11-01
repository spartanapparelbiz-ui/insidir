/* The Read card: one market, read at one moment.
 *   Proven money   winning trackers (which side their open positions here are on, with their record) and proven
 *                  wallets (side, dollars, all-time Polymarket profit, followable record), and the split by side. With
 *                  none: the big-money split over every tracked large position, labelled as that.
 *   Prices         YES and NO on Kalshi and Polymarket now, the cheaper one marked. In the US (or an unknown region):
 *                  Kalshi only, and no Polymarket link anywhere.
 *   Big bets       the last 24 hours (size, side, price, time), unusual ones flagged. Members only.
 *   Analyst line   one sentence on what the data shows. Members only.
 * Visitors see the split, the trackers and the prices (proven wallets as a count); the bets and the line are blurred behind "Start for $1", and their content
 * is never sent (the blur is drawn from nothing). Server component. */
import { ADVICE, TRIAL_LINE } from "@/lib/copy";
import { clockET, agoText } from "@/lib/moves/copy";
import { cents, pct, pricesFor, signedPct, signedUsd, UNUSUAL_TEXT, usd } from "@/lib/read/math";
import type { ReadData, SidePrices } from "@/lib/read/types";
import { ShareRead } from "./ShareRead";

const count = (n: number, w: string) => `${n} ${n === 1 ? w : `${w}s`}`;

function Split({ share, yes, no, what, yesSub, noSub }: { share: number; yes: string; no: string; what: string; yesSub: string; noSub: string }) {
  return (
    <>
      <div className="rsplit" role="img" aria-label={`${pct(share)} of ${what} on ${yes}, ${pct(1 - share)} on ${no}`}>
        <span className="rsplit__yes" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <dl className="rsplit__legend">
        <div><dt>{yes}</dt><dd><b>{pct(share)}</b> · {yesSub}</dd></div>
        <div><dt>{no}</dt><dd><b>{pct(1 - share)}</b> · {noSub}</dd></div>
      </dl>
    </>
  );
}

function PriceRow({ label, s, us }: { label: string; s: SidePrices; us: boolean }) {
  const cell = (v: "kalshi" | "polymarket") => {
    const p = s[v];
    return <td className={`rprice__c${s.best === v && (!us || v === "kalshi") && p !== null ? " is-best" : ""}`} data-testid={`price-${v}`}>{cents(p)}{s.best === v && p !== null && !us ? <span className="rprice__best">Best</span> : null}</td>;
  };
  return <tr><th scope="row">{label}</th>{cell("kalshi")}{us ? null : cell("polymarket")}</tr>;
}

export function ReadCard({ id, data, member, us, now, startHref }: { id: string; data: ReadData; member: boolean; us: boolean; now: number; startHref: string }) {
  const p = data.proven, prices = pricesFor(data.prices, us);
  const yesShare = p.yesShare, trackers = p.trackers ?? [], walletRows = p.walletRows ?? [], big = data.big ?? null;
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
        <p className="rsec__fine" data-testid="read-proven-def">Open positions from trackers with 30+ settled and a positive all-time return, and from wallets with 30+ closed Polymarket markets and positive all-time profit.</p>
        {yesShare !== null ? (
          <div data-testid="read-proven">
            <Split share={yesShare} yes={data.yesLabel} no={data.noLabel} what="proven money"
              yesSub={`${usd(p.yes.dollars)} · ${count(p.yes.positions ?? p.yes.wallets, "position")}`} noSub={`${usd(p.no.dollars)} · ${count(p.no.positions ?? p.no.wallets, "position")}`} />
            {trackers.length ? (
              <ul className="rprov" data-testid="read-trackers" aria-label="Winning trackers">
                {trackers.map(t => (
                  <li key={t.slug} className="rprov__row" data-testid="proven-tracker">
                    <span className="rprov__main"><a href={`/trackers/${t.slug}`}>{t.name}</a> · {signedPct(t.returnPct)} over {t.settled} settled · on {t.sides.map(x => sideLabel(x.side)).join(" and ")}</span>
                    <span className="rprov__sub">{t.sides.map(x => `${sideLabel(x.side)}: ${usd(x.dollars)} in ${count(x.positions, "position")}`).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {walletRows.length && !member ? (
              <p className="rsec__fine" data-testid="read-wallets-locked">{count(p.wallets, "proven wallet")} in it. Members see each one&apos;s side, dollars and record.</p>
            ) : null}
            {walletRows.length && member ? (
              <ul className="rprov" data-testid="read-wallets" aria-label="Proven wallets">
                {walletRows.map((w, i) => (
                  <li key={`${w.wallet}:${w.side}:${i}`} className="rprov__row" data-testid="proven-wallet">
                    <span className="rprov__main"><b>{w.wallet}</b> · {usd(w.dollars)} on {sideLabel(w.side)}</span>
                    <span className="rprov__sub">{[
                      w.profit !== null ? `${signedUsd(w.profit)} all-time on Polymarket over ${(w.closed ?? 0).toLocaleString("en-US")}${w.closedAtLeast ? "+" : ""} closed markets` : null,
                      w.follow ? `${signedPct(w.follow.returnPct)} followed over ${w.follow.settled} settled` : null,
                    ].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div data-testid="read-proven-none">
            <p className="rsec__none">No proven money holds a position here right now.</p>
            {big && big.yesShare !== null ? (
              <div className="rbig" data-testid="read-big-split">
                <h3 className="rsec__h">Big-money split · every tracked large position, not only proven</h3>
                <Split share={big.yesShare} yes={data.yesLabel} no={data.noLabel} what="big money"
                  yesSub={`${usd(big.yes.dollars)} · ${count(big.yes.positions, "position")}`} noSub={`${usd(big.no.dollars)} · ${count(big.no.positions, "position")}`} />
              </div>
            ) : <p className="rsec__fine">No tracked large positions here either.</p>}
          </div>
        )}
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
            <p className="rlock__fine">{TRIAL_LINE}, then $39/month. Cancel anytime.</p>
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
