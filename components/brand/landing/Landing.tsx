/* The landing: a scrolling page of stages in the hero spec's language. Each stage is a full-viewport black stage with
 * one background that never animates; its foreground performs once as it enters (components/brand/StageMotion.tsx).
 *   1 Hero (the globe) · 2 Live (the globe's poster, faint) · 3 The Read (markets.jpg) · 4 Markets (black) ·
 *   5 Proof (space.jpg) · 6 Pricing (world.jpg) · 7 FAQ (black) · 8 Final (the globe again, the footer inside).
 * Every number is live (lib/brand/landing.ts); a stage with nothing real to show says so or steps aside. */
import type { CSSProperties } from "react";
import Image from "next/image";
import { category as categoryInfo, categoryPhotos } from "@/lib/brand/categories";
import { ASK_PLACEHOLDER, FAQ, HERO, PAST, STAGES, faqLd } from "@/lib/brand/copy";
import { slotPhoto } from "@/lib/brand/images";
import type { LandingData } from "@/lib/brand/landing";
import { dollars } from "@/lib/money";
import { AhaWatch } from "../AhaWatch";
import { AskBox } from "../AskBox";
import { Lines, m, Pill } from "../Bits";
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
          <Pill href="/go" delay={0.9} data-testid="hero-start" data-checkout="hero">Start for $1</Pill>
          <Pill href="#live" kind="ghost" delay={0.97} data-testid="hero-live">See it live</Pill>
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

function TheRead({ d }: { d: LandingData }) {
  return (
    <Stage bg={{ kind: "photo", photo: slotPhoto("markets") }} testid="the-read" labelledBy="read-h">
      <div className="b-head"><Lines id="read-h" lines={STAGES.read} size={64} /></div>
      <div className="b-col">
        <AskBox chips={d.chips} placeholder={ASK_PLACEHOLDER} />
        {d.market ? <MoneyCard m={d.market} positions={d.positions} build testid="aha-read"
          footer={<a className="b-btn b-panel-pill" data-m="settle" style={{ justifySelf: "start", "--d": "1.4s" } as CSSProperties} href={`/read/open?pick=polymarket:${d.market.marketId}`}>Open the full Read</a>} /> : null}
      </div>
      {d.market ? <AhaWatch /> : null}
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
          <Pill href="#live" kind="ghost" delay={0.97}>See it live</Pill>
        </div>
      </div>
    </Stage>
  );
}

export function Landing({ d }: { d: LandingData }) {
  return (
    <main className="b-root" data-testid="landing">
      <Hero />
      <Live d={d} />
      <TheRead d={d} />
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
