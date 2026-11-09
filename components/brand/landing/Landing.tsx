/* The landing for visitors: clean, on the brand board (Garnished & Tarnished Blue, Perplexed Scrutiny Azure,
 * Scornelius Pampered Yellow). One story, top to bottom:
 *   1. Hero      a live line, the headline, one line, the Yellow Start for $1, the price; the brand glow arcs, and the
 *                product itself in a phone: the latest bets from $1M+ wallets, 60 minutes late, sides locked
 *   2. Proof     three live numbers (hidden when there's no real value)
 *   3. Board     the latest 8 bets, 60 minutes late, sides locked (the lock is the reason to pay)
 *   4. What you get   three soft-gradient tiles: before you bet · while you hold · after it settles
 *   5. Record    what we told you: settled bets in 30 days, losses included, and $100 on each
 *   6. Access    the price on the glow, with the second and last Start for $1; then five questions (faqLd kept)
 * Plus the phones' sticky bar (./StickyStart.tsx) after the board until the price, and the top bar's Start for $1 once
 * the hero's button has scrolled away. Blocks rise in and numbers count up as they scroll in (./Reveal.tsx); nothing
 * moves under reduced motion. Every number is live (lib/brand/landing.ts, 15-second shared cache); a block with
 * nothing real to show says so. Information, not advice. */
import "@/app/landing-clean.css";
import type { CSSProperties } from "react";
import { electionDay } from "@/lib/brand/pulse";
import { FAQ, LANDING, PAST, START, faqLd } from "@/lib/brand/copy";
import type { LandingData } from "@/lib/brand/landing";
import type { BoardBet } from "@/lib/millionaires/queries";
import { TIER_NAME } from "@/lib/millionaires/watchlist";
import { betPath } from "@/lib/entities/slug";
import { dollars } from "@/lib/money";
import { BrandFoot } from "../Nav";
import { Mark } from "../Bits";
import { ViewAs } from "@/components/ViewAs";
import { TerminalChrome } from "@/components/terminal/Chrome";
import { LandingBeacons } from "./LandingBeacons";
import { StickyStart } from "./StickyStart";
import { Reveal } from "./Reveal";

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
const usual = (b: BoardBet): string | null => (b.usual && b.usual > 0 ? `${(b.amount / b.usual).toFixed(1)}×` : null);
const i = (n: number) => ({ "--i": n }) as CSSProperties;

const Lock = () => <svg className="c-lock" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>;

/** The glow: concentric arcs over a soft wash of Azure into Yellow (the brand board's covers). Decorative. */
const Glow = ({ className = "", drift = false }: { className?: string; drift?: boolean }) => (
  <div className={`c-glow ${className}`} aria-hidden="true" data-drift={drift ? "" : undefined}>
    <span className="c-glow__ring c-glow__ring--1" /><span className="c-glow__ring c-glow__ring--2" /><span className="c-glow__ring c-glow__ring--3" />
  </div>
);

function Phone({ d }: { d: LandingData }) {
  const rows = d.lead.slice(0, 5);
  return (
    <div className="c-phone" aria-label="Insidir on a phone: the latest bets from $1M+ wallets">
      <div className="c-phone__notch" aria-hidden="true" />
      <div className="c-phone__top"><span className="c-phone__mark"><Mark /></span><span>Insidir</span><span className="c-phone__delay">60 min delay</span></div>
      <p className="c-phone__h">Latest from $1M+ wallets</p>
      {rows.length ? rows.map(b => (
        <div key={b.id} className="c-phone__row">
          <div className="c-phone__l"><span className={`c-tier c-tier--${b.tier}`}>{TIER_NAME[b.tier]}</span><span className="c-phone__t">{b.title}</span></div>
          <div className="c-phone__r"><b>{dollars(b.amount)}</b><span className="c-phone__side"><Lock />Side</span></div>
        </div>
      )) : <p className="c-phone__empty">The next bet shows here the moment it lands.</p>}
      <p className="c-phone__foot"><span>Members see every side, live.</span><span>Bet Briefing →</span></p>
    </div>
  );
}

