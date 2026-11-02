/* The landing page: a scroll story over the brand photos. The first screen is the product, working: the ask box, the
 * live feed, and a free Read that builds itself. Then the mark, Markets, How it works, Proof, Features, Pricing, FAQ and
 * the final call. Server-rendered complete and at rest (data-* hooks); components/brand/landing/Motion.tsx animates it.
 * Every number is live from lib/brand/landing.ts; a scene with nothing real to show says so or steps aside. */
import { category as categoryInfo, categoryPhotos } from "@/lib/brand/categories";
import { ASK_FREE, ASK_PLACEHOLDER, FAQ, FEATURES, FIRST, PAST, PRICE_LINE, SCENES, START, STEPS, faqLd } from "@/lib/brand/copy";
import { slotPhoto } from "@/lib/brand/images";
import type { LandingData } from "@/lib/brand/landing";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { dollars } from "@/lib/money";
import { TRIAL } from "@/lib/plans";
import { AskBox } from "../AskBox";
import { BrandImage } from "../BrandImage";
import { Btn, cents, Num, SecLabel, signedDollars, TierBadge } from "../Bits";
import { LiveFeed } from "../LiveFeed";
import { MoneyCard } from "../MoneyCard";
import { BrandFoot, BrandNav } from "../Nav";
import { PayMoments } from "../PayMoments";
import { Faq } from "./Faq";
import { LandingMotion } from "./Motion";

/** The brackets mark, one L per SVG so each can travel on its own. */
const BracketA = () => <svg viewBox="0 0 64 64" aria-hidden="true" fill="currentColor"><rect x="0" y="0" width="40" height="18" /><rect x="0" y="0" width="18" height="46" /></svg>;
const BracketB = () => <svg viewBox="0 0 64 64" aria-hidden="true" fill="currentColor"><rect x="46" y="18" width="18" height="46" /><rect x="24" y="46" width="40" height="18" /></svg>;

function Head({ label, before, accent, after, id }: { label: string; before: string; accent: string; after: string; id: string }) {
  return (
    <div className="b-sec__head">
      <SecLabel>{label}</SecLabel>
      <h2 id={id} className="b-h2" data-split="">{before}<span className="b-grad">{accent}</span>{after}</h2>
    </div>
  );
}

function First({ d }: { d: LandingData }) {
  return (
    <section className="b-first" data-scene="first" aria-labelledby="first-h" data-testid="first">
      <div className="b-first__bg" aria-hidden="true">
        <div data-pushbg="" style={{ position: "absolute", inset: 0 }}>
          <BrandImage photo={slotPhoto("hero")} sizes="100vw" priority parallax={false} alt="" />
        </div>
        <div className="b-first__shade" />
      </div>
      <div className="b-wrap b-first__in">
        <div className="b-first__main">
          <h1 id="first-h" className="b-first__h" data-intro="">{FIRST.before}<span className="b-grad">{FIRST.accent}</span>{FIRST.after}</h1>
          <div data-intro=""><AskBox chips={d.chips} placeholder={ASK_PLACEHOLDER} /></div>
          <p className="b-small" data-intro="">{ASK_FREE}</p>
          {d.market ? (
            <div data-intro="" style={{ display: "grid", gap: 8, maxWidth: 620 }}>
              <span className="b-label"><span className="b-dot" aria-hidden="true" /> Live Read · most millionaire money right now</span>
              <MoneyCard m={d.market} positions={d.positions} build testid="aha-read"
                footer={<a className="b-btn b-btn--ghost b-btn--sm" href={`/read/open?pick=polymarket:${d.market.marketId}`} style={{ justifySelf: "start" }}>Open the full Read →</a>} />
            </div>
          ) : null}
        </div>
        <div data-intro="">
          <LiveFeed initial={{ now: d.now, pulse: d.pulse, bets: d.bets }} />
        </div>
      </div>
    </section>
  );
}

function Mark() {
  return (
    <section className="b-mark" data-scene="mark" aria-label="Where the money is" data-testid="mark">
      <div className="b-mark__beam" data-mark-beam="" />
      <div className="b-mark__in">
        <div className="b-mark__svg" style={{ position: "relative" }}>
          <span data-bracket="a" style={{ position: "absolute", inset: 0 }}><BracketA /></span>
          <span data-bracket="b" style={{ position: "absolute", inset: 0 }}><BracketB /></span>
        </div>
        <p className="b-mark__line" data-mark-line="">{SCENES.mark.line}</p>
      </div>
    </section>
  );
}

