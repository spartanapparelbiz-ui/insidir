/* The home page for visitors (app/page.tsx): Kalshi's live market cards and ticker, Perplexity's one ask box and
 * answers with sources. Phone-first. Every number is live from the database; a section whose data is missing is left
 * out. Sections: announcement (until the polls close) · nav · hero (photo, grid, glass ask box, live chips, proof) ·
 * live markets by category · the Read as an answer · ticker · the record · how it works · pricing · FAQ · final CTA ·
 * footer. */
import type { ReactNode } from "react";
import { ReadBox } from "@/components/read/ReadBox";
import { ReadCard } from "@/components/read/ReadCard";
import { ReadPick } from "@/components/read/ReadPick";
import { ADVICE, COMPANY, INCLUDED, TRIAL_LINE } from "@/lib/copy";
import { agoText } from "@/lib/moves/copy";
import { CATS, chipText, RECORD_WINDOWS, type Cat, type MarketCard as Card, type Proof, type RecordRow, type RecordWindow, type TickerBet } from "@/lib/nx/data";
import type { Featured } from "@/lib/nx/featured";
import type { PhotoName } from "@/lib/photos";
import { PLANS, TRIAL } from "@/lib/plans";
import { HeroPhoto, MarketCard, SplitBar } from "./Bits";
import { LiveRefresh } from "./LiveRefresh";
import { Logo } from "./Logo";
import { Tabs } from "./Tabs";
import { fmt } from "@/lib/nx/fmt";

export interface LandingData {
  now: number;
  election: boolean;
  photo: PhotoName;
  chips: Card[];
  proof: Proof | null;
  cards: Record<Cat, Card[]>;
  featured: Featured | null;
  ticker: TickerBet[];
  record: Record<RecordWindow, RecordRow[]>;
  us: boolean;
}

export const NX_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "What is Insidir?", a: "Paste any Polymarket or Kalshi market, or ask about one in plain words. In a few seconds you get a Read: where proven money sits on each side, the big bets of the last 24 hours, the best price on each venue, and one line on what the data shows. Elections, sports, the economy, world events and culture." },
  { q: "What counts as proven money?", a: "Open positions from two sources. Trackers with 30 or more settled positions and a positive all-time followable return, which tag Kalshi trades too. And Polymarket wallets whose public record shows 30 or more closed markets and positive all-time profit. Losses count." },
  { q: "Where do the numbers come from?", a: "Polymarket's and Kalshi's public data: every trade, position and price shown is read from them. Wallets appear by short address only; Insidir never says who is behind one." },
  { q: "Does Insidir place bets or hold my money?", a: "No. Insidir only reads markets. When you want to act, Open takes you to Kalshi (in the US) or to the venue with the better price, and you bet there yourself." },
  { q: "What does it cost?", a: `${TRIAL_LINE}, then $${PLANS.insidir.price}/month, billed by Whop. Cancel anytime from your account; if you cancel inside the first ${TRIAL.days} days, $${TRIAL.fee} is all you pay.` },
  { q: "Is this advice?", a: `${ADVICE} A Read describes what the data shows. It never says what to bet, and past results don't promise future ones.` },
];

const ago = (at: number, now: number) => agoText(at, now);

function Nav({ startHref }: { startHref: string }) {
  return (
    <header className="nxl-nav">
      <div className="nx-wrap nxl-nav__in">
        <Logo />
        <nav className="nxl-nav__links" aria-label="Main">
          <a href="/markets">Markets</a><a href="/results">Record</a><a href="#how">How it works</a>
        </nav>
        <div className="nxl-nav__acts">
          <a className="nxl-nav__login" href="/login">Log in</a>
          <a className="nx-pill nx-pill--accent nx-pill--sm" href={startHref} data-checkout="nav">Start for ${TRIAL.fee}</a>
        </div>
      </div>
    </header>
  );
}

