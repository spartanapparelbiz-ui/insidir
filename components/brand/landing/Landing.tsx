/* The landing: a scrolling page of stages in the hero spec's language. Each stage is a full-viewport black stage with
 * one background that never animates; its foreground performs once as it enters (components/brand/StageMotion.tsx).
 *   1 Hero (the globe) · 2 The problem (black) · 3 The check (markets.jpg) · 4 Live (the globe's poster, faint) ·
 *   5 Markets (black) · 6 Proof (space.jpg) · 7 Pricing (world.jpg) · 8 FAQ (black) · 9 Final (the globe again,
 *   the footer inside).
 * Every number is live (lib/brand/landing.ts); a stage with nothing real to show says so or steps aside. */
import type { CSSProperties } from "react";
import Image from "next/image";
import { category as categoryInfo, categoryPhotos } from "@/lib/brand/categories";
import { ASK_PLACEHOLDER, FAQ, HERO, PAST, PROBLEM, STAGES, faqLd } from "@/lib/brand/copy";
import { slotPhoto } from "@/lib/brand/images";
import type { LandingData } from "@/lib/brand/landing";
import { dollars } from "@/lib/money";
import { AskBox } from "../AskBox";
import { Arrow, Lines, m, Pill } from "../Bits";
import { CheckCard } from "../CheckCard";
import { Faq } from "../Faq";
import { LiveFeed } from "../LiveFeed";
import { MoneyCard } from "../MoneyCard";
import { BrandFoot, BrandNav } from "../Nav";
import { PayMoments } from "../PayMoments";
import { Stage } from "../Stage";
import { StageMotion } from "../StageMotion";

function Hero() {
  return (
    <Stage bg={{ kind: "globe", dark: 0 }} inner={false} testid="hero" labelledBy="hero-h">
      <BrandNav motion />
      <div className="b-hero-inner">
        <Lines as="h1" id="hero-h" lines={HERO.h1} />
        <p className="b-sub" {...m("lift", 0.58)}>{HERO.sub.map((l, i) => <span key={i}>{l}{i < HERO.sub.length - 1 ? <br /> : null}{i < HERO.sub.length - 1 ? " " : null}</span>)}</p>
        <div className="b-ctas">
          <Pill href="#check" delay={0.9} data-testid="hero-check">Check my bet</Pill>
          <Pill href="/go" kind="ghost" delay={0.97} data-testid="hero-start" data-checkout="hero">Start for $1</Pill>
        </div>
      </div>
    </Stage>
  );
}

function Live({ d }: { d: LandingData }) {
  return (
    <Stage id="live" bg={{ kind: "globe", faint: true, poster: true }} testid="live" labelledBy="live-h">
      <div className="b-head"><Lines id="live-h" lines={STAGES.live} size={64} /></div>
      <LiveFeed initial={{ now: d.now, pulse: d.pulse, bets: d.bets }} />
    </Stage>
  );
}

function Problem() {
  return (
    <Stage testid="problem" labelledBy="problem-h">
      <div className="b-center">
        <Lines id="problem-h" lines={PROBLEM.h1} size={64} />
        <p className="b-sub" {...m("lift", 0.58)}>{PROBLEM.sub}</p>
      </div>
      <ul className="b-pains" style={{ listStyle: "none", padding: 0 }}>
        {PROBLEM.rows.map(([pain, fix], i) => (
          <li key={pain} className="b-pain b-glass" data-testid="pain-row" data-m="settle" style={{ "--d": `${0.8 + i * 0.12}s` } as CSSProperties}>
            <span className="b-pain__p">{pain}</span><Arrow /><span className="b-pain__f">{fix}</span>
          </li>
        ))}
      </ul>
    </Stage>
  );
}

function Check({ d }: { d: LandingData }) {
  const mk = d.market;
  const top = (side: "yes" | "no") => d.positions.filter(p => p.tier === "millionaire" && p.side === side).sort((a, b) => b.dollars - a.dollars)[0]?.pnl ?? null;
  return (
    <Stage id="check" bg={{ kind: "photo", photo: slotPhoto("markets") }} testid="check" labelledBy="check-h">
      <div className="b-head"><Lines id="check-h" lines={STAGES.check} size={64} /></div>
      <div className="b-col">
        <AskBox chips={d.chips} placeholder={ASK_PLACEHOLDER} cta="Check" />
        {mk ? (
          <div data-m="settle" style={{ "--d": "1s" } as CSSProperties}>
            <CheckCard demo testid="demo-check" marketKey={`p:${mk.marketId}`} title={mk.title} label={`${categoryInfo(mk.category).name} · a real market, checked live`}
              money={{ yes: mk.millionaire.yes, no: mk.millionaire.no, yesLabel: mk.yesLabel, noLabel: mk.noLabel, topPnl: { yes: top("yes"), no: top("no") } }}>
              <MoneyCard m={mk} positions={d.positions} bare title={false} millionaire={false} testid="demo-details"
                footer={<a className="b-btn b-panel-pill" style={{ justifySelf: "start" }} href={`/read/open?pick=polymarket:${mk.marketId}`}>Open the full check</a>} />
            </CheckCard>
          </div>
        ) : null}
      </div>
    </Stage>
  );
}

