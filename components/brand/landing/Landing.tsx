/* The landing for visitors: clean, on the brand board (Garnished & Tarnished Blue, Perplexed Scrutiny Azure,
 * Scornelius Pampered Yellow). One story, top to bottom:
 *   1. Hero      full height, centred: a live line, the headline, one line, the Start for $1 (the one Yellow fill),
 *                the price; behind it the brand board's cover: concentric arcs of light and slow waves (./Waves.tsx)
 *   2. Live      beside the headline: today's numbers and the latest 6 bets from $1M+ wallets, 60 minutes late, sides
 *                locked (the lock is the reason to pay); a board row opens the bet
 *   4. What you get   three glass cards with the arc motif: before you bet · while you hold · after it settles
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
import { ViewAs } from "@/components/ViewAs";
import { TerminalChrome } from "@/components/terminal/Chrome";
import { LandingBeacons } from "./LandingBeacons";
import { StickyStart } from "./StickyStart";
import { Reveal } from "./Reveal";
import { getDb, hasDatabase } from "@/lib/db";
import { landingValue, type Value } from "@/lib/brand/value";

const EMPTY_VALUE: Value = { briefing: null, alert: null, wallet: null, brief: [], proof: null, twins: 0 };
import { Waves } from "./Waves";

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

function Hero({ d }: { d: LandingData }) {
  const live = d.pulse.count > 0 ? `${d.pulse.count.toLocaleString("en-US")} ${d.pulse.count === 1 ? "bet" : "bets"} from $1M+ wallets ${d.pulse.window === "hour" ? "in the last hour" : "today"}` : null;
  return (
    <section className="c-hero" data-testid="hero" aria-labelledby="hero-h">
      <Waves />
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
        <LivePanel d={d} />
      </div>
    </section>
  );
}

/** The hero's information: the latest bets from $1M+ wallets (60 minutes late, sides locked) and today's numbers. */
function LivePanel({ d }: { d: LandingData }) {
  const rows = d.lead.slice(0, 6);
  const stats = [
    d.pulse.sinceMidnight > 0 ? { v: dollars(d.pulse.sinceMidnight), k: "bet by $1M+ wallets today", id: "today" } : null,
    d.pulse.millionaires > 0 ? { v: d.pulse.millionaires.toLocaleString("en-US"), k: "wallets up $1M+ watched", id: "wallets" } : null,
    d.month ? { v: `${d.month.won}–${d.month.lost}`, k: "won–lost this month", id: "month" } : null,
  ].filter((x): x is { v: string; k: string; id: string } => x !== null);
  return (
    <aside className="c-live" aria-label="Live from $1M+ wallets" data-testid="landing-board">
      <header className="c-live__head"><span className="c-live__t"><span className="c-dot" aria-hidden="true" />Live from $1M+ wallets</span><span className="c-live__delay">60 min delay for visitors</span></header>
      {stats.length ? (
        <dl className="c-live__stats" data-testid="hero-proof">
          {stats.map(s => <div key={s.id} data-stat={s.id}><dd data-count={s.v}>{s.v}</dd><dt>{s.k}</dt></div>)}
        </dl>
      ) : null}
      <div className="c-live__rows">
        {rows.length ? rows.map(b => (
          <a key={b.id} className="c-live__row" href={betPath(b.id)} data-board-row="" data-href={betPath(b.id)} data-testid="landing-row">
            <span className="c-live__time">{ET_TIME.format(new Date(b.at))}</span>
            <span className="c-live__who"><span className={`c-tier c-tier--${b.tier}`}>{TIER_NAME[b.tier]}</span><span className="c-addr">{b.short}</span></span>
            <span className="c-live__m" title={b.title}>{b.title}</span>
            <span className="c-live__amt">{dollars(b.amount)}{usual(b) ? <small>{usual(b)} usual</small> : null}</span>
            <span className="c-live__side" data-locked="side"><Lock />Members</span>
          </a>
        )) : <p className="c-live__empty">The next bet from a $1M+ wallet shows here as it lands.</p>}
      </div>
      <footer className="c-live__src">Source: Polymarket public data · updated {ET_TIME.format(new Date(d.now))} ET. {LANDING.boardNote}</footer>
    </aside>
  );
}