function Hero({ d }: { d: LandingData }) {
  const live = d.pulse.count > 0 ? `${d.pulse.count.toLocaleString("en-US")} ${d.pulse.count === 1 ? "bet" : "bets"} from $1M+ wallets ${d.pulse.window === "hour" ? "in the last hour" : "today"}` : null;
  return (
    <section className="c-hero" data-testid="hero" aria-labelledby="hero-h">
      <Glow className="c-glow--hero" drift />
      <div className="c-hero__in">
        <div className="c-hero__copy">
          {live ? <p className="c-eyebrow" data-testid="hero-live"><span className="c-dot" aria-hidden="true" />{live}</p> : null}
          <h1 id="hero-h" className="c-hero__h">{LANDING.h1}</h1>
          <p className="c-hero__sub" data-testid="hero-sub">{LANDING.sub}</p>
          <div className="c-hero__act">
            <a className="t-cta t-cta--lg c-cta" href="/go" data-checkout="hero" data-cta="hero" data-testid="hero-start">{START}<span aria-hidden="true">→</span></a>
            <p className="c-hero__price" data-testid="hero-price">{LANDING.priceLine}</p>
          </div>
        </div>
        <div className="c-hero__art"><Phone d={d} /></div>
      </div>
    </section>
  );
}

function Proof({ d }: { d: LandingData }) {
  const stats = [
    d.pulse.sinceMidnight > 0 ? { v: dollars(d.pulse.sinceMidnight), k: "bet by $1M+ wallets today", id: "today" } : null,
    d.pulse.millionaires > 0 ? { v: d.pulse.millionaires.toLocaleString("en-US"), k: "wallets up $1M+, watched", id: "wallets" } : null,
    d.month ? { v: `${d.month.won}–${d.month.lost}`, k: "won–lost, settled this month", id: "month" } : null,
  ].filter((x): x is { v: string; k: string; id: string } => x !== null);
  if (!stats.length) return null;
  return (
    <dl className="c-proof" data-testid="hero-proof">
      {stats.map((s, n) => <div key={s.id} className="c-proof__s" data-stat={s.id} data-reveal="" style={i(n)}><dd className="c-proof__v" data-count={s.v}>{s.v}</dd><dt className="c-proof__k">{s.k}</dt></div>)}
    </dl>
  );
}

function Board({ d }: { d: LandingData }) {
  const rows = d.lead.slice(0, 8);
  return (
    <section className="c-sec" data-testid="landing-board" aria-labelledby="board-h">
      <div className="c-sec__head" data-reveal="">
        <h2 id="board-h" className="c-h2">The latest bets from $1M+ wallets.</h2>
        <p className="c-sec__sub">Every Polymarket bet of $5K+, here 60 minutes late. Members see each one the minute it lands, with the side.</p>
      </div>
      {rows.length ? (
        <div className="c-card c-list" data-reveal="">
          {rows.map((b, n) => (
            <div key={b.id} className="c-row" data-board-row="" data-href={betPath(b.id)} tabIndex={0} role="link" data-testid="landing-row" data-reveal="" style={i(n)}>
              <span className="c-row__time">{ET_TIME.format(new Date(b.at))}</span>
              <span className="c-row__who"><span className={`c-tier c-tier--${b.tier}`}>{TIER_NAME[b.tier]}</span><span className="c-addr">{b.short}</span></span>
              <span className="c-row__t" title={b.title}>{b.title}</span>
              <span className="c-row__amt">{dollars(b.amount)}{usual(b) ? <small> · {usual(b)} usual</small> : null}</span>
              <span className="c-row__side" data-locked="side"><Lock />Members</span>
            </div>
          ))}
        </div>
      ) : <div className="c-card c-empty">No bets from wallets up $1M+ in the last day yet. They show here as they land, 60 minutes late.</div>}
      <p className="c-note">Source: Polymarket public data. {LANDING.boardNote}</p>
    </section>
  );
}