function Markets({ d }: { d: LandingData }) {
  const list = d.categories.list;
  const photos = categoryPhotos(list.map(c => c.slug));
  const when = d.categories.window === "day" ? "today" : "this week";
  return (
    <section className="b-sec b-scene" data-scene="markets" aria-labelledby="markets-h" data-testid="markets">
      <div className="b-wrap"><Head id="markets-h" label={SCENES.markets.label} before={SCENES.markets.before} accent={SCENES.markets.accent} after={SCENES.markets.after} /></div>
      {list.length ? (
        <div className="b-hwrap">
          <div className="b-cards" data-hrow="" data-testid="category-cards">
            {list.map((c, i) => (
              <BrandImage key={c.slug} as="a" href={`/markets/${c.slug}`} photo={photos[i]!} sizes="(min-width: 768px) 320px, 72vw" fade className="b-ccard" data-testid="category-card" alt="">
                <h3 className="b-ccard__name">{categoryInfo(c.slug).name}</h3>
                <span className="b-ccard__line">{c.millionaire ? `${dollars(c.millionaire)} millionaire money ${when}` : `${dollars(c.pro)} Pro money ${when}`}</span>
              </BrandImage>
            ))}
          </div>
        </div>
      ) : <div className="b-wrap"><p className="b-muted">No category has live millionaire money right now.</p></div>}
    </section>
  );
}

