/* The landing for visitors: the terminal itself, simple and built to convert. Five blocks and nothing else:
 *   1. Hero      the top bar and ticker (components/terminal/Chrome.tsx), one headline, one line, the orange Start for $1,
 *                the price line, and three live proof stats (hidden when there's no real value)
 *   2. Board     the latest 8 bets from wallets up $1M+, 60 minutes late, sides locked (the lock is the reason to pay)
 *   3. What you get   before you bet · while you hold · after it settles
 *   4. Record    "What we told you": every settled $1M+ bet in 30 days, losses included, and $100 on each
 *   5. Access + FAQ   the price block with the second and last Start for $1, five questions (faqLd kept)
 * Plus the phones' sticky bar (./StickyStart.tsx), after the board and until the pricing block. Every number is live
 * (lib/brand/landing.ts, 15-second shared cache); a block with nothing real to show says so. Information, not advice. */
import "@/app/landing-terminal.css";
import { electionDay } from "@/lib/brand/pulse";
import { FAQ, LANDING, PAST, START, faqLd } from "@/lib/brand/copy";
import type { LandingData } from "@/lib/brand/landing";
import type { BoardBet } from "@/lib/millionaires/queries";
import { TIER_NAME } from "@/lib/millionaires/watchlist";
import { betPath } from "@/lib/entities/slug";
import { dollars } from "@/lib/money";
import { BrandFoot } from "../Nav";
import { PayMoments } from "../PayMoments";
import { ViewAs } from "@/components/ViewAs";
import { TerminalChrome } from "@/components/terminal/Chrome";
import { Panel } from "@/components/terminal/Panel";
import { LandingBeacons } from "./LandingBeacons";
import { StickyStart } from "./StickyStart";

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const usual = (b: BoardBet): string => (b.usual && b.usual > 0 ? `${(b.amount / b.usual).toFixed(1)}×` : "—");

function Hero({ d }: { d: LandingData }) {
  const stats = [
    d.pulse.sinceMidnight > 0 ? { v: dollars(d.pulse.sinceMidnight), k: "BET BY $1M+ WALLETS TODAY", id: "today" } : null,
    d.pulse.millionaires > 0 ? { v: d.pulse.millionaires.toLocaleString("en-US"), k: "WALLETS UP $1M+ WATCHED", id: "wallets" } : null,
    d.month ? { v: `${d.month.won}–${d.month.lost}`, k: "W–L SETTLED THIS MONTH", id: "month" } : null,
  ].filter((x): x is { v: string; k: string; id: string } => x !== null);
  return (
    <section className="t-hero" data-testid="hero" aria-labelledby="hero-h">
      <h1 id="hero-h" className="t-hero__h">{LANDING.h1}</h1>
      <p className="t-hero__sub" data-testid="hero-sub">{LANDING.sub}</p>
      <a className="t-cta t-cta--lg t-hero__go" href="/go" data-checkout="hero" data-cta="hero" data-testid="hero-start">{START} →</a>
      <p className="t-hero__price" data-testid="hero-price">{LANDING.price}</p>
      {stats.length ? (
        <dl className="t-proof" data-testid="hero-proof">
          {stats.map(s => <div key={s.id} className="t-proof__s" data-stat={s.id}><dt className="t-label">{s.k}</dt><dd className="t-kpi">{s.v}</dd></div>)}
        </dl>
      ) : null}
    </section>
  );
}

function Board({ d }: { d: LandingData }) {
  const rows = d.lead.slice(0, 8);
  return (
    <Panel n={1} title="Board · bets $5K+ from wallets up $1M+" meta={rows.length ? `${rows.length} ROWS · 60 MIN DELAY` : "60 MIN DELAY"} source="Polymarket public data" fetchedAt={d.now}
      testid="landing-board" compact empty={rows.length ? null : "No bets from wallets up $1M+ in the last day yet. They show here as they land, 60 minutes late."}>
      <div className="t-scroll">
        <table className="t-table">
          <thead><tr><th>TIME</th><th>WALLET</th><th>MARKET</th><th className="r">SIZE</th><th className="r">× USUAL</th><th>SIDE</th></tr></thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={b.id} className={i === 0 ? "t-new" : undefined} data-board-row="" data-href={betPath(b.id)} tabIndex={0} data-testid="landing-row">
                <td className="t-muted">{ET_TIME.format(new Date(b.at))}</td>
                <td><span className={`t-tier t-tier--${b.tier}`}>{TIER_NAME[b.tier].toUpperCase()}</span> {b.short}</td>
                <td className="t-ell" title={b.title}>{b.title}</td>
                <td className="r t-strong">{dollars(b.amount)}</td>
                <td className="r">{usual(b)}</td>
                <td><span className="t-lock" data-locked="side">MEMBERS</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-note">{LANDING.boardNote}</p>
    </Panel>
  );
}