/** What Insidir does, by moment, each card with Insidir's own real output (lib/brand/value.ts). */
function WhatYouGet({ v }: { v: Value }) {
  const q = (t: string) => `/ask?q=${encodeURIComponent(t)}`;
  const asks = ["Who's the best NFL wallet this month and what's he on today?", "Is anyone big against my bet?", "Why did the odds move?"];
  return (
    <section className="c-sec" aria-labelledby="get-h">
      <div className="c-sec__head">
        <h2 id="get-h" className="c-h2">Everything the big money knows, before you bet.</h2>
        <p className="c-sec__sub">People bet against traders who know more than they do, and can&apos;t see them. Insidir shows you who they are, what they bet, and what it means for yours: before, during and after.</p>
      </div>
      <div className="c-value" data-testid="what-you-get">
        <div className="c-moment" data-reveal="">
          <p className="c-moment__k"><span>01</span>Before you bet</p>
          <div className="c-bento">
            <article className="c-feat c-feat--wide">
              <h3 className="c-feat__h">Bet Briefing</h3>
              <p className="c-feat__t">What the bet actually needs to win, what it pays, how the price got here, who&apos;s on each side and how they&apos;re playing it. Written by the AI from the data, every number verified against it.</p>
              {v.briefing ? (
                <a className="c-sample" href={v.briefing.href}>
                  <span className="c-sample__top">Today&apos;s most-bet market · {v.briefing.title}</span>
                  {v.briefing.lines.map(l => <span key={l.k} className="c-sample__row"><b>{l.k}</b><span>{l.t}</span></span>)}
                  <span className="c-sample__more">Members get every section →</span>
                </a>
              ) : null}
            </article>
            <article className="c-feat">
              <h3 className="c-feat__h">Ask Insidir</h3>
              <p className="c-feat__t">Ask anything about the wallets, a market or your own bet. Answers come only from our data, with the rows behind them.</p>
              <div className="c-asks">{asks.map(t => <a key={t} className="c-ask" href={q(t)}>{t}</a>)}</div>
            </article>
            <article className="c-feat">
              <h3 className="c-feat__h">The better price</h3>
              <p className="c-feat__t">The same market on Kalshi beside Polymarket&apos;s price, so you never pay more than you have to.</p>
              {v.twins > 0 ? <p className="c-stat"><b>{v.twins.toLocaleString("en-US")}</b> markets matched to Kalshi right now</p> : null}
            </article>
          </div>
        </div>
        <div className="c-moment" data-reveal="">
          <p className="c-moment__k"><span>02</span>While you hold</p>
          <div className="c-bento">
            <article className="c-feat c-feat--wide">
              <h3 className="c-feat__h">Watch my bet</h3>
              <p className="c-feat__t">Add your position or your public Polymarket address. When a $1M+ wallet takes the other side, a wallet on your side gets out, or the price moves 5¢, you get an alert that says what it means for your bet, in dollars.</p>
              {v.alert ? (
                <div className="c-alert">
                  <span className="c-alert__k"><span className="c-dot" aria-hidden="true" />Alert</span>
                  <span className="c-alert__h">{v.alert.who} just put {dollars(v.alert.amount)} on “{v.alert.title}”{v.alert.usual ? `, ${(v.alert.amount / v.alert.usual).toFixed(1)}× their usual bet` : ""}.</span>
                  <span className="c-alert__m">What it means for your bet: whether that money is with you or against you, and your profit or loss at the price now.</span>
                </div>
              ) : null}
            </article>
            <article className="c-feat">
              <h3 className="c-feat__h">The 8 AM brief</h3>
              <p className="c-feat__t">The five biggest things the $1M+ money did overnight, two lines each, plus what changed on your bets.</p>
              {v.brief.length ? <div className="c-brieflines">{v.brief.map((l, n) => <p key={n}>{l[0]}<span>{l[1]}</span></p>)}</div> : null}
            </article>
            <article className="c-feat">
              <h3 className="c-feat__h">Wallets worth following</h3>
              <p className="c-feat__t">Every wallet&apos;s record, losses included, and how big each bet is for them.</p>
              {v.wallet ? <p className="c-stat"><b>{v.wallet.pnl >= 0 ? "+" : "−"}{dollars(Math.abs(v.wallet.pnl))}</b> all-time · Millionaire {v.wallet.short} · {v.wallet.won}–{v.wallet.rows.length - v.wallet.won} last {v.wallet.rows.length}</p> : null}
            </article>
          </div>
        </div>
        <div className="c-moment" data-reveal="">
          <p className="c-moment__k"><span>03</span>After it settles</p>
          <div className="c-bento">
            <article className="c-feat c-feat--wide">
              <h3 className="c-feat__h">What happened, and what we told you</h3>
              <p className="c-feat__t">Who was right, what following each wallet would have made, your own record by category, and every briefing and alert we showed you with how it turned out. Losses included.</p>
            </article>
            <article className="c-feat">
              <h3 className="c-feat__h">Proof on the chain</h3>
              <p className="c-feat__t">Every bet links to its Polygon transaction, so you can see size, price and side for yourself.</p>
              {v.proof ? <a className="c-proofline" href={`https://polygonscan.com/tx/${v.proof.tx}`} target="_blank" rel="noopener noreferrer">{dollars(v.proof.amount)} · {v.proof.result === "won" ? "Won" : "Lost"} · {v.proof.tx.slice(0, 10)}… on Polygonscan ↗</a> : null}
            </article>
            <article className="c-feat">
              <h3 className="c-feat__h">The full record</h3>
              <p className="c-feat__t">Every position we&apos;ve flagged, with won, lost and sold, on one public page.</p>
              <a className="c-link" href="/record">See the record →</a>
            </article>
          </div>
        </div>
      </div>
      <Compare />
    </section>
  );
}

