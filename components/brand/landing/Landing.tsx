/* The landing: a scrolling page of stages in the hero spec's language. Each stage is a full-viewport black stage with
 * one background that never animates; its foreground performs once as it enters (components/brand/StageMotion.tsx).
 *   Hero (the globe) · The Pulse (a live dashboard that assembles as you scroll) · Free right now (the check, today's
 *   #1 market, the last 3 bets: whole, no account) · Election Day board (Nov 3–4 ET only) · What members get (a sticky
 *   phone showing real screens) · Wallet spotlight · Your stake · Price gaps · Markets (a sideways row) · Proof ·
 *   Pricing · FAQ · Final (the globe again, the footer inside). New stages: ./Value.tsx; scroll motion: ./ScrollFx.tsx.
 * Every number is live (lib/brand/landing.ts); a stage with nothing real to show says so or steps aside. */
import { electionDay } from "@/lib/brand/pulse";
import type { CSSProperties } from "react";
import Image from "next/image";
import { category as categoryInfo, categoryPhotos } from "@/lib/brand/categories";
import { FAQ, HERO, PAST, STAGES, faqLd } from "@/lib/brand/copy";
import { dataLine } from "@/lib/brand/verdict";
import { slotPhoto } from "@/lib/brand/images";
import type { LandingData } from "@/lib/brand/landing";
import { dollars } from "@/lib/money";
import { Lines, m, Pill } from "../Bits";
import { BetRow } from "../BetRow";
import { InlineCheck } from "../InlineCheck";
import { Faq } from "../Faq";
import { MoneyCard } from "../MoneyCard";
import { HeroLine } from "../HeroLine";
import { BrandFoot, BrandNav } from "../Nav";
import { PayMoments } from "../PayMoments";
import { Stage } from "../Stage";
import { StageMotion } from "../StageMotion";
import { ViewAs } from "@/components/ViewAs";
import { ScrollFx } from "./ScrollFx";
import { BoardLeadStage, ElectionStage, GapsStage, MembersStage, PulseStage, SpotlightStage, StakeStage } from "./Value";

function Hero({ d }: { d: Pick<LandingData, "pulse"> }) {
  return (
    <Stage bg={{ kind: "globe", dark: 0 }} inner={false} testid="hero" labelledBy="hero-h" first>
      <BrandNav motion election={electionDay(Date.now())} />
      <div className="b-hero-inner">
        <Lines as="h1" id="hero-h" lines={HERO.h1} />
        <HeroLine initial={d.pulse} />
        <div className="b-ctas">
          <Pill href="#check" delay={0.9} data-testid="hero-check">Check my bet</Pill>
          <Pill href="/go" kind="ghost" delay={0.97} data-testid="hero-start" data-checkout="hero">Start for $1</Pill>
        </div>
      </div>
    </Stage>
  );
}