function Markets({ d }: { d: LandingData }) {
  const list = d.categories.list, photos = categoryPhotos(list.map(c => c.slug)), when = d.categories.window === "day" ? "today" : "this week";
  return (
    <Stage testid="markets" labelledBy="markets-h">
      <div className="b-head"><Lines id="markets-h" lines={STAGES.markets} size={64} /></div>
      {list.length ? (
        <div className="b-grid" data-testid="category-cards">
          {list.map((c, i) => (
            <a key={c.slug} className="b-ccard" href={`/markets/${c.slug}`} data-testid="category-card" data-m="settle" style={{ "--d": `${0.5 + i * 0.06}s` } as CSSProperties}>
              <span className="b-ccard__img"><Image src={photos[i]!.src} alt="" fill sizes="(max-width: 552px) 50vw, (max-width: 1160px) 33vw, 300px" quality={60} /></span>
              <span className="b-ccard__txt">
                <h3 className="b-ccard__name">{categoryInfo(c.slug).name}</h3>
                <span className="b-small" style={{ color: "var(--ink-muted)" }}>{c.millionaire ? `${dollars(c.millionaire)} millionaire money ${when}` : `${dollars(c.pro)} Pro money ${when}`}</span>
              </span>
            </a>
          ))}
        </div>
      ) : <p className="b-empty" style={{ textAlign: "center" }}>No category has live millionaire money right now.</p>}
    </Stage>
  );
}

function Proof({ d }: { d: LandingData }) {
  if (!d.proof) return null;
  const r = d.proof.record, net = `${r.net >= 0 ? "+" : "−"}$${Math.abs(Math.round(r.net)).toLocaleString("en-US")}`;
  return (
    <Stage bg={{ kind: "photo", photo: slotPhoto("space") }} testid="proof" label="The record">
      <div className="b-center">
        <p className="b-giant b-num" data-testid="proof-net"><span className="ln"><span className="ln-i">{net}</span></span></p>
        <p className="b-sub" {...m("lift", 0.5)}>$100 on every {d.proof.label} · {r.n.toLocaleString("en-US")} settled</p>
        <p className="b-small" style={{ marginTop: 14 }} {...m("quiet", 0.8)}>{PAST}</p>
      </div>
    </Stage>
  );
}

function Pricing() {
  return (
    <Stage id="pricing" bg={{ kind: "photo", photo: slotPhoto("world") }} testid="pricing" labelledBy="price-h">
      <div className="b-center">
        <Lines id="price-h" lines={STAGES.pricing} size={72} />
        <p className="b-sub" {...m("lift", 0.58)} data-testid="price-line">{STAGES.pricingSub}</p>
        <div className="b-ctas"><Pill href="/go" delay={0.9} data-testid="pricing-cta" data-checkout="pricing">Start for $1</Pill></div>
      </div>
    </Stage>
  );
}

function FaqStage() {
  return (
    <Stage id="faq" testid="faq" labelledBy="faq-h">
      <div className="b-head"><Lines id="faq-h" lines={STAGES.faq} size={64} /></div>
      <Faq items={FAQ} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd() }} />
    </Stage>
  );
}

function Final() {
  return (
    <Stage bg={{ kind: "globe", dark: 0.2 }} testid="final-cta" labelledBy="final-h" after={<BrandFoot />}>
      <div className="b-center">
        <Lines id="final-h" lines={STAGES.final} />
        <div className="b-ctas">
          <Pill href="/go" delay={0.9} data-testid="final-start" data-checkout="final">Start for $1</Pill>
          <Pill href="#check" kind="ghost" delay={0.97}>Check my bet</Pill>
        </div>
      </div>
    </Stage>
  );
}

export function Landing({ d }: { d: LandingData }) {
  return (
    <main className="b-root" data-testid="landing">
      <Hero />
      <Problem />
      <Check d={d} />
      <Live d={d} />
      <Markets d={d} />
      <Proof d={d} />
      <Pricing />
      <FaqStage />
      <Final />
      {d.member ? null : <PayMoments ctx={{ count: d.pulse.count, window: d.pulse.window, biggest: d.biggest }} now={d.now} />}
      <StageMotion />
    </main>
  );
}
