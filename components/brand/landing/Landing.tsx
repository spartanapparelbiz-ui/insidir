/* The landing: a scrolling page of stages in the hero spec's language. Each stage is a full-viewport black stage with
 * one background that never animates; its foreground performs once as it enters (components/brand/StageMotion.tsx).
 *   1 Hero (the globe) · 2 The problem · 3 Free right now (the check, today's #1 market, the last 3 bets: whole, no
 *   account) · 4 What members get (five rows, each with a live preview) · 5 Proof (space.jpg) · 6 Markets ·
 *   7 Pricing (world.jpg) · 8 FAQ · 9 Final (the globe again, the footer inside).
 * Every number is live (lib/brand/landing.ts); a stage with nothing real to show says so or steps aside. */
import type { CSSProperties } from "react";
import Image from "next/image";
import { category, category as categoryInfo, categoryPhotos } from "@/lib/brand/categories";
import { FAQ, HERO, MEMBERS, PAST, PROBLEM, STAGES, faqLd } from "@/lib/brand/copy";
import { dataLine, heavierSide, verdict } from "@/lib/brand/verdict";
import { milDollars } from "@/lib/brand/landing";
import { slotPhoto } from "@/lib/brand/images";
import type { LandingData } from "@/lib/brand/landing";
import { dollars } from "@/lib/money";
import { Arrow, cents, Lines, m, Pill, signedDollars, TierBadge } from "../Bits";
import { BetRow } from "../BetRow";
import { InlineCheck } from "../InlineCheck";
import { Faq } from "../Faq";
import { MoneyCard } from "../MoneyCard";
import { HeroLine } from "../HeroLine";
import { BrandFoot, BrandNav } from "../Nav";
import { PayMoments } from "../PayMoments";
import { Stage } from "../Stage";
import { StageMotion } from "../StageMotion";