function WhatYouGet() {
  return (
    <section className="t-three" data-testid="what-you-get" aria-label="What you get">
      {LANDING.three.map(x => <div key={x.k} className="t-three__c"><h2 className="t-label t-three__k">{x.k}</h2><p className="t-three__t">{x.t}</p></div>)}
    </section>
  );
}

function Record({ d }: { d: LandingData }) {
  const r = d.record30, t = r?.total, settled = t ? t.won + t.lost : 0;
  const net = r && r.net !== null ? r.net : null;
  return (
    <Panel n={2} title="Record · what we told you" meta="LAST 30 DAYS · LOSSES INCLUDED" source="Polymarket settlements" fetchedAt={d.now} testid="landing-record"
      empty={t && settled + t.void > 0 ? null : "No settled bets from wallets up $1M+ in the last 30 days yet."}>
      {t ? (
        <>
          <dl className="t-rec">
            <div><dt className="t-label">SETTLED W–L</dt><dd className="t-kpi" data-testid="record-wl">{t.won}–{t.lost}</dd></div>
            <div><dt className="t-label">VOID</dt><dd className="t-kpi">{t.void}</dd></div>
            <div><dt className="t-label">$100 ON EACH</dt>{net !== null
              ? <dd className={`t-kpi ${net >= 0 ? "t-up" : "t-down"}`} data-testid="record-net">{net >= 0 ? "+" : "−"}${Math.abs(Math.round(net)).toLocaleString("en-US")}</dd>
              : <dd className="t-kpi t-muted" data-testid="record-net">—</dd>}</div>
          </dl>
          {net === null ? <p className="t-note">The $100 line shows from 30 settled bets; {settled} so far.</p> : <p className="t-note">$100 on every settled bet at the price the wallet paid. {PAST}</p>}
          {r!.byDay.length ? (
            <div className="t-scroll">
              <table className="t-table t-table--compact">
                <thead><tr><th>DAY (ET)</th><th className="r">WON</th><th className="r">LOST</th><th className="r">VOID</th></tr></thead>
                <tbody>{r!.byDay.slice(0, 5).map(x => <tr key={x.day}><td>{x.day}</td><td className="r t-up">{x.won}</td><td className="r t-down">{x.lost}</td><td className="r t-muted">{x.void}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
          <p className="t-note"><a className="t-link" href="/results">Every settled bet, losses included →</a></p>
        </>
      ) : null}
    </Panel>
  );
}

function Access() {
  return (
    <section id="pricing" className="t-access" data-testid="pricing" aria-labelledby="price-h">
      <div className="t-access__l">
        <h2 id="price-h" className="t-label">ACCESS</h2>
        <p className="t-access__p" data-testid="price-line">{LANDING.access}</p>
      </div>
      <a className="t-cta t-cta--lg" href="/go" data-checkout="pricing" data-cta="pricing" data-testid="pricing-cta">{START} →</a>
    </section>
  );
}

function Faqs() {
  return (
    <section id="faq" className="t-faq" data-testid="faq" aria-labelledby="faq-h">
      <h2 id="faq-h" className="t-label">FAQ</h2>
      <dl>
        {FAQ.slice(0, 5).map(f => (
          <div key={f.id} className="t-faq__i" data-testid="faq-item"><dt>{f.q}</dt><dd>{f.a}</dd></div>
        ))}
      </dl>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd() }} />
    </section>
  );
}

/** The landing: five blocks, in one response. */
export function Landing({ d }: { d: LandingData }) {
  return (
    <>
    <ViewAs />
    <main className="b-root t-landing" data-testid="landing">
      <TerminalChrome start={false} election={electionDay(d.now)} />
      <div className="t-wrap t-land">
        <Hero d={d} />
        <Board d={d} />
        <WhatYouGet />
        <Record d={d} />
        <Access />
        <Faqs />
      </div>
      <BrandFoot inline />
      {d.member ? null : <StickyStart />}
      {d.member ? null : <PayMoments ctx={{ count: d.pulse.count, window: d.pulse.window, biggest: d.biggest, today: d.pulse.countToday }} now={d.now} />}
      <LandingBeacons />
    </main>
    </>
  );
}
