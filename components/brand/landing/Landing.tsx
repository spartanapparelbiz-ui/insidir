/* The homepage (visitors): a product page in the manner of Mercury, Ramp and Linear. Solid near-black, Inter for words,
 * JetBrains Mono for numbers, addresses and times, one accent (the brand's gold) on the button and live numbers only,
 * 1px #222 borders, 12px radii, no photos, no shadows, no scroll animations (150ms fades only).
 *   Hero      label, "The intelligence layer for prediction markets.", the sub, Start for $1, the price line, and the
 *             product itself: the Live feed in a framed window (six real rows; sides hidden for visitors)
 *   Stats     three live numbers (lib/brand/landing.ts homeStats); a number that isn't there is left out
 *   How       Track, Verify, Signal
 *   Product   two framed real screens, alternating with their captions: a signal (the newest settled $1M+ trade, as
 *             its signal read) and the ledger (the last six settled $1M+ trades, wins and losses)
 *   Pricing   one card
 *   Footer    Methodology, Terms, Privacy, contact, the disclaimer
 * Every number comes from a live query; nothing is invented. Members get their home instead (app/page.tsx). */
import { ViewAs } from "@/components/ViewAs";
import { HOW } from "@/lib/brand/copy";
import type { LandingData, SettledTrade } from "@/lib/brand/landing";
import { COMPANY, DATA_COMPANY, FOOTER } from "@/lib/copy";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { dollars } from "@/lib/money";
import { PLANS, TRIAL } from "@/lib/plans";
import { Mark } from "../Bits";
import { LiveWindow } from "./LiveWindow";

const cents = (p: number) => `${Math.round(p * 100)}¢`;
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const START = `Start for $${TRIAL.fee}`;
const UNDER = `Then $${PLANS.insidir.price}/mo. Cancel in one click.`;

function Nav() {
  return (
    <header className="lx-nav">
      <a className="lx-logo" href="/" aria-label="Insidir home"><Mark /><span>Insidir</span></a>
      <nav aria-label="Primary" className="lx-nav__links">
        <a href="/methodology">Methodology</a>
        <a href="#pricing">Pricing</a>
        <a href="/login">Log in</a>
      </nav>
    </header>
  );
}

function Stats({ s }: { s: LandingData["stats"] }) {
  const all: Array<[number | null, string, string]> = [
    [s.tracked, "Tracked", "Wallets up $1M+ we track"],
    [s.verified, "Verified", "Wallets passing every criterion today"],
    [s.signals24h, "Signals", "Signals sent in the last 24 hours"],
  ];
  const items = all.filter((x): x is [number, string, string] => x[0] !== null);
  if (!items.length) return null;
  return (
    <section className="lx-section lx-stats" aria-label="Live numbers" data-testid="hero-stats">
      {items.map(([n, k, t]) => <div key={k} title={t}><span className="lx-mono lx-accent lx-stat">{n.toLocaleString("en-US")}</span><span className="lx-label">{k}</span></div>)}
    </section>
  );
}

function How() {
  return (
    <section id="how" className="lx-section" aria-labelledby="how-h" data-testid="how">
      <h2 id="how-h" className="lx-h2">How it works</h2>
      <ol className="lx-cols">
        {HOW.map((h, i) => <li key={h.t} className="lx-card"><span className="lx-mono lx-dim">0{i + 1}</span><h3>{h.t.replace(/\.$/, "")}</h3><p>{h.d}</p></li>)}
      </ol>
    </section>
  );
}

function Who({ t }: { t: SettledTrade }) {
  return <>{t.verified ? "Verified " : ""}<span className="lx-mono">{shortWallet(t.wallet)}</span></>;
}

function SignalScreen({ t }: { t: SettledTrade }) {
  const result = Math.round(((t.result === "won" ? 1 : 0) - t.price) / t.price * 100);
  return (
    <div className="lx-window lx-shot" data-testid="product-signal">
      <div className="lx-window__bar"><span className="lx-dots" aria-hidden="true"><i /><i /><i /></span><span className="lx-window__title">Signal</span><span className="lx-window__meta lx-mono">{DAY.format(new Date(t.at))}</span></div>
      <div className="lx-signal">
        <p className="lx-signal__line"><Who t={t} />{t.pnl !== null && t.pnl > 0 ? <>, up <span className="lx-mono">{dollars(t.pnl)}</span></> : null}, opened <span className="lx-mono lx-accent">{dollars(t.amount)}</span> on {t.outcome} in “{t.title}” at <span className="lx-mono">{cents(t.price)}</span>.</p>
        <dl className="lx-kv">
          <div><dt>Entry</dt><dd className="lx-mono">{cents(t.price)}</dd></div>
          <div><dt>Settled</dt><dd className="lx-mono">{DAY.format(new Date(t.settledAt))}</dd></div>
          <div><dt>Result</dt><dd className="lx-mono">{t.result === "won" ? "Won" : "Lost"} {result >= 0 ? "+" : "−"}{Math.abs(result)}%</dd></div>
        </dl>
      </div>
    </div>
  );
}

