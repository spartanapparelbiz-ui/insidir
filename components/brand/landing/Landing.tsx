/* The landing page (visitors): one cinematic scroll over the brand photos. Every number on it is live from
 * lib/brand/landing.ts; a section with nothing real to show says so or steps aside. */
import { category as categoryInfo, categoryPhoto } from "@/lib/brand/categories";
import { BASE_STRIP, DELAY_LABEL, FAQ, FEATURES, H1, HERO_SUB, LOSSES, PAST, PRICE_LINE, START, faqLd } from "@/lib/brand/copy";
import { slotPhoto } from "@/lib/brand/images";
import type { LandingData } from "@/lib/brand/landing";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { dollars } from "@/lib/money";
import { PLANS, TRIAL } from "@/lib/plans";
import { BetRow } from "../BetRow";
import { BrandImage } from "../BrandImage";
import { Btn, cents, SecLabel, Side, TierBadge } from "../Bits";
import { LiveBoard, LivePill } from "../Live";
import { MoneyCard } from "../MoneyCard";
import { BrandFoot, BrandNav } from "../Nav";
import { Rise } from "../motion";
import { HowSteps } from "./How";

const readHref = (marketId: string) => `/read/open?pick=polymarket:${marketId}`;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;

function Hero({ d }: { d: LandingData }) {
  return (
    <BrandImage as="section" photo={slotPhoto("hero")} sizes="100vw" priority zoom="hero" className="b-hero" data-testid="hero">
      <div className="b-hero__shade" aria-hidden="true" />
      <div className="b-wrap b-hero__grid">
        <div className="b-hero__left">
          <LivePill initial={d.pulse} />
          <h1 className="b-h1">{H1.before}<span className="b-grad">{H1.accent}</span>{H1.after}</h1>
        </div>
        <div className="b-hero__right">
          <p>{HERO_SUB}</p>
          <Btn href="/go" data-testid="hero-cta" data-checkout="hero">Show me</Btn>
        </div>
      </div>
      <div className="b-hero__base"><div className="b-wrap"><span className="b-label">{BASE_STRIP}</span></div></div>
    </BrandImage>
  );
}

function Board({ d }: { d: LandingData }) {
  return (
    <section className="b-board" aria-labelledby="board-h" data-testid="live-board">
      <div className="b-wrap">
        <div className="b-board__head">
          <h2 id="board-h" className="b-label"><span className="b-dot" aria-hidden="true" /> Millionaire bets, live board</h2>
          {d.delayed ? <span className="b-delay" data-testid="board-delay">{DELAY_LABEL}</span> : null}
        </div>
        <LiveBoard initial={{ now: d.now, pulse: d.pulse, bets: d.bets }} n={5} rowHref={b => readHref(b.marketId)}
          empty="No millionaire bets in the last hours yet. The board fills as the watchlist bets." />
      </div>
    </section>
  );
}

function Markets({ d }: { d: LandingData }) {
  const list = d.categories.list;
  return (
    <section className="b-sec" id="markets" aria-labelledby="markets-h" data-testid="markets">
      <div className="b-wrap">
        <Rise className="b-sec__head"><SecLabel>Markets</SecLabel><h2 id="markets-h" className="b-h2">Every market people <span className="b-grad">bet</span> on.</h2></Rise>
        {list.length ? (
          <div className="b-cards" data-testid="category-cards">
            {list.map(c => (
              <BrandImage key={c.slug} as="a" href={`/markets/${c.slug}`} photo={categoryPhoto(c.slug)} sizes="(min-width: 1100px) 300px, (min-width: 640px) 40vw, 72vw" fade zoom
                className="b-ccard" data-testid="category-card" alt="">
                <span style={{ display: "grid" }}>
                  <h3 className="b-ccard__name">{categoryInfo(c.slug).name}</h3>
                  <span className="b-mono b-ccard__line">
                    {c.millionaire ? `${dollars(c.millionaire)} millionaire money` : `${dollars(c.pro)} Pro money`} {d.categories.window === "day" ? "today" : "this week"} · {c.markets} {c.markets === 1 ? "market" : "markets"}
                  </span>
                </span>
              </BrandImage>
            ))}
          </div>
        ) : <p className="b-muted">No category has live millionaire money right now.</p>}
      </div>
    </section>
  );
}

function How({ d }: { d: LandingData }) {
  const stage = (
    <BrandImage photo={slotPhoto("markets")} sizes="(min-width: 900px) 58vw, 100vw" zoom className="b-how__stage" data-testid="how-stage">
      {d.market ? <MoneyCard m={d.market} testid="how-read" /> : (
        <div className="b-read b-glass b-glass--solid"><span className="b-label">The Read</span><p className="b-read__q">Paste a market to see its millionaire money.</p></div>
      )}
    </BrandImage>
  );
  return (
    <section className="b-sec" aria-labelledby="how-h" data-testid="how">
      <div className="b-wrap">
        <Rise className="b-sec__head"><SecLabel>How it works</SecLabel><h2 id="how-h" className="b-h2">One paste. The whole <span className="b-grad">market</span>.</h2></Rise>
        <HowSteps stage={stage} />
      </div>
    </section>
  );
}

