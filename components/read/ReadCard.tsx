/* The Read card: one market, read at one moment.
 *   Proven money   winning trackers (which side their open positions here are on, with their record) and proven
 *                  wallets (side, dollars, all-time Polymarket profit, followable record), and the split by side. With
 *                  none: the big-money split over every tracked large position, labelled as that.
 *   Prices         YES and NO on Kalshi and Polymarket now, the cheaper one marked. In the US (or an unknown region):
 *                  Kalshi only, and no Polymarket link anywhere.
 *   Big bets       the last 24 hours (size, side, price, time), unusual ones flagged. Members only.
 *   Analyst line   one sentence on what the data shows. Members only.
 *   Millionaire    first, on Polymarket markets: open dollars by side from wallets with $1M+ all-time profit, and a
 *                  second line for $100K+ (lib/millionaire/tiers.ts). A split needs 3+ wallets; with fewer, the count
 *                  and their sides. Never who is behind a wallet.
 * Visitors see the split, the trackers and the prices (proven wallets as a count); the bets and the line are blurred behind "Start for $1", and their content
 * is never sent (the blur is drawn from nothing). Server component. */
import { ADVICE, TRIAL_LINE } from "@/lib/copy";
import { clockET, agoText } from "@/lib/moves/copy";
import { cents, pct, pricesFor, signedPct, signedUsd, UNUSUAL_TEXT, usd } from "@/lib/read/math";
import type { ReadData, SidePrices } from "@/lib/read/types";
import { ShareRead } from "./ShareRead";
import { MIN_SPLIT_WALLETS, TIER_BADGE, tierCountLine, tierOf, type TierMoney } from "@/lib/millionaire/tiers";
import { TierBadge } from "@/components/millionaire/TierBadge";

const count = (n: number, w: string) => `${n} ${n === 1 ? w : `${w}s`}`;