function LedgerScreen({ rows }: { rows: SettledTrade[] }) {
  return (
    <div className="lx-window lx-shot" data-testid="product-ledger">
      <div className="lx-window__bar"><span className="lx-dots" aria-hidden="true"><i /><i /><i /></span><span className="lx-window__title">Ledger</span><span className="lx-window__meta lx-mono">settled · $1M+ wallets</span></div>
      <table className="lx-feed lx-feed--ledger">
        <thead><tr><th scope="col">Settled</th><th scope="col">Position</th><th scope="col" className="lx-r">Entry</th><th scope="col" className="lx-r">Result</th></tr></thead>
        <tbody>{rows.map(t => {
          const r = Math.round(((t.result === "won" ? 1 : 0) - t.price) / t.price * 100);
          return <tr key={t.id}><td className="lx-mono lx-dim">{DAY.format(new Date(t.settledAt))}</td><td className="lx-market">{t.outcome} · {t.title}</td><td className="lx-mono lx-r">{cents(t.price)}</td><td className="lx-mono lx-r">{r >= 0 ? "+" : "−"}{Math.abs(r)}%</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function Product({ settled }: { settled: SettledTrade[] }) {
  if (!settled.length) return null;
  return (
    <section className="lx-section" aria-labelledby="product-h" data-testid="product">
      <h2 id="product-h" className="lx-h2">The product</h2>
      <div className="lx-row">
        <SignalScreen t={settled[0]!} />
        <p className="lx-caption"><b>Signals.</b> A push within seconds when a wallet you follow opens a position.<br />With the market, the price and your sizing.</p>
      </div>
      <div className="lx-row lx-row--flip">
        <LedgerScreen rows={settled.slice(0, 6)} />
        <p className="lx-caption"><b>Ledger.</b> Every position you copy, with entry, price and result.<br />Shown here: the last six settled $1M+ positions, losses included.</p>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="lx-section" aria-labelledby="price-h" data-testid="pricing">
      <div className="lx-card lx-price">
        <h2 id="price-h" className="lx-h2">Pricing</h2>
        <p className="lx-price__n"><span className="lx-mono">${TRIAL.fee}</span> for {TRIAL.days} days, then <span className="lx-mono">${PLANS.insidir.price}</span>/mo.</p>
        <p className="lx-sub">Signals, sizing, exit signals and the ledger. Cancel in one click.</p>
        <a className="lx-btn" href="/go?step=checkout" data-checkout="pricing" data-unlock="pricing" data-testid="pricing-cta">{START}</a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lx-foot" data-testid="brand-foot">
      <nav aria-label="Footer" className="lx-foot__links">
        <a href="/methodology">Methodology</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </nav>
      <p className="lx-foot__legal">{FOOTER} {DATA_COMPANY} {COMPANY.name}, {COMPANY.place}.</p>
    </footer>
  );
}

export function Landing({ d }: { d: LandingData }) {
  return (
    <>
      <ViewAs />
      <main className="lx" data-testid="landing">
        <Nav />
        <section className="lx-hero" aria-labelledby="hero-h" data-testid="hero">
          <p className="lx-label">Prediction market intelligence</p>
          <h1 id="hero-h" className="lx-h1">The intelligence layer for prediction markets.</h1>
          <p className="lx-sub lx-hero__sub" data-testid="hero-sub">We track every Polymarket wallet up $1M+, verify which ones are consistently good, and tell you the moment they move.</p>
          <a className="lx-btn" href="/go?step=checkout" data-checkout="hero" data-unlock="hero" data-testid="hero-start">{START}</a>
          <p className="lx-small" data-testid="hero-terms">{UNDER}</p>
          <div className="lx-hero__window"><LiveWindow initial={d.lead.slice(0, 6)} now={d.now} /></div>
        </section>
        <Stats s={d.stats} />
        <How />
        <Product settled={d.settled} />
        <Pricing />
        <Footer />
      </main>
    </>
  );
}
