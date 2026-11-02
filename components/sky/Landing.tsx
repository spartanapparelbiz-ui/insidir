/* The visitors' home page (app/page.tsx), the insidir system (app/sky.css). Every number is live from the database; a
 * section whose data is missing is left out, never filled with a placeholder.
 *   1 announcement (until the polls close) · 2 nav · 3 hero: headline, the glass ask box, live chips, the best tracker's
 *   record; the 3D money skyline beside it (below on phones) · 4 live markets by category · 5 the Read as an answer ·
 *   6 ticker · 7 the record · 8 how it works, pricing, FAQ, final CTA, footer. */
import type { ReactNode } from "react";
import { ViewAs } from "@/components/ViewAs";
import { ReadBox } from "@/components/read/ReadBox";
import { ReadCard } from "@/components/read/ReadCard";
import { ReadPick } from "@/components/read/ReadPick";
import { ADVICE, COMPANY, INCLUDED, TRIAL_LINE } from "@/lib/copy";
import { CATS, chipText, RECORD_WINDOWS, type RecordRow, type RecordWindow } from "@/lib/nx/data";
import type { Featured } from "@/lib/nx/featured";
import { PLANS, TRIAL } from "@/lib/plans";
import type { LandingData } from "@/lib/sky/landing";
import { ago, betLine, type SkyBet } from "@/lib/sky/sky-pure";
import { Art } from "./Art";
import { MarketCard } from "./Card";
import { LineIcon } from "./Icons";
import { LiveRefresh } from "./LiveRefresh";
import { Logo } from "./Logo";
import { Reveal } from "./Reveal";
import { Skyline } from "./Skyline";
import { Tabs } from "./Tabs";

export const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "What is insidir?", a: "Paste any Polymarket or Kalshi market, or ask about one in plain words. In a few seconds you get a Read: where proven money sits on each side, the big bets of the last 24 hours, the best price on each venue, and one line on what the data shows." },
  { q: "What counts as proven money?", a: "Open positions from trackers with 30 or more settled positions and a positive all-time return, and from Polymarket wallets whose public record shows 30 or more closed markets and positive all-time profit. Losses count." },
  { q: "Where do the numbers come from?", a: "Polymarket's and Kalshi's public data. Every trade, position and price shown is read from them. Wallets appear by short address only; insidir never says who is behind one." },
  { q: "Does insidir place bets or hold my money?", a: "No. insidir only reads markets. When you want to act, Open takes you to Kalshi (in the US) or to the venue with the better price, and you bet there yourself." },
  { q: "What does it cost?", a: `${TRIAL_LINE}, then $${PLANS.insidir.price}/month, billed by Whop. Cancel anytime from your account; cancel inside the first ${TRIAL.days} days and $${TRIAL.fee} is all you pay.` },
  { q: "Is this advice?", a: `${ADVICE} A Read describes what the data shows. It never says what to bet, and past results don't promise future ones.` },
];

function Nav({ startHref }: { startHref: string }) {
  return (
    <header className="skl-nav">
      <div className="sk-wrap skl-nav__in">
        <Logo />
        <nav className="skl-nav__links" aria-label="Main"><a href="/markets">Markets</a><a href="/results">Record</a><a href="#how">How it works</a></nav>
        <div className="skl-nav__acts">
          <a className="skl-nav__login" href="/login">Log in</a>
          <a className="sk-btn sk-sm" href={startHref} data-unlock="nav">Start for ${TRIAL.fee}</a>
        </div>
      </div>
    </header>
  );
}

function Hero({ d }: { d: LandingData }) {
  return (
    <section className="skl-hero" aria-labelledby="hero-h" data-hero="">
      <div className="sk-wrap skl-hero__in">
        <div className="skl-hero__text">
          <h1 id="hero-h" className="sk-h1">Where&apos;s the smart money?</h1>
          <p className="skl-hero__sub">Paste any Polymarket or Kalshi market. See which side proven money is on, the big bets, and the best price.</p>
          <ReadBox glass label="Read" placeholder="Paste a Polymarket or Kalshi link, or ask about any market" />
          {d.chips.length ? (
            <div className="sk-chips" data-testid="hero-chips" aria-label="Busiest markets now">
              {d.chips.map(c => <ReadPick key={c.key} venue={c.venue} id={c.id} className="sk-chip">{chipText(c)}</ReadPick>)}
            </div>
          ) : null}
          {d.proof ? (
            <p className="skl-proof" data-testid="hero-proof"><span className="sk-live" aria-hidden="true" /> <a href={`/trackers/${d.proof.slug}`}>{d.proof.name}</a> <span className="sk-num sk-up">{d.proof.returnPct >= 0 ? "+" : "−"}{Math.abs(d.proof.returnPct * 100).toFixed(1)}%</span> <span className="sk-muted">over {d.proof.settled.toLocaleString("en-US")} settled bets</span></p>
          ) : null}
        </div>
        <div className="skl-hero__sky">
          <Skyline bets={d.sky} height={560} phoneHeight={360} />
          {d.sky.length ? <p className="sk-meta skl-hero__cap">The {d.sky.length} biggest bets of the last 24 hours. Hover or tap a bar.</p> : null}
        </div>
      </div>
    </section>
  );
}

