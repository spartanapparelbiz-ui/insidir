/* The landing: one product, a copy trading system for Kalshi and Polymarket, in a scroll of stages.
 *   Hero      "Who to copy, how much, and when to get out." · the subhead · the live top five Verified wallets with real
 *             profit (no names or addresses until signup) · Start for $1 · the price line from lib/plans.ts
 *   How       Follow a verified wallet · Get your size when it trades · Get pinged when it exits
 *   Contrast  "Free trackers show you the buy. Insidir shows you who's worth copying, your size, and the sell."
 *   Pricing · FAQ · Final (the footer inside)
 * Every number is live (lib/brand/landing.ts, lib/verified); nothing invented: no user counts, reviews or timers. */
import { electionDay } from "@/lib/brand/pulse";
import { TRIAL } from "@/lib/plans";
import type { CSSProperties } from "react";
import { category as categoryInfo } from "@/lib/brand/categories";
import { FAQ, HERO, PAST, STAGES, faqLd } from "@/lib/brand/copy";
import { slotPhoto } from "@/lib/brand/images";
import type { LandingData } from "@/lib/brand/landing";
import { Lines, m, Pill } from "../Bits";
import { BetRow } from "../BetRow";
import { Faq } from "../Faq";
import { HeroLine } from "../HeroLine";
import { BrandFoot, BrandNav } from "../Nav";
import { PayMoments } from "../PayMoments";
import { Stage } from "../Stage";
import { StageMotion } from "../StageMotion";
import { ViewAs } from "@/components/ViewAs";
import { ScrollFx } from "./ScrollFx";
import { ScrollReveal } from "../ScrollReveal";
import { Intro, INTRO_SCRIPT } from "./Intro";
import { TopVerified } from "@/components/system/VerifiedBoard";
import { dollars as usd } from "@/lib/money";
import { StickyStart } from "./StickyStart";
import { RaceRow } from "./ElectionLive";
import { HowStage, WatchStage, WhyStage } from "./Why";
import { InsideStage } from "./Inside";
import { ElectionStage } from "./Value";

function Hero({ d }: { d: Pick<LandingData, "verified" | "verifiedCount"> }) {
  return (
    <Stage bg={{ kind: "globe", dark: 0.15 }} inner={false} testid="hero" labelledBy="hero-h" first>
      <BrandNav motion startHref="/go?step=checkout" />
      <div className="b-hero-inner">
        <Lines as="h1" id="hero-h" lines={HERO.h1} />
        <p className="b-sub" data-m="lift" data-testid="hero-sub">{HERO.sub}</p>
        <div className="lp-top" data-m="settle" style={{ "--d": ".7s" } as CSSProperties}>
          <p className="b-label">Live top {Math.min(5, d.verified.length) || 5} Verified wallets{d.verifiedCount.checked ? <> · {d.verifiedCount.verified} of {d.verifiedCount.checked} wallets up $1M+ pass today</> : null}</p>
          {d.verified.length ? <TopVerified rows={d.verified} /> : <p className="b-small" data-testid="top-verified-empty">The daily review is running: the top Verified wallets show here as each one is read.</p>}
          <p className="b-small">Names hidden until you sign up. Profit from each wallet&apos;s public Polymarket record.</p>
        </div>
        <div className="b-ctas">
          <Pill href="/go?step=checkout" delay={0.9} data-testid="hero-start" data-checkout="hero">{HERO.cta}</Pill>
        </div>
        <p className="b-hero-terms" data-m="quiet" style={{ "--d": "1.05s" } as CSSProperties} data-testid="hero-terms">{STAGES.pricingSub}</p>
      </div>
    </Stage>
  );
}

function Contrast() {
  return (
    <Stage bg={{ kind: "photo", photo: slotPhoto("space"), dark: 0.7 }} testid="contrast" label="Why Insidir">
      <div className="b-center"><p className="lp-contrast" data-testid="contrast-line" {...m("lift", 0.3)}>{HERO.contrast}</p></div>
    </Stage>
  );
}