function Hero({ d }: { d: LandingData }) {
  return (
    <section className="nxl-hero" aria-labelledby="hero-h" data-hero="">
      <HeroPhoto name={d.photo} priority />
      <div className="nx-shade" />
      <div className="nx-grid nxl-hero__grid" aria-hidden="true" />
      <div className="nx-wrap nxl-hero__in">
        <h1 id="hero-h" className="nx-h1">Where&apos;s the smart money?</h1>
        <ReadBox glass label="Read" placeholder="Paste a Polymarket or Kalshi link, or ask about any market" />
        {d.chips.length ? (
          <div className="nx-chips nxl-hero__chips" data-testid="hero-chips" aria-label="Busiest markets now">
            {d.chips.map(c => <ReadPick key={c.key} venue={c.venue} id={c.id} className="nx-chip">{chipText(c)}</ReadPick>)}
          </div>
        ) : null}
        {d.proof ? (
          <p className="nxl-hero__proof" data-testid="hero-proof"><span className="nx-live" aria-hidden="true" /> <a href={`/trackers/${d.proof.slug}`}>{d.proof.name}</a>: <b className="nx-up">{d.proof.returnPct >= 0 ? "+" : "−"}{Math.abs(d.proof.returnPct * 100).toFixed(1)}%</b> over {d.proof.settled.toLocaleString("en-US")} settled bets</p>
        ) : null}
        <p className="nxl-hero__fine nx-muted">Works with Polymarket and Kalshi. Insidir never touches your money.</p>
      </div>
    </section>
  );
}

function LiveMarkets({ d }: { d: LandingData }) {
  const cats = CATS.filter(c => d.cards[c.key].length);
  if (!cats.length) return null;
  return (
    <section className="nx-sec" aria-labelledby="live-h" id="markets">
      <div className="nx-wrap">
        <div className="nx-sec__head">
          <div><p className="nx-label"><span className="nx-live" aria-hidden="true" /> Live</p><h2 id="live-h" className="nx-h2">Markets moving now</h2></div>
          <a className="nx-pill nx-pill--sm nx-pill--ghost" href="/markets">All markets</a>
        </div>
        <Tabs label="Categories" labels={cats.map(c => c.label)} testid="live-markets">
          {cats.map((c, ci) => <div key={c.key} className="nx-row">{d.cards[c.key].map((card, i) => <MarketCard key={card.key} c={card} priority={ci === 0 && i < 2} />)}</div>)}
        </Tabs>
      </div>
    </section>
  );
}