function LiveMarkets({ d }: { d: LandingData }) {
  const cats = CATS.filter(c => d.cards[c.key]?.length);
  if (!cats.length) return null;
  return (
    <section className="sk-sec sk-reveal" aria-labelledby="live-h" id="markets">
      <div className="sk-wrap">
        <div className="sk-sec__head">
          <div><p className="sk-meta"><span className="sk-live" aria-hidden="true" /> Live</p><h2 id="live-h" className="sk-h2">Markets moving now</h2></div>
          <a className="sk-pill sk-sm" href="/markets">All markets</a>
        </div>
        <Tabs label="Categories" labels={cats.map(c => c.label)} testid="live-markets">
          {cats.map(c => <div key={c.key} className="sk-row">{d.cards[c.key]!.map(card => <MarketCard key={card.key} c={card} />)}</div>)}
        </Tabs>
      </div>
    </section>
  );
}

export function Sources({ f, now }: { f: Pick<Featured, "data" | "positions" | "at">; now: number }) {
  return (
    <p className="sk-chips skl-sources" data-testid="answer-sources">
      {f.data.polymarket ? <span className="sk-chip">Polymarket</span> : null}
      {f.data.kalshi ? <span className="sk-chip">Kalshi</span> : null}
      {f.positions ? <span className="sk-chip">{f.positions.toLocaleString("en-US")} {f.positions === 1 ? "position" : "positions"}</span> : null}
      <span className="sk-chip">Updated {ago(f.at, now)}</span>
    </p>
  );
}

function Answer({ f, now, us }: { f: Featured; now: number; us: boolean }) {
  const q = f.card.event && f.card.event.length <= 40 ? f.card.event : f.card.title;
  return (
    <section className="sk-sec sk-reveal" aria-labelledby="answer-h" id="answer">
      <div className="sk-wrap skl-answer">
        <h2 id="answer-h" className="sk-h2 skl-answer__h">Ask about any market. Get the Read.</h2>
        <p className="skl-asked" data-testid="you-asked"><span className="sk-muted">You asked</span> {q}</p>
        <ReadCard id={f.id} data={f.data} member us={us} now={now} startHref={`/start?next=${encodeURIComponent(`/read/${f.id}`)}`} />
        <Sources f={f} now={now} />
      </div>
    </section>
  );
}

export function Ticker({ bets, now }: { bets: SkyBet[]; now: number }) {
  if (bets.length < 3) return null;
  const item = (b: SkyBet, k: string) => (
    <span key={k} className="sk-ticker__item"><Art art={b.art} size={20} /><span className="sk-num">{betLine(b, now, false)}</span></span>
  );
  return (
    <section className="sk-ticker sk-sec--flush" aria-label="Latest big bets" data-testid="ticker">
      <div className="sk-ticker__track">{bets.map(b => item(b, b.id))}<span aria-hidden="true" className="sk-ticker__dup">{bets.map(b => item(b, `${b.id}-2`))}</span></div>
    </section>
  );
}