function Proof({ d }: { d: LandingData }) {
  if (!d.proof) return null;
  const r = d.proof.record;
  return (
    <BrandImage as="section" photo={slotPhoto("space")} sizes="100vw" zoom className="b-over" data-testid="proof" aria-label="The record">
      <div className="b-wrap">
        <Rise className="b-proof b-glass b-glass--solid">
          <SecLabel>The record</SecLabel>
          <p className="b-proof__stat">$100 on every {d.proof.label}: <span className={r.net >= 0 ? "b-up" : "b-down"} data-testid="proof-net">{signed(r.net)}</span> over {r.n.toLocaleString("en-US")} settled.</p>
          <p className="b-muted" style={{ margin: 0 }}>{r.won} won, {r.lost} lost, at the price we showed plus a cent. {PAST} {LOSSES}</p>
          <div><Btn href="/results" ghost small>See the record</Btn></div>
        </Rise>
      </div>
    </BrandImage>
  );
}

function Features({ d }: { d: LandingData }) {
  const bet = d.bets[0] ?? null;
  const crop: Record<string, React.ReactNode> = {
    money: d.market ? <MoneyCard m={d.market} className="b-crop" testid="crop-money" /> : null,
    pings: bet ? (
      <div className="b-crop" data-testid="crop-ping">
        <span className="b-label"><span className="b-dot" aria-hidden="true" /> Insidir · {d.delayed ? "an hour ago" : "now"}</span>
        <span><TierBadge tier={bet.tier} /> {bet.short} bet <b>{dollars(bet.amount)}</b> on <Side outcome={bet.outcome} side={bet.side} /> at {cents(bet.priceThen)}</span>
        <span className="b-muted">{bet.title}</span>
      </div>
    ) : null,
    follow: d.wallet ? (
      <div className="b-crop" data-testid="crop-follow">
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><TierBadge tier={d.wallet.tier} /><span className="b-mono">{shortWallet(d.wallet.wallet)}</span></span>
        <span className="b-big b-up">{signed(d.wallet.pnl)}</span>
        <span className="b-muted">all-time profit · {d.wallet.bets} {d.wallet.bets === 1 ? "bet" : "bets"} of $5K+ in 30 days</span>
      </div>
    ) : null,
    price: d.bestPrice ? (
      <div className="b-crop" data-testid="crop-price">
        <span className="b-muted">{d.bestPrice.question}</span>
        <div className="b-kv"><span>Kalshi</span><span className="b-num">{d.bestPrice.yes.kalshi === null ? "–" : `YES ${cents(d.bestPrice.yes.kalshi)}`}</span></div>
        <div className="b-kv"><span>Polymarket</span><span className="b-num">{d.bestPrice.yes.polymarket === null ? "–" : `YES ${cents(d.bestPrice.yes.polymarket)}`}</span></div>
      </div>
    ) : null,
  };
  return (
    <section className="b-sec" aria-labelledby="feat-h" data-testid="features">
      <div className="b-wrap">
        <Rise className="b-sec__head"><SecLabel>Features</SecLabel><h2 id="feat-h" className="b-h2">Everything you check <span className="b-grad">before</span> you bet.</h2></Rise>
        <div className="b-bento">
          {FEATURES.map((f, i) => (
            <Rise key={f.k} className="b-tile b-glass" delay={i % 2}>
              <h3>{f.t}</h3><p>{f.d}</p>{crop[f.k]}
            </Rise>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <BrandImage as="section" photo={slotPhoto("world")} sizes="100vw" zoom className="b-over" data-testid="pricing" aria-labelledby="price-h">
      <div className="b-wrap">
        <Rise className="b-price b-glass b-glass--solid">
          <SecLabel>Pricing</SecLabel>
          <h2 id="price-h" className="b-price__big">${TRIAL.fee} for your first {TRIAL.days} days.</h2>
          <p style={{ margin: 0 }} data-testid="price-line">{PRICE_LINE}</p>
          <ul className="b-list">
            <li>Every millionaire bet, live, in the categories you pick</li>
            <li>Millionaire and Pro money on every market you paste</li>
            <li>Pings when the wallets you follow bet</li>
            <li>The best price on Kalshi and Polymarket</li>
          </ul>
          <Btn href="/go" block data-testid="pricing-cta" data-checkout="pricing">{START}</Btn>
          <p className="b-small" style={{ margin: 0 }}>Then ${PLANS.insidir.price}/month. 18+. Information, not advice.</p>
        </Rise>
      </div>
    </BrandImage>
  );
}

function Faq() {
  return (
    <section className="b-sec" id="faq" aria-labelledby="faq-h" data-testid="faq">
      <div className="b-wrap">
        <Rise className="b-sec__head"><SecLabel>FAQ</SecLabel><h2 id="faq-h" className="b-h2">Questions.</h2></Rise>
        <div className="b-faq">
          {FAQ.map(f => <details key={f.id} data-testid="faq-item"><summary>{f.q}</summary><div>{f.a}</div></details>)}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd() }} />
    </section>
  );
}

function FinalCta() {
  return (
    <BrandImage as="section" photo={slotPhoto("cta")} sizes="100vw" zoom className="b-cta" data-testid="final-cta" aria-labelledby="cta-h">
      <div className="b-cta__body">
        <h2 id="cta-h" className="b-h2">Ready to see where the <span className="b-grad">money</span> is?</h2>
        <Btn href="/go" data-testid="final-start" data-checkout="final">{START}</Btn>
      </div>
      <BrandFoot />
    </BrandImage>
  );
}

export function Landing({ d }: { d: LandingData }) {
  return (
    <main className="b-root" data-testid="landing">
      <BrandNav />
      <Hero d={d} />
      <Board d={d} />
      <Markets d={d} />
      <How d={d} />
      <Proof d={d} />
      <Features d={d} />
      <Pricing />
      <Faq />
      <FinalCta />
    </main>
  );
}

export { BetRow };