function WhatYouGet() {
  return (
    <section className="c-sec" aria-labelledby="get-h">
      <div className="c-sec__head" data-reveal=""><h2 id="get-h" className="c-h2">Before, during and after every bet.</h2></div>
      <div className="c-tiles" data-testid="what-you-get">
        {LANDING.three.map((x, n) => (
          <div key={x.k} className={`c-tile c-tile--${n + 1}`} data-reveal="" style={i(n)}>
            <span className="c-tile__n">0{n + 1}</span>
            <h3 className="c-tile__k">{x.title}</h3>
            <p className="c-tile__t">{x.t}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Record({ d }: { d: LandingData }) {
  const r = d.record30, t = r?.total, settled = t ? t.won + t.lost : 0;
  const net = r && r.net !== null ? r.net : null;
  return (
    <section className="c-sec" data-testid="landing-record" aria-labelledby="rec-h">
      <div className="c-sec__head" data-reveal="">
        <h2 id="rec-h" className="c-h2">What we told you, losses included.</h2>
        <p className="c-sec__sub">Every bet from $1M+ wallets that settled in the last 30 days.</p>
      </div>
      {t && settled + t.void > 0 ? (
        <div className="c-card c-rec" data-reveal="">
          <div className="c-rec__s"><span className="c-rec__v" data-testid="record-wl" data-count={`${t.won}–${t.lost}`}>{t.won}–{t.lost}</span><span className="c-rec__k">won–lost</span></div>
          <div className="c-rec__s"><span className={`c-rec__v ${net === null ? "" : net >= 0 ? "t-up" : "t-down"}`} data-testid="record-net">{net === null ? "—" : `${net >= 0 ? "+" : "−"}$${Math.abs(Math.round(net)).toLocaleString("en-US")}`}</span><span className="c-rec__k">$100 on each</span></div>
          <div className="c-rec__s"><span className="c-rec__v">{t.void}</span><span className="c-rec__k">voided</span></div>
          <p className="c-rec__note">{net === null ? `The $100 line shows from 30 settled bets; ${settled} so far.` : `$100 on every settled bet at the price the wallet paid. ${PAST}`} <a className="c-link" href="/results">Every settled bet →</a></p>
        </div>
      ) : <div className="c-card c-empty" data-reveal="">No settled bets from wallets up $1M+ in the last 30 days yet. <a className="c-link" href="/results">The full record →</a></div>}
    </section>
  );
}

function Access() {
  return (
    <section id="pricing" className="c-price" data-testid="pricing" aria-labelledby="price-h" data-reveal="">
      <Glow className="c-glow--price" />
      <div className="c-price__in">
        <p className="c-eyebrow c-eyebrow--quiet">One plan</p>
        <h2 id="price-h" className="c-price__h"><span className="c-price__big">$1</span> for your first 3 days.</h2>
        <p className="c-price__line" data-testid="price-line">{LANDING.priceLine}</p>
        <ul className="c-price__list">{LANDING.gets.map(g => <li key={g}>{g}</li>)}</ul>
        <a className="t-cta t-cta--lg c-cta" href="/go" data-checkout="pricing" data-cta="pricing" data-testid="pricing-cta">{START}<span aria-hidden="true">→</span></a>
        <p className="c-price__fine">{LANDING.fine}</p>
      </div>
    </section>
  );
}

function Faqs() {
  return (
    <section id="faq" className="c-sec c-faq" data-testid="faq" aria-labelledby="faq-h">
      <div className="c-sec__head" data-reveal=""><h2 id="faq-h" className="c-h2">Questions.</h2></div>
      <div className="c-card c-faq__list" data-reveal="">
        {FAQ.slice(0, 5).map(f => (
          <details key={f.id} className="c-faq__i" data-testid="faq-item"><summary>{f.q}</summary><p>{f.a}</p></details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd() }} />
    </section>
  );
}

/** The landing, in one response. */
export function Landing({ d }: { d: LandingData }) {
  return (
    <>
    <ViewAs />
    <main className="b-root t-landing c-landing" data-testid="landing">
      <TerminalChrome election={electionDay(d.now)} />
      <Hero d={d} />
      <div className="c-wrap">
        <Proof d={d} />
        <Board d={d} />
        <WhatYouGet />
        <Record d={d} />
        <Access />
        <Faqs />
      </div>
      <BrandFoot inline />
      {d.member ? null : <StickyStart />}
      {/* The timed pay prompt (PayMoments) stays on every other page; the landing keeps to its two Start for $1 buttons
          and the phones' sticky bar. */}
      <LandingBeacons />
      <Reveal />
    </main>
    </>
  );
}