function Free({ d }: { d: LandingData }) {
  const t = d.topBet, late = d.lead.slice(0, 4);
  return (
    <Stage id="free" bg={{ kind: "photo", photo: slotPhoto("free"), dark: 0.66 }} testid="free" labelledBy="free-h">
      <div className="b-head"><Lines id="free-h" lines={STAGES.free} size={64} /><p className="b-sub">A live sample, no account.</p></div>
      <div className="b-tiles3">
        <section className="b-glass b-pad b-tile3" data-testid="free-top-bet" data-m="settle" style={{ "--d": ".6s" } as CSSProperties}>
          <h3 className="b-panel-h">Today&apos;s #1 millionaire bet</h3>
          {t ? (
            <div style={{ display: "grid", gap: 12 }}>
              <ul className="b-rows"><li data-free="bet" style={{ cursor: "pointer" }}><BetRow bet={t} now={d.now} /></li></ul>
              <p className="b-small">The biggest single trade since midnight ET from a wallet up $1M+, side and price included. Information, not advice.</p>
            </div>
          ) : <p className="b-empty">Today&apos;s biggest bet shows here once a $1M+ wallet bets after midnight ET. Until then, the board beside it has the latest.</p>}
        </section>
        <section className="b-glass b-pad b-tile3" data-testid="free-late" data-m="settle" style={{ "--d": ".72s" } as CSSProperties}>
          <h3 className="b-panel-h">The board, 60 minutes late</h3>
          {late.length ? (
            <>
              <ul className="b-rows">{late.map(b => <li key={b.id}><BetRow bet={b} now={d.now} /></li>)}</ul>
              <p className="b-small" style={{ marginTop: 12 }} data-testid="free-more">{d.pulse.all.countToday ? `${d.pulse.all.countToday.toLocaleString("en-US")} ${d.pulse.all.countToday === 1 ? "trade" : "trades"} from wallets up $100K+ today${d.pulse.countToday ? `, ${d.pulse.countToday.toLocaleString("en-US")} from $1M+` : ""}. ` : ""}Members see each one the second it lands.</p>
            </>
          ) : <p className="b-empty">No millionaire trades in the last day yet.</p>}
          <a className="b-btn b-panel-pill" style={{ justifySelf: "start", marginTop: 12 }} href="/board">The board</a>
        </section>
        <section className="b-glass b-pad b-tile3" data-testid="free-race" data-m="settle" style={{ "--d": ".84s" } as CSSProperties}>
          <h3 className="b-panel-h">{d.race ? "One race in full" : "Today in numbers"}</h3>
          {d.race ? (
            <>
              <ul className="b-rows"><RaceRow r={d.race} /></ul>
              <p className="b-small" style={{ marginTop: 12 }}>The race with the most watchlist money this week, whole: every side and the price now.</p>
            </>
          ) : (
            <dl className="fr-nums" data-testid="free-numbers">
              {d.pulse.today > 0 ? <div><dd className="b-num">{usd(d.pulse.today)}</dd><dt>traded by wallets up $1M+ in 24 hours</dt></div> : null}
              {d.pulse.all.countToday > 0 ? <div><dd className="b-num">{d.pulse.all.countToday.toLocaleString("en-US")}</dd><dt>{d.pulse.all.countToday === 1 ? "trade" : "trades"} from $100K+ wallets since midnight ET{d.pulse.countToday > 0 ? `, ${d.pulse.countToday.toLocaleString("en-US")} from $1M+` : ""}</dt></div> : null}
              {d.pulse.millionaires > 0 ? <div><dd className="b-num">{d.pulse.millionaires.toLocaleString("en-US")}</dd><dt>wallets up $1M+ watched</dt></div> : null}
            </dl>
          )}
          <a className="b-btn b-panel-pill" style={{ justifySelf: "start", marginTop: 12 }} href="/election">Every race</a>
        </section>
      </div>
    </Stage>
  );
}

/** The record: the leading rule from the Kalshi backtest (positive over 100+ settled at Kalshi's ask + 1¢), or nothing. */
function Proof({ d }: { d: LandingData }) {
  if (!d.record) return null;
  const r = d.record, net = `${r.net >= 0 ? "+" : "−"}$${Math.abs(Math.round(r.net)).toLocaleString("en-US")}`;
  return (
    <Stage bg={{ kind: "photo", photo: slotPhoto("space") }} testid="proof" label="The record">
      <div className="b-center">
        <p className="b-giant b-num" data-testid="proof-net"><span className="ln"><span className="ln-i">{net}</span></span></p>
        <p className="b-sub" {...m("lift", 0.5)}>“{r.name}” on Kalshi · ${r.perBet} a bet · {r.won} won of {r.settled.toLocaleString("en-US")} settled · {r.days} days</p>
        <p className="b-small" style={{ marginTop: 8 }}><a href="/results">Every rule we tested, losses included</a></p>
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
        <div className="b-ctas"><Pill href="/go?step=checkout" delay={0.9} data-testid="pricing-cta" data-checkout="pricing">{HERO.cta}</Pill></div>
      </div>
    </Stage>
  );
}

function FaqStage() {
  return (
    <Stage id="faq" bg={{ kind: "photo", photo: slotPhoto("faq"), dark: 0.7 }} testid="faq" labelledBy="faq-h">
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
          <Pill href="/go?step=checkout" delay={0.9} data-testid="final-start" data-checkout="final">{HERO.cta}</Pill>
        </div>
      </div>
    </Stage>
  );
}

/** Everything below the hero, from the full landing data. */
function Rest({ d }: { d: LandingData }) {
  return (
    <>
      <HowStage />
      <Contrast />
      <Pricing />
      <FaqStage />
      <Final />
      {d.member ? null : <StickyStart />}
    </>
  );
}

/** The landing: the hero, then every stage, in one response. */
export function Landing({ d }: { d: LandingData }) {
  return (
    <>
    <ViewAs />
    <main className="b-root" data-testid="landing">
      {d.member ? null : <>
        <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
        <Intro lines={d.verifiedCount.checked ? [
          `${d.verifiedCount.verified} of ${d.verifiedCount.checked} wallets up $1M+ pass every test today.`,
          "Insidir tells you who to copy,",
          "how much, and when to get out.",
        ] : ["Who to copy,", "how much,", "and when to get out."]} />
      </>}
      <Hero d={d} />
      <Rest d={d} />
      <StageMotion />
      <ScrollFx />
      <ScrollReveal />
    </main>
    </>
  );
}