const COMPARE: Array<[string, string, string]> = [
  ["Who you're betting against", "Anonymous usernames", "Proven $1M+ wallets, with their record"],
  ["Which side they took", "Hidden in a feed", "Every side, the minute it lands"],
  ["Is it big for them", "No idea", "Size against their usual bet"],
  ["What the bet needs to win", "Pages of rules", "Wins if, in plain words, with the gotchas"],
  ["When they get out", "After you've lost", "An alert, with what it means for you"],
  ["The best price", "Two apps, two tabs", "Kalshi beside Polymarket"],
  ["Proof", "A screenshot", "The transaction on Polygonscan"],
];

function Compare() {
  return (
    <div className="c-card c-compare" data-reveal="">
      <div className="c-compare__row c-compare__head"><span /><span>On your own</span><span>With Insidir</span></div>
      {COMPARE.map(([k, a, b]) => <div key={k} className="c-compare__row"><span className="c-compare__k">{k}</span><span className="c-compare__a">{a}</span><span className="c-compare__b">{b}</span></div>)}
    </div>
  );
}

function Record({ d }: { d: LandingData }) {
  const r = d.record30, t = r?.total, settled = t ? t.won + t.lost : 0;
  const net = r && r.net !== null ? r.net : null;
  return (
    <section className="c-sec" data-testid="landing-record" aria-labelledby="rec-h">
      <div className="c-sec__head">
        <h2 id="rec-h" className="c-h2">What we told you, losses included.</h2>
        <p className="c-sec__sub">Every bet from $1M+ wallets that settled in the last 30 days.</p>
      </div>
      {t && settled + t.void > 0 ? (
        <div className="c-card c-rec" data-reveal="">
          <div className="c-rec__s"><span className="c-rec__v" data-testid="record-wl" data-count={`${t.won}–${t.lost}`}>{t.won}–{t.lost}</span><span className="c-rec__k">won–lost</span></div>
          <div className="c-rec__s"><span className={`c-rec__v ${net === null ? "" : net >= 0 ? "t-up" : "t-down"}`} data-testid="record-net">{net === null ? "—" : `${net >= 0 ? "+" : "−"}$${Math.abs(Math.round(net)).toLocaleString("en-US")}`}</span><span className="c-rec__k">$100 on each</span></div>
          <div className="c-rec__s"><span className="c-rec__v">{t.void}</span><span className="c-rec__k">voided</span></div>
          <p className="c-rec__note">{net === null ? `The $100 line shows from 30 settled bets; ${settled} so far.` : `$100 on every settled bet at the price the wallet paid. ${PAST}`} <a className="c-link" href="/results">Every settled bet, losses included →</a></p>
        </div>
      ) : <div className="c-card c-empty" data-reveal="">No settled bets from wallets up $1M+ in the last 30 days yet. <a className="c-link" href="/results">Every settled bet, losses included →</a></div>}
    </section>
  );
}

function Access() {
  return (
    <section id="pricing" className="c-price" data-testid="pricing" aria-labelledby="price-h">
      <Glow className="c-glow--price" />
      <div className="c-price__in">
        <p className="c-eyebrow c-eyebrow--quiet">One plan</p>
        <h2 id="price-h" className="c-price__h"><span className="c-price__big">$1</span> for your first 3 days.</h2>
        <p className="c-price__line" data-testid="price-line">{LANDING.priceLine}</p>
        <ul className="c-price__list" data-reveal="">{LANDING.gets.map(g => <li key={g}>{g}</li>)}</ul>
        <a className="t-cta t-cta--lg c-cta" href="/go" data-checkout="pricing" data-cta="pricing" data-testid="pricing-cta">{START}<span aria-hidden="true">→</span></a>
        <p className="c-price__fine">{LANDING.fine}</p>
      </div>
    </section>
  );
}

function Faqs() {
  return (
    <section id="faq" className="c-sec c-faq" data-testid="faq" aria-labelledby="faq-h">
      <div className="c-sec__head"><h2 id="faq-h" className="c-h2">Questions.</h2></div>
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
export async function Landing({ d }: { d: LandingData }) {
  const v: Value = hasDatabase() ? await landingValue(getDb(), d.now, d.lead).catch(() => EMPTY_VALUE) : EMPTY_VALUE;
  return (
    <>
    <ViewAs />
    <main className="b-root t-landing c-landing" data-testid="landing">
      <TerminalChrome election={electionDay(d.now)} />
      <Hero d={d} />
      <div className="c-wrap">
        <WhatYouGet v={v} />
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