function Free({ d }: { d: LandingData }) {
  const t = d.top;
  return (
    <Stage id="free" testid="free" labelledBy="free-h">
      <div className="b-head"><Lines id="free-h" lines={STAGES.free} size={64} /></div>
      <div className="b-tiles3">
        <section id="check" className="b-glass b-pad b-tile3" data-testid="free-check-tile" data-m="settle" style={{ "--d": ".6s" } as CSSProperties}>
          <h3 className="b-panel-h">Check one bet</h3>
          <p className="b-small" style={{ marginBottom: 12 }}>Paste it or tap one: pick your side, see if millionaires agree.</p>
          <InlineCheck chips={d.chips} />
        </section>
        <section className="b-glass b-pad b-tile3" data-testid="free-top" data-m="settle" style={{ "--d": ".72s" } as CSSProperties}>
          <h3 className="b-panel-h">Today&apos;s #1 millionaire market</h3>
          {t ? (
            <div style={{ display: "grid", gap: 12 }}>
              <MoneyCard m={t.m} positions={t.positions} bare testid="free-top-card" />
              <div style={{ display: "grid", gap: 6, paddingTop: 12, borderTop: "1px solid var(--glass-line)" }}>
                <span className="b-label">Analyst line</span>
                <p style={{ margin: 0, fontWeight: 300, fontSize: 15, lineHeight: 1.5 }} data-testid="free-top-line">{dataLine({ yes: t.m.millionaire.yes, no: t.m.millionaire.no, yesLabel: t.m.yesLabel, noLabel: t.m.noLabel, pro: t.m.pro })}</p>
              </div>
              <a className="b-btn b-panel-pill" style={{ justifySelf: "start" }} href="/go" data-free="top">See every wallet in it</a>
              <p className="b-small">{t.window === "today" ? "Most $1M+ money since midnight ET." : "Most $1M+ money in the last 24 hours."} Information, not advice.</p>
            </div>
          ) : <p className="b-empty">No millionaire money today yet.</p>}
        </section>
        <section className="b-glass b-pad b-tile3" data-testid="free-last3" data-m="settle" style={{ "--d": ".84s" } as CSSProperties}>
          <h3 className="b-panel-h">The last 3 millionaire bets</h3>
          {d.last3.length ? (
            <>
              <ul className="b-rows">{d.last3.map(b => <li key={b.id} data-free="bet" style={{ cursor: "pointer" }}><BetRow bet={b} now={d.now} /></li>)}</ul>
              <p className="b-small" style={{ marginTop: 12 }} data-testid="free-more">{d.moreToday ? `+${d.moreToday} more today. ` : ""}Members see every one live.</p>
            </>
          ) : <p className="b-empty">No millionaire bets yet today.</p>}
        </section>
      </div>
    </Stage>
  );
}

function Markets({ d }: { d: LandingData }) {
  const list = d.categories.list, photos = categoryPhotos(list.map(c => c.slug)), when = d.categories.window === "day" ? "today" : "this week";
  return (
    <Stage testid="markets" labelledBy="markets-h" className="b-stage--hrow" style={{ "--n": list.length } as CSSProperties}>
      <div className="b-head"><Lines id="markets-h" lines={STAGES.markets} size={64} /></div>
      {list.length ? (
        <div className="b-hrow" data-hrow="" data-testid="category-cards">
          <div className="b-htrack" data-htrack="">
          {list.map((c, i) => (
            <a key={c.slug} className="b-ccard" href={`/markets/${c.slug}`} data-testid="category-card" data-m="settle" style={{ "--d": `${0.5 + i * 0.06}s` } as CSSProperties}>
              <span className="b-ccard__img"><Image src={photos[i]!.src} alt="" fill loading="eager" sizes="(max-width: 552px) 62vw, (max-width: 1160px) 270px, 300px" quality={90} /></span>
              <span className="b-ccard__txt">
                <h3 className="b-ccard__name">{categoryInfo(c.slug).name}</h3>
                <span className="b-small" style={{ color: "var(--ink-muted)" }}>{c.millionaire ? `${dollars(c.millionaire)} millionaire money ${when}` : `${dollars(c.pro)} Pro money ${when}`}</span>
              </span>
            </a>
          ))}
          </div>
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

/** Everything below the hero, from the full landing data. */
function Rest({ d }: { d: LandingData }) {
  return (
    <>
      {/* The lead: the Election Day board until Nov 4 ET, then the board. */}
      {d.election ? <ElectionStage d={d} /> : <BoardLeadStage d={d} />}
      <PulseStage d={d} />
      <Free d={d} />
      <MembersStage d={d} />
      <SpotlightStage d={d} />
      <StakeStage d={d} />
      <GapsStage d={d} />
      <Markets d={d} />
      <Proof d={d} />
      <Pricing />
      <FaqStage />
      <Final />
      {d.member ? null : <PayMoments ctx={{ count: d.pulse.count, window: d.pulse.window, biggest: d.biggest, today: d.pulse.countToday }} now={d.now} />}
    </>
  );
}

/** The landing: the hero, then every stage, in one response. */
export function Landing({ d }: { d: LandingData }) {
  return (
    <>
    <ViewAs />
    <main className="b-root" data-testid="landing">
      <Hero d={d} />
      <Rest d={d} />
      <StageMotion />
      <ScrollFx />
    </main>
    </>
  );
}