function Hero({ d }: { d: LandingData }) {
  return (
    <Stage bg={{ kind: "globe", dark: 0 }} inner={false} testid="hero" labelledBy="hero-h">
      <BrandNav motion />
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

function Members({ d }: { d: LandingData }) {
  const t = d.top;
  const v = t ? verdict({ yes: t.m.millionaire.yes, no: t.m.millionaire.no, yesLabel: t.m.yesLabel, noLabel: t.m.noLabel }, heavierSide({ ...t.m.millionaire, yesLabel: t.m.yesLabel, noLabel: t.m.noLabel })) : null;
  const previews: Record<string, React.ReactNode> = {
    before: t && v ? (
      <div style={{ display: "grid", gap: 8 }} data-testid="prev-check">
        <span style={{ fontWeight: 500, color: v.kind === "agree" ? "var(--up)" : v.kind === "against" ? "var(--down)" : "var(--ink)" }}>{v.kind === "agree" ? "✓ " : v.kind === "against" ? "✕ " : ""}{v.headline}</span>
        <span className="b-small">{t.m.title} · on {heavierSide({ ...t.m.millionaire, yesLabel: t.m.yesLabel, noLabel: t.m.noLabel }) === "yes" ? t.m.yesLabel : t.m.noLabel}</span>
        {d.bestPrice && d.bestPrice.yes.kalshi !== null && d.bestPrice.yes.polymarket !== null
          ? <div className="b-kv"><span className="b-small">Kalshi YES {cents(d.bestPrice.yes.kalshi)}</span><span className="b-small">Polymarket YES {cents(d.bestPrice.yes.polymarket)}</span></div>
          : t.m.priceNow !== null ? <div className="b-kv"><span className="b-small">{t.m.yesLabel} {cents(t.m.priceNow)}</span><span className="b-small">{t.m.noLabel} {cents(1 - t.m.priceNow)}</span></div> : null}
      </div>
    ) : null,
    allday: d.board.length ? (
      <div style={{ display: "grid", gap: 6 }} data-testid="prev-board">
        {d.board.map(b => <BetRow key={b.id} bet={b} now={d.now} />)}
        {d.biggest ? <div className="b-row" style={{ gridTemplateColumns: "1fr" }}><span className="b-small" style={{ color: "var(--ink)" }}><span className="b-dot" aria-hidden="true" /> Insidir · A {d.biggest.pnl !== null ? `${signedDollars(d.biggest.pnl)} ` : ""}wallet just bet {dollars(d.biggest.amount)} on {d.biggest.title}</span></div> : null}
      </div>
    ) : null,
    morning: d.brief.length ? (
      <ol className="b-rows" style={{ paddingLeft: 0 }} data-testid="prev-brief">
        {d.brief.map((m, i) => <li key={m.marketId} className="b-row" style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}><span className="b-small">{i + 1}</span><span className="b-row__title">{m.title}</span><span className="b-num" style={{ fontWeight: 600 }}>{dollars(milDollars(m))}</span></li>)}
      </ol>
    ) : null,
    overtime: d.wallet ? (
      <div style={{ display: "grid", gap: 8 }} data-testid="prev-wallet">
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><TierBadge tier={d.wallet.tier} /><span className="b-small">{d.wallet.short}</span><span className="b-up b-num" style={{ fontWeight: 600 }}>{signedDollars(d.wallet.pnl)} all-time</span></span>
        {d.wallet.results.length ? (
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Last results">
            {d.wallet.results.map((r, i) => <span key={i} className="b-tier" style={{ background: "var(--panel)", color: r.result === "won" ? "var(--up)" : r.result === "lost" ? "var(--down)" : "var(--ink-muted)" }} title={r.title}>{r.result === "won" ? "Won" : r.result === "lost" ? "Lost" : "Void"}</span>)}
          </span>
        ) : <span className="b-small">No settled bets on the record yet.</span>}
      </div>
    ) : null,
    nights: d.bigNight ? (
      <div style={{ display: "grid", gap: 6 }} data-testid="prev-night">
        <span className="b-label">{category(d.bigNight.category).name} · now</span>
        <span style={{ fontWeight: 500 }}>{d.bigNight.title}</span>
        <span className="b-small">{dollars(milDollars(d.bigNight))} millionaire money · {d.bigNight.millionaire.yes.wallets + d.bigNight.millionaire.no.wallets} wallets</span>
      </div>
    ) : null,
  };
  return (
    <Stage testid="members" labelledBy="members-h">
      <div className="b-head"><Lines id="members-h" lines={STAGES.members} size={60} /></div>
      <ul className="b-feats">
        {MEMBERS.map((f, i) => (
          <li key={f.k} className="b-feat b-glass" data-testid="member-row" data-m="settle" style={{ "--d": `${0.8 + i * 0.12}s` } as CSSProperties}>
            <div style={{ display: "grid", gap: 6, alignContent: "start" }}><span className="b-label">{f.when}</span><p className="b-feat__t">{f.t}</p></div>
            <div className="b-feat__prev">{previews[f.k] ?? <span className="b-small">Live as soon as there is data.</span>}</div>
          </li>
        ))}
      </ul>
      <div className="b-center" style={{ marginTop: 24 }}>
        <div className="b-ctas"><Pill href="/go" delay={1.5} data-testid="members-start" data-checkout="members">Start for $1</Pill></div>
        <p className="b-small" style={{ marginTop: 10 }} data-m="quiet">$1 for 3 days, then $39/month.</p>
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
      <Hero d={d} />
      <Problem />
      <Free d={d} />
      <Members d={d} />
      <Proof d={d} />
      <Markets d={d} />
      <Pricing />
      <FaqStage />
      <Final />
      {d.member ? null : <PayMoments ctx={{ count: d.pulse.count, window: d.pulse.window, biggest: d.biggest, today: d.pulse.countToday }} now={d.now} />}
      <StageMotion />
    </main>
  );
}