function Record({ rec }: { rec: Record<RecordWindow, RecordRow[]> }) {
  const wins = RECORD_WINDOWS.filter(w => rec[w.key].length);
  if (!wins.length) return null;
  return (
    <section className="sk-sec sk-reveal" aria-labelledby="record-h" id="record">
      <div className="sk-wrap">
        <div className="sk-sec__head">
          <div><h2 id="record-h" className="sk-h2">The record</h2><p className="sk-sec__sub">What following every position of a tracker at the price insidir showed, plus one point, made. Losses included.</p></div>
          <a className="sk-pill sk-sm" href="/results">Full record →</a>
        </div>
        {/* All time first: the same numbers as the hero's proof line. */}
        <Tabs label="Window" labels={wins.map(w => w.label)} testid="record" start={wins.length - 1}>
          {wins.map(w => (
            <ol key={w.key} className="skl-rec sk-panel">
              {rec[w.key].map((r, i) => (
                <li key={r.slug} className="skl-rec__row">
                  <span className="skl-rec__n sk-num sk-muted">{i + 1}</span>
                  <a className="skl-rec__name" href={`/trackers/${r.slug}`}>{r.name}</a>
                  <span className={`skl-rec__ret sk-num ${r.returnPct >= 0 ? "sk-up" : "sk-down"}`}>{r.returnPct >= 0 ? "+" : "−"}{Math.abs(r.returnPct * 100).toFixed(1)}%</span>
                  <span className="skl-rec__set sk-num sk-muted">{r.settled.toLocaleString("en-US")} settled</span>
                </li>
              ))}
            </ol>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

function How() {
  const steps: Array<[string, string, "spark" | "chart" | "trophy"]> = [
    ["Paste", "A Polymarket or Kalshi link, or the market in plain words.", "spark"],
    ["Read", "Which side proven money is on, the big bets, and the best price, in seconds.", "chart"],
    ["Bet smarter", "Open the market on Kalshi or Polymarket and decide for yourself.", "trophy"],
  ];
  return (
    <section className="sk-sec sk-reveal" aria-labelledby="how-h" id="how">
      <div className="sk-wrap">
        <h2 id="how-h" className="sk-h2">How it works</h2>
        <ol className="skl-how">
          {steps.map(([h, p, icon], i) => (
            <li key={h} className="sk-panel skl-how__step">
              <span className="sk-av sk-av--icon" style={{ width: 40, height: 40 }}><LineIcon name={icon} /></span>
              <h3 className="sk-h3"><span className="sk-num sk-muted">{i + 1}</span> {h}</h3>
              <p className="sk-muted">{p}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Pricing({ startHref }: { startHref: string }) {
  return (
    <section className="sk-sec sk-reveal" aria-labelledby="price-h" id="pricing">
      <div className="sk-wrap">
        <div className="sk-panel skl-price">
          <div><h2 id="price-h" className="sk-h2">${TRIAL.fee} for {TRIAL.days} days, then ${PLANS.insidir.price}/month.</h2><p className="sk-muted">Cancel anytime.</p></div>
          <ul className="skl-price__list">{INCLUDED.map(x => <li key={x}>{x}</li>)}</ul>
          <a className="sk-btn" href={startHref} data-checkout="pricing">Start for ${TRIAL.fee}</a>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="sk-sec sk-reveal" aria-labelledby="faq-h" id="faq">
      <div className="sk-wrap skl-faq">
        <h2 id="faq-h" className="sk-h2">Questions</h2>
        <div className="skl-faq__list">{FAQ.map(f => <details key={f.q} className="skl-faq__item"><summary>{f.q}</summary><p className="sk-muted">{f.a}</p></details>)}</div>
      </div>
    </section>
  );
}

function FinalCta({ startHref }: { startHref: string }) {
  return (
    <section className="sk-sec sk-reveal" aria-labelledby="final-h">
      <div className="sk-wrap"><div className="skl-final">
        <h2 id="final-h" className="sk-h2">Know where the money is before you bet.</h2>
        <a className="sk-btn" href={startHref} data-checkout="final">Start for ${TRIAL.fee}</a>
      </div></div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="skl-foot">
      <div className="sk-wrap">
        <div className="skl-foot__top">
          <Logo />
          <nav className="skl-foot__links" aria-label="Footer">
            <a href="/markets">Markets</a><a href="/results">Record</a><a href="/pricing">Pricing</a><a href="/faq">FAQ</a><a href="/methodology">Methodology</a>
            <a href="/status">Status</a><a href="/credits">Credits</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a>
          </nav>
        </div>
        <p className="sk-meta skl-foot__fine" data-testid="sk-advice">Information, not financial or betting advice. Operated by {COMPANY.name}.</p>
      </div>
    </footer>
  );
}

/** The visitors' frame for pages other than the home page (a Read, Markets). */
export function VisitorFrame({ children, startHref = "/start" }: { children: ReactNode; startHref?: string }) {
  return (
    <div className="sk skl">
      <ViewAs />
      <Nav startHref={startHref} />
      <main className="skv-main">{children}</main>
      <Footer />
    </div>
  );
}

export function Landing({ d, startHref }: { d: LandingData; startHref: string }) {
  return (
    <div className="sk skl">
      <LiveRefresh />
      <Reveal />
      <ViewAs />
      {d.election ? <p className="skl-bar" data-testid="announcement"><a href="/markets?cat=elections">Midterms are Tuesday. See where the smart money is before polls close →</a></p> : null}
      <Nav startHref={startHref} />
      <main>
        <Hero d={d} />
        <LiveMarkets d={d} />
        {d.featured ? <Answer f={d.featured} now={d.now} us={d.us} /> : null}
        <Ticker bets={d.ticker} now={d.now} />
        <Record rec={d.record} />
        <How />
        <Pricing startHref={startHref} />
        <Faq />
        <FinalCta startHref={startHref} />
      </main>
      <Footer />
    </div>
  );
}