const k = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(v / 1e3)}K`);

/** Millionaire money: $1M+ wallets' dollars on each side with wallet counts (a split from 3+ wallets, else the count
 *  and their sides), "Pro money" ($100K+) on one line, then, for members, each $1M+ wallet's position. */
function TierSection({ tiers, yes, no, member }: { tiers: NonNullable<ReadData["tiers"]>; yes: string; no: string; member: boolean }) {
  const m = tiers.millionaire, p = tiers.pro;
  const sides = (t: TierMoney) => [t.yes.dollars > 0 ? `${usd(t.yes.dollars)} on ${yes}` : null, t.no.dollars > 0 ? `${usd(t.no.dollars)} on ${no}` : null].filter(Boolean).join(" · ");
  const rows = tiers.wallets ?? [];
  return (
    <section className="rsec rsec--lead" aria-labelledby="r-tier" data-testid="read-millionaire">
      <h2 id="r-tier" className="rsec__h">Millionaire money <details className="rinfo"><summary aria-label="What counts as millionaire money">ⓘ</summary><span className="rinfo__pop" role="note">Open positions here from Polymarket wallets whose all-time profit on Polymarket&apos;s public leaderboard is $1M or more. Pro money is $100K to $1M. A split needs {MIN_SPLIT_WALLETS} or more wallets. We never show who is behind a wallet.</span></details></h2>
      {m.wallets ? (m.yesShare !== null ? (
        <div data-testid="read-tier-millionaire">
          <Split share={m.yesShare} yes={yes} no={no} what="millionaire money"
            yesSub={m.yes.dollars > 0 ? `${usd(m.yes.dollars)} · ${count(m.yes.wallets, "wallet")}` : "None"} noSub={m.no.dollars > 0 ? `${usd(m.no.dollars)} · ${count(m.no.wallets, "wallet")}` : "None"} />
        </div>
      ) : <p className="rtier__few" data-testid="read-tier-millionaire-few"><span className="tier-badge" data-tier="millionaire">{TIER_BADGE.millionaire}</span>{tierCountLine("millionaire", m.wallets)}: {sides(m)}.</p>)
        : <p className="rsec__none" data-testid="read-millionaire-none">No $1M+ wallet holds a position here right now.</p>}
      {p.wallets ? <p className="rtier__pro" data-testid="read-tier-pro"><b>Pro money</b> <span className="tier-badge" data-tier="pro">{TIER_BADGE.pro}</span>{p.yesShare !== null ? `${sides(p)} · ${count(p.wallets, "wallet")}` : `${tierCountLine("pro", p.wallets)}: ${sides(p)}`}</p> : null}
      {rows.length && member ? (
        <ul className="rprov" data-testid="read-millionaire-wallets" aria-label="Millionaire wallets">
          {rows.map((w, i) => <li key={`${w.short}:${w.side}:${i}`} className="rprov__row" data-testid="millionaire-wallet"><span className="rprov__main"><b>{w.short}</b> · {w.pnl >= 0 ? "+" : "−"}{k(Math.abs(w.pnl))} all-time · {usd(w.dollars)} on {w.side === "yes" ? yes : no}{w.price !== null ? ` at ${cents(w.price)}` : ""}</span></li>)}
        </ul>
      ) : rows.length ? <p className="rsec__fine" data-testid="read-millionaire-locked">Members see each millionaire wallet&apos;s position, price and all-time profit.</p> : null}
    </section>
  );
}


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

function PriceRow({ label, s, us, cols }: { label: string; s: SidePrices; us: boolean; cols: ReadonlyArray<"kalshi" | "polymarket"> }) {
  const cell = (v: "kalshi" | "polymarket") => {
    const p = s[v];
    // No price for this side on a venue: an empty cell, never a dash.
    return <td key={v} className={`rprice__c${s.best === v && (!us || v === "kalshi") && p !== null ? " is-best" : ""}`} data-testid={`price-${v}`}>{p !== null ? cents(p) : null}{s.best === v && p !== null && !us ? <span className="rprice__best">Best</span> : null}</td>;
  };
  return <tr><th scope="row">{label}</th>{cols.map(cell)}</tr>;
}

/** What "proven money" means, behind an ⓘ (no paragraph on the card). */
export const PROVEN_INFO = "Open positions from trackers with 30+ settled and a positive all-time return, and from wallets with 30+ closed Polymarket markets and positive all-time profit.";

export function ReadCard({ id, data, member, us, now, startHref, level = 2, head = true }: { id: string; data: ReadData; member: boolean; us: boolean; now: number; startHref: string;
  /** The market's heading level: 2 inside a page with its own h1. */
  level?: 1 | 2;
  /** The kicker and the market's name on the card; off where the page already shows the question. */
  head?: boolean }) {
  const p = data.proven, prices = pricesFor(data.prices, us);
  const Q = level === 1 ? "h1" : "h2";
  // Venue columns that have a price on at least one side (Kalshi only in the US); none: no price section.
  const cols = (us ? (["kalshi"] as const) : (["kalshi", "polymarket"] as const)).filter(v => prices.yes[v] !== null || prices.no[v] !== null);
  const yesShare = p.yesShare, trackers = p.trackers ?? [], walletRows = p.walletRows ?? [], big = data.big ?? null;
  const open = us ? (data.kalshi?.url ? { href: data.kalshi.url, venue: "Kalshi" } : null)
    : (prices.yes.best === "kalshi" && data.kalshi?.url ? { href: data.kalshi.url, venue: "Kalshi" } : data.polymarket?.url ? { href: data.polymarket.url, venue: "Polymarket" } : data.kalshi?.url ? { href: data.kalshi.url, venue: "Kalshi" } : null);
  const sideLabel = (s: "yes" | "no") => (s === "yes" ? data.yesLabel : data.noLabel);
  return (
    <article className="rcard" data-testid="read-card">
      {head ? (
        <header className="rcard__head">
          <p className="rcard__kicker">The Read · {clockET(data.at)}</p>
          <Q className="rcard__q">{data.question}</Q>
          {data.event && data.event !== data.question ? <p className="rcard__ev">{data.event}</p> : null}
        </header>
      ) : null}

      {data.tiers ? <TierSection tiers={data.tiers} yes={data.yesLabel} no={data.noLabel} member={member} />
        : data.kalshi && !data.polymarket ? <p className="rsec__fine" data-testid="read-kalshi-only">Kalshi trades are anonymous, so there is no millionaire money here: below is what winning trackers hold.</p> : null}

      <section className="rsec" aria-labelledby="r-proven">
        <h2 id="r-proven" className="rsec__h">Proven money <details className="rinfo" data-testid="read-proven-def"><summary aria-label="What counts as proven money">ⓘ</summary><span className="rinfo__pop" role="note">{PROVEN_INFO}</span></details></h2>
        {yesShare !== null ? (
          <div data-testid="read-proven">
            <Split share={yesShare} yes={data.yesLabel} no={data.noLabel} what="proven money"
              yesSub={p.yes.dollars > 0 ? `${usd(p.yes.dollars)} · ${count(p.yes.positions ?? p.yes.wallets, "position")}` : "None"} noSub={p.no.dollars > 0 ? `${usd(p.no.dollars)} · ${count(p.no.positions ?? p.no.wallets, "position")}` : "None"} />
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
                    <span className="rprov__main"><TierBadge tier={tierOf(w.profit)} /><b>{w.wallet}</b> · {usd(w.dollars)} on {sideLabel(w.side)}</span>
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
                  yesSub={big.yes.dollars > 0 ? `${usd(big.yes.dollars)} · ${count(big.yes.positions, "position")}` : "None"} noSub={big.no.dollars > 0 ? `${usd(big.no.dollars)} · ${count(big.no.positions, "position")}` : "None"} />
              </div>
            ) : <p className="rsec__fine">No tracked large positions here either.</p>}
          </div>
        )}
      </section>

      {cols.length ? (
        <section className="rsec" aria-labelledby="r-price">
          <h2 id="r-price" className="rsec__h">Price now</h2>
          <table className="rprice" data-testid="read-prices">
            <thead><tr><th scope="col"><span className="sr-only">Side</span></th>{cols.map(v => <th key={v} scope="col">{v === "kalshi" ? "Kalshi" : "Polymarket"}</th>)}</tr></thead>
            <tbody><PriceRow label={data.yesLabel} s={prices.yes} us={us} cols={cols} /><PriceRow label={data.noLabel} s={prices.no} us={us} cols={cols} /></tbody>
          </table>
          {us ? <p className="rsec__fine">In the US we show Kalshi only.</p> : null}
        </section>
      ) : null}

      {member ? (
        <>
          {data.bets.length ? <section className="rsec" aria-labelledby="r-bets">
            <h2 id="r-bets" className="rsec__h">Big bets, last 24 hours</h2>
            {data.bets.length ? (
              <ul className="rbets" data-testid="read-bets">
                {data.bets.map((b, i) => (
                  <li key={i} className="rbet">
                    <span className="rbet__main"><TierBadge tier={b.tier ?? null} /><b>{usd(b.amount)}</b> on {sideLabel(b.side)} at {cents(b.price)}</span>
                    <span className="rbet__sub">{agoText(b.at, now)} · {b.venue === "kalshi" ? "Kalshi (anonymous)" : `Polymarket · ${b.wallet ?? "wallet"}`}</span>
                    {b.unusual.length ? <span className="rbet__flag" data-testid="bet-unusual">Unusual: {b.unusual.map(u => u === "big_for_market" && b.ofVolume !== null ? `${pct(b.ofVolume)} of the day's volume` : UNUSUAL_TEXT[u]).join(", ")}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section> : null}
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