function How({ d }: { d: LandingData }) {
  const market = d.market;
  const ping = d.biggest;
  return (
    <section className="b-sec b-scene" data-scene="how" aria-labelledby="how-h" data-testid="how">
      <div className="b-wrap">
        <Head id="how-h" label={SCENES.how.label} before={SCENES.how.before} accent={SCENES.how.accent} after={SCENES.how.after} />
        <div className="b-how">
          <ol className="b-steps" data-testid="how-steps">
            {STEPS.map((s, i) => (
              <li key={s.k} className="b-step" data-step={i} data-on={i === 0 ? "true" : "false"}>
                <span className="b-label">0{i + 1} · {s.k}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
          <BrandImage photo={slotPhoto("markets")} sizes="(min-width: 900px) 58vw, 100vw" className="b-how__stage" data-testid="how-stage">
            <div className="b-how__panel">
              <div className="b-how__pane" data-pane="0">
                <div className="b-ask" aria-hidden="true"><span className="b-typed" data-typed={market?.title ?? "Chiefs vs. Bills"} style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{market?.title ?? "Chiefs vs. Bills"}</span><span className="b-btn" style={{ minHeight: 48 }}>→</span></div>
              </div>
              <div className="b-how__pane" data-pane="1" hidden>
                {market ? <MoneyCard m={market} positions={d.positions} testid="how-read" /> : <div className="b-read b-glass b-glass--solid"><p className="b-read__q">Paste a market to read its money.</p></div>}
              </div>
              <div className="b-how__pane" data-pane="2" hidden>
                {market ? <MoneyCard m={market} testid="how-open" footer={<span className="b-open" data-open="">Open on Kalshi ↗</span>} /> : null}
              </div>
            </div>
            {ping ? (
              <div className="b-ping b-glass b-glass--solid" data-ping="" data-testid="how-ping">
                <span className="b-label"><span className="b-dot" aria-hidden="true" /> Insidir · ping</span>
                <span>A {ping.pnl !== null ? `${signedDollars(ping.pnl)} ` : ""}wallet just bet <b className="b-mono">{dollars(ping.amount)}</b> on {ping.title}</span>
              </div>
            ) : null}
          </BrandImage>
        </div>
      </div>
    </section>
  );
}

function Proof({ d }: { d: LandingData }) {
  if (!d.proof) return null;
  const r = d.proof.record;
  return (
    <BrandImage as="section" photo={slotPhoto("space")} sizes="100vw" className="b-over" data-testid="proof" aria-label="The record">
      <div className="b-wrap">
        <div className="b-proof b-glass b-glass--solid" data-rise="">
          <SecLabel>{SCENES.proof.label}</SecLabel>
          <p className="b-proof__stat"><Num value={Math.round(r.net)} format="usd-signed" className={r.net >= 0 ? "b-up" : "b-down"} data-testid="proof-net" data-count="">{`${r.net >= 0 ? "+" : "−"}$${Math.abs(Math.round(r.net)).toLocaleString("en-US")}`}</Num></p>
          <p className="b-proof__sub">$100 on every {d.proof.label} · <span className="b-mono">{r.n.toLocaleString("en-US")}</span> settled</p>
          <p className="b-small">{PAST}</p>
        </div>
      </div>
    </BrandImage>
  );
}

function Features({ d }: { d: LandingData }) {
  const bet = d.biggest;
  const crop: Record<string, React.ReactNode> = {
    money: d.market ? (
      <div className="b-crop" data-testid="crop-money">
        <span className="b-small">{d.market.title}</span>
        <div className="b-kv"><span className="b-label">Millionaire money</span><span className="b-mono">{dollars(d.market.millionaire.yes.dollars + d.market.millionaire.no.dollars)}</span></div>
        <div className="b-kv"><span className="b-label">Wallets</span><span className="b-mono">{d.market.millionaire.yes.wallets + d.market.millionaire.no.wallets}</span></div>
      </div>
    ) : null,
    pings: bet ? (
      <div className="b-crop" data-testid="crop-ping">
        <span className="b-label"><span className="b-dot" aria-hidden="true" /> Insidir</span>
        <span>A {bet.pnl !== null ? `${signedDollars(bet.pnl)} ` : ""}wallet bet <b className="b-mono">{dollars(bet.amount)}</b></span>
        <span className="b-small">{bet.title}</span>
      </div>
    ) : null,
    follow: d.wallet ? (
      <div className="b-crop" data-testid="crop-follow">
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><TierBadge tier={d.wallet.tier} /><span className="b-mono">{shortWallet(d.wallet.wallet)}</span></span>
        <span className="b-big b-up">{signedDollars(d.wallet.pnl)}</span>
        <span className="b-small"><span className="b-mono">{d.wallet.bets}</span> bets of $5K+ in 30 days</span>
      </div>
    ) : null,
    price: d.bestPrice ? (
      <div className="b-crop" data-testid="crop-price">
        <span className="b-small">{d.bestPrice.question}</span>
        <div className="b-kv"><span>Kalshi</span><span className="b-mono">{d.bestPrice.yes.kalshi === null ? "–" : `YES ${cents(d.bestPrice.yes.kalshi)}`}</span></div>
        <div className="b-kv"><span>Polymarket</span><span className="b-mono">{d.bestPrice.yes.polymarket === null ? "–" : `YES ${cents(d.bestPrice.yes.polymarket)}`}</span></div>
      </div>
    ) : null,
  };
  return (
    <section className="b-sec" aria-labelledby="feat-h" data-testid="features">
      <div className="b-wrap">
        <Head id="feat-h" label={SCENES.features.label} before={SCENES.features.before} accent={SCENES.features.accent} after={SCENES.features.after} />
        <div className="b-bento" data-stagger="">
          {FEATURES.map(f => <div key={f.k} className="b-tile b-glass"><h3>{f.t}</h3><p>{f.d}</p>{crop[f.k]}</div>)}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <BrandImage as="section" photo={slotPhoto("world")} sizes="100vw" className="b-over" data-testid="pricing" aria-labelledby="price-h">
      <div className="b-wrap">
        <div className="b-price b-glass b-glass--solid" data-rise="">
          <h2 id="price-h" className="b-price__big">${TRIAL.fee}</h2>
          <p className="b-price__line" data-testid="price-line">{PRICE_LINE}</p>
          <Btn href="/go" data-testid="pricing-cta" data-checkout="pricing">{START}</Btn>
        </div>
      </div>
    </BrandImage>
  );
}

function Final() {
  return (
    <BrandImage as="section" photo={slotPhoto("cta")} sizes="100vw" className="b-cta" data-testid="final-cta" aria-labelledby="cta-h">
      <div className="b-cta__body" data-scene="final">
        <svg className="b-cta__mark" viewBox="-1 -1 66 66" aria-hidden="true" data-draw="">
          <rect x="0" y="0" width="40" height="18" /><rect x="0" y="0" width="18" height="46" /><rect x="46" y="18" width="18" height="46" /><rect x="24" y="46" width="40" height="18" />
        </svg>
        <h2 id="cta-h" className="b-h2" data-split="">{SCENES.final.before}<span className="b-grad">{SCENES.final.accent}</span>{SCENES.final.after}</h2>
        <Btn href="/go" data-testid="final-start" data-checkout="final">{START}</Btn>
      </div>
      <BrandFoot />
    </BrandImage>
  );
}

export function Landing({ d }: { d: LandingData }) {
  return (
    <main className="b-root" data-testid="landing">
      <div className="b-progress" data-progress="" aria-hidden="true" />
      <BrandNav />
      <First d={d} />
      <Mark />
      <Markets d={d} />
      <How d={d} />
      <Proof d={d} />
      <Features d={d} />
      <Pricing />
      <section className="b-sec" id="faq" aria-labelledby="faq-h" data-testid="faq">
        <div className="b-wrap"><Head id="faq-h" label="FAQ" before="" accent="Questions" after="." /><Faq items={FAQ} /></div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd() }} />
      </section>
      <Final />
      {d.member ? null : <PayMoments ctx={{ count: d.pulse.count, window: d.pulse.window, biggest: d.biggest }} now={d.now} />}
      <LandingMotion />
    </main>
  );
}