function Answer({ f, now, us }: { f: Featured; now: number; us: boolean }) {
  const venues = [f.data.polymarket ? "Polymarket" : null, f.data.kalshi ? "Kalshi" : null].filter(Boolean) as string[];
  const q = f.card.event && f.card.event.length <= 40 ? f.card.event : f.card.title;
  return (
    <section className="nx-sec nxl-answer" aria-labelledby="answer-h" id="answer">
      <div className="nx-wrap nxl-answer__in">
        <div className="nxl-answer__q">
          <p className="nx-label">You ask</p>
          <h2 id="answer-h" className="nx-h1 nxl-answer__h">{q}</h2>
          <p className="nx-muted">The Read answers with where proven money sits, the big bets, the best price, and one line on what it shows.</p>
        </div>
        <div className="nxl-answer__card">
          <ReadCard id={f.id} data={f.data} member us={us} now={now} startHref={`/start?next=${encodeURIComponent(`/read/${f.id}`)}`} />
          <p className="nx-chips nx-chips--left nxl-sources" data-testid="answer-sources">
            {venues.map(v => <span key={v} className="nx-chip">{v}</span>)}
            {f.positions ? <span className="nx-chip">{f.positions.toLocaleString("en-US")} positions</span> : null}
            <span className="nx-chip">Updated {ago(f.at, now)}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function Ticker({ bets, now }: { bets: TickerBet[]; now: number }) {
  if (bets.length < 3) return null;
  const items = bets.map(b => (
    <span key={b.id} className="nx-ticker__item"><b>${Math.round(b.amount).toLocaleString("en-US")}</b><span>{b.side}</span><span className="nx-muted">{Math.round(b.price * 100)}¢</span><span className="nx-muted">{ago(b.at, now)}</span></span>
  ));
  return (
    <section className="nx-ticker" aria-label="Latest big bets" data-testid="ticker">
      <div className="nx-ticker__track">{items}<span aria-hidden="true" style={{ display: "contents" }}>{bets.map(b => (
        <span key={`${b.id}-2`} className="nx-ticker__item"><b>${Math.round(b.amount).toLocaleString("en-US")}</b><span>{b.side}</span><span className="nx-muted">{Math.round(b.price * 100)}¢</span><span className="nx-muted">{ago(b.at, now)}</span></span>
      ))}</span></div>
    </section>
  );
}

function Record({ rec }: { rec: Record<RecordWindow, RecordRow[]> }) {
  const wins = RECORD_WINDOWS.filter(w => rec[w.key].length);
  if (!wins.length) return null;
  return (
    <section className="nx-sec" aria-labelledby="record-h" id="record">
      <div className="nx-wrap">
        <div className="nx-sec__head">
          <div><p className="nx-label">The record</p><h2 id="record-h" className="nx-h2">Every result is public, losses included.</h2>
            <p className="nx-sec__sub">What following every position of a tracker at the price Insidir showed, plus one point, made.</p></div>
          <a className="nx-pill nx-pill--sm nx-pill--ghost" href="/results">Full record →</a>
        </div>
        <Tabs label="Window" labels={wins.map(w => w.label)} testid="record">
          {wins.map(w => (
            <ol key={w.key} className="nxl-rec nx-panel">
              {rec[w.key].map((r, i) => (
                <li key={r.slug} className="nxl-rec__row">
                  <span className="nxl-rec__n nx-muted">{i + 1}</span>
                  <a className="nxl-rec__name" href={`/trackers/${r.slug}`}>{r.name}</a>
                  <span className={r.returnPct >= 0 ? "nx-up nxl-rec__ret" : "nx-down nxl-rec__ret"}>{r.returnPct >= 0 ? "+" : "−"}{Math.abs(r.returnPct * 100).toFixed(1)}%</span>
                  <span className="nx-muted nxl-rec__set">{r.settled.toLocaleString("en-US")} settled</span>
                </li>
              ))}
            </ol>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

function How({ f, chips }: { f: Featured | null; chips: Card[] }) {
  const c = f?.card ?? null, best = f?.data.prices.yes ?? null;
  return (
    <section className="nx-sec" aria-labelledby="how-h" id="how">
      <div className="nx-wrap">
        <p className="nx-label">How it works</p>
        <h2 id="how-h" className="nx-h2">Paste. Read. Bet smarter.</h2>
        <ol className="nxl-how">
          <li className="nx-panel nxl-how__step">
            <span className="nx-label">1 · Paste</span>
            <h3 className="nx-h3">Paste a link, or ask in plain words.</h3>
            <div className="nxl-crop" aria-hidden="true"><span className="nx-ask nxl-crop__ask"><span className="nx-muted">{chips[0] ? chipText(chips[0]) : "Senate control"}</span><span className="nx-pill nx-pill--accent nx-pill--sm">Read</span></span></div>
          </li>
          <li className="nx-panel nxl-how__step">
            <span className="nx-label">2 · Read</span>
            <h3 className="nx-h3">See where proven money sits, side by side.</h3>
            {c && c.proven.yes + c.proven.no > 0 ? <div className="nxl-crop"><p className="nxl-crop__t">{c.title}</p><SplitBar yes={c.proven.yes} no={c.proven.no} yesLabel={c.yesLabel} noLabel={c.noLabel} /></div> : null}
          </li>
          <li className="nx-panel nxl-how__step">
            <span className="nx-label">3 · Bet smarter</span>
            <h3 className="nx-h3">Get the better price on Kalshi or Polymarket.</h3>
            {best && (best.kalshi !== null || best.polymarket !== null) ? (
              <div className="nxl-crop nxl-crop__prices">
                {best.kalshi !== null ? <span className={best.best === "kalshi" ? "is-best" : undefined}>Kalshi <b>{Math.round(best.kalshi * 100)}¢</b></span> : null}
                {best.polymarket !== null ? <span className={best.best === "polymarket" ? "is-best" : undefined}>Polymarket <b>{Math.round(best.polymarket * 100)}¢</b></span> : null}
              </div>
            ) : null}
          </li>
        </ol>
      </div>
    </section>
  );
}

function Pricing({ startHref }: { startHref: string }) {
  return (
    <section className="nx-sec" aria-labelledby="price-h" id="pricing">
      <div className="nx-wrap">
        <div className="nx-panel nxl-price">
          <div>
            <p className="nx-label">Pricing</p>
            <h2 id="price-h" className="nx-h2">{TRIAL_LINE}, then ${PLANS.insidir.price}/month. Cancel anytime.</h2>
          </div>
          <ul className="nxl-price__list">{INCLUDED.map(x => <li key={x}>{x}</li>)}</ul>
          <a className="nx-pill nx-pill--accent" href={startHref} data-checkout="pricing">Start for ${TRIAL.fee}</a>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="nx-sec" aria-labelledby="faq-h" id="faq">
      <div className="nx-wrap nxl-faq">
        <h2 id="faq-h" className="nx-h2">Questions</h2>
        <div className="nxl-faq__list">
          {NX_FAQ.map(f => (
            <details key={f.q} className="nxl-faq__item">
              <summary>{f.q}</summary>
              <p className="nx-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ photo, startHref }: { photo: PhotoName; startHref: string }) {
  return (
    <section className="nxl-final" aria-labelledby="final-h">
      <HeroPhoto name={photo} />
      <div className="nx-shade nx-shade--80" />
      <div className="nx-wrap nxl-final__in">
        <h2 id="final-h" className="nx-h2">Know where the money is before you bet.</h2>
        <a className="nx-pill nx-pill--accent" href={startHref} data-checkout="final">Start for ${TRIAL.fee}</a>
      </div>
    </section>
  );
}

export function NxFooter() {
  return (
    <footer className="nxl-foot">
      <div className="nx-wrap">
        <div className="nxl-foot__top">
          <Logo />
          <nav className="nxl-foot__links" aria-label="Footer">
            <a href="/markets">Markets</a><a href="/results">Record</a><a href="/pricing">Pricing</a><a href="/faq">FAQ</a><a href="/methodology">Methodology</a>
            <a href="/status">Status</a><a href="/credits">Photo credits</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a>
          </nav>
        </div>
        <p className="nx-muted nxl-foot__fine" data-testid="nx-advice">{ADVICE} Operated by {COMPANY.name}.</p>
      </div>
    </footer>
  );
}

/** The visitors' frame for pages other than the home page (a Read, Markets): the nav, the page, the footer. */
export function VisitorFrame({ children, startHref = "/start" }: { children: ReactNode; startHref?: string }) {
  return (
    <div className="nx nxl nxv">
      <Nav startHref={startHref} />
      <main className="nxv-main">{children}</main>
      <NxFooter />
    </div>
  );
}

export function Landing({ d, startHref }: { d: LandingData; startHref: string }) {
  return (
    <div className="nx nxl">
      <LiveRefresh />
      {d.election ? (
        <p className="nxl-bar" data-testid="announcement"><a href="/markets?cat=elections">Midterms are Tuesday. See where the smart money is before polls close →</a></p>
      ) : null}
      <Nav startHref={startHref} />
      <main>
        <Hero d={d} />
        <LiveMarkets d={d} />
        {d.featured ? <Answer f={d.featured} now={d.now} us={d.us} /> : null}
        <Ticker bets={d.ticker} now={d.now} />
        <Record rec={d.record} />
        <How f={d.featured} chips={d.chips} />
        <Pricing startHref={startHref} />
        <Faq />
        <FinalCta photo={d.photo} startHref={startHref} />
      </main>
      <NxFooter />
    </div>
  );
}

export const usdShort = (n: number) => fmt(n, "usd");
