/* The visitors' home page, on Cruip's "Open" template layout (app/open.css) with Magic UI motion (components/magicui).
 *   1. Hero: "See what Polymarket's millionaires are betting.", the ask box, Start for $1, and the big-bet marquee
 *   2. The Millionaires' board, 60 minutes late (AnimatedList); members see it live on /board
 *   3. Three live numbers (NumberTicker): big bets tracked, $1M+ wallets tracked, $1M+ money moved today
 *   4. A real Read of tonight's top market
 *   5. Bento: Millionaire money · Pings · Best price · Unusual bets
 *   6. The record (and how the pings did), pricing, FAQ, final call, footer
 * Every number comes from the database (lib/open/landing.ts); a section with nothing to show is left out. No 3D, no
 * photos, no initials: team logos, public-domain portraits or line icons. */
import { ReadBox } from "@/components/read/ReadBox";
import { ReadCard } from "@/components/read/ReadCard";
import { ViewAs } from "@/components/ViewAs";
import { Art } from "@/components/sky/Art";
import { LineIcon } from "@/components/sky/Icons";
import { Tabs } from "@/components/sky/Tabs";
import { LiveRefresh } from "@/components/sky/LiveRefresh";
import { FAQ, Sources } from "@/components/sky/Landing";
import { Marquee } from "@/components/magicui/marquee";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { BentoCard, BentoGrid } from "@/components/magicui/bento-grid";
import { BoardPreview } from "./BoardPreview";
import { Footer, Header } from "./Frame";
import { betLine } from "@/lib/sky/sky-pure";
import { boardLine } from "@/lib/millionaire/board";
import { pingText, receiptLine } from "@/lib/millionaire/pings-pure";
import { TIER_BADGE } from "@/lib/millionaire/tiers";
import { RECORD_WINDOWS } from "@/lib/nx/data";
import type { OpenLanding } from "@/lib/open/landing";
import { PLANS, TRIAL } from "@/lib/plans";

const HEAD = "See what Polymarket's millionaires are betting.";
const SUB = "Insidir tracks every big bet on Polymarket and Kalshi and shows you, on any market, where wallets that have made $1M+ put their money.";

function SectionHead({ eyebrow, title, sub, id }: { eyebrow: string; title: string; sub?: string; id: string }) {
  return (
    <div className="op-sh">
      <div className="op-eyebrow"><span>{eyebrow}</span></div>
      <h2 id={id} className="op-h2">{title}</h2>
      {sub ? <p className="op-lead">{sub}</p> : null}
    </div>
  );
}

function Hero({ d, startHref }: { d: OpenLanding; startHref: string }) {
  return (
    <section className="op-hero" aria-labelledby="hero-h">
      <div className="op-wrap">
        <h1 id="hero-h" className="op-h1">{HEAD}</h1>
        <p className="op-hero__sub">{SUB}</p>
        <div className="op-hero__acts">
          <a className="op-btn op-primary op-btn--big" href={startHref} data-unlock="hero" data-testid="hero-show">Show me <span className="op-arrow" aria-hidden="true">→</span></a>
        </div>
        <div className="op-hero__ask"><ReadBox glass label="Read" placeholder="Paste a Polymarket or Kalshi link, or ask about any market" /></div>
        <p className="op-hero__fine">${TRIAL.fee} for {TRIAL.days} days, then ${PLANS.insidir.price}/month. Cancel anytime.</p>
      </div>
      {d.ticker.length ? (
        <div className="op-ticker" aria-label="Biggest bets of the last 24 hours" data-testid="ticker">
          <Marquee pauseOnHover repeat={2}>
            {d.ticker.map(b => <span key={b.id} className="op-ticker__item"><Art art={b.art} size={20} /><b>{betLine(b, d.now, false)}</b></span>)}
          </Marquee>
        </div>
      ) : null}
    </section>
  );
}

function Board({ d, startHref }: { d: OpenLanding; startHref: string }) {
  return (
    <section className="op-sec" aria-labelledby="board-h" id="board">
      <div className="op-wrap">
        <SectionHead id="board-h" eyebrow="The Millionaires' board" title="Every bet from wallets that made $1M+" sub="Wallets ranked by their public all-time profit on Polymarket. We show the tier, never who is behind a wallet." />
        <p className="op-board__count" data-testid="board-hour"><span className="sk-live" aria-hidden="true" /> <b><NumberTicker value={d.hour} /></b> millionaire bet{d.hour === 1 ? "" : "s"} in the last hour. Members see them as they happen.</p>
        {d.board.length ? <BoardPreview rows={d.board} now={d.now} /> : <p className="op-board__none" data-testid="board-none">No millionaire bets more than an hour old to show yet.</p>}
        <p className="op-board__note" data-testid="board-delay">60 minutes delayed. <a className="op-btn-sm op-primary" href={startHref} data-unlock="board">Show me live</a></p>
      </div>
    </section>
  );
}

/** $4,812,000 → value 4.8, suffix "M"; under $1M in thousands. */
const compact = (v: number) => (v >= 1e6 ? { value: v / 1e6, decimals: 1, suffix: "M" } : v >= 1e3 ? { value: v / 1e3, decimals: 0, suffix: "K" } : { value: v, decimals: 0, suffix: "" });

function Numbers({ d }: { d: OpenLanding }) {
  const s = d.stats;
  if (!s || (!s.bigBets && !s.millionaires)) return null;
  const m = compact(s.movedToday);
  return (
    <section className="op-sec" aria-label="Live numbers" data-testid="stats">
      <div className="op-wrap op-stats">
        <div className="op-card op-edge op-stat"><NumberTicker className="op-stat__n" value={s.millionaires} data-testid="stat-millionaires" /><span className="op-stat__l">millionaire wallets tracked</span></div>
        <div className="op-card op-edge op-stat"><NumberTicker className="op-stat__n" value={m.value} decimalPlaces={m.decimals} prefix="$" suffix={m.suffix} data-testid="stat-moved" /><span className="op-stat__l">millionaire money bet today</span></div>
        <div className="op-card op-edge op-stat"><NumberTicker className="op-stat__n" value={s.bigBets} data-testid="stat-bets" /><span className="op-stat__l">big bets tracked</span></div>
      </div>
    </section>
  );
}

function TheRead({ d }: { d: OpenLanding }) {
  const f = d.featured;
  if (!f) return null;
  const q = f.card.event && f.card.event.length <= 40 ? f.card.event : f.card.title;
  return (
    <section className="op-sec" aria-labelledby="read-h" id="answer">
      <div className="op-wrap">
        <SectionHead id="read-h" eyebrow="A real Read" title="The market with the most millionaire money" sub="What a Read shows: millionaire money on each side, the best price, and one line on what the data says." />
        <div className="op-read">
          <p className="op-read__asked" data-testid="you-asked">You asked <b>{q}</b></p>
          <ReadCard id={f.id} data={f.data} member={false} us={d.us} now={d.now} startHref="/start" level={2} />
          <Sources f={f} now={d.now} />
        </div>
      </div>
    </section>
  );
}

const Icon = (name: Parameters<typeof LineIcon>[0]["name"]) => function I({ className }: { className?: string }) { return <span className={className}><LineIcon name={name} size={32} /></span>; };

function Bento({ d, startHref }: { d: OpenLanding; startHref: string }) {
  const ping = d.board.find(b => b.amount >= 25_000) ?? null;
  const tiers = d.featured?.data.tiers ?? null;
  const unusual = d.featured?.data.bets.filter(b => b.unusual.length).length ?? 0;
  return (
    <section className="op-sec" aria-labelledby="bento-h">
      <div className="op-wrap">
        <SectionHead id="bento-h" eyebrow="What you get" title="Know who's betting before you bet" />
        <BentoGrid data-testid="bento">
          <BentoCard className="mu-bento__card--wide" name="Millionaire money" Icon={Icon("trophy")} href="/board" cta="See the board"
            description="On every Polymarket market: how much wallets with $1M+ all-time profit have on each side, and $100K+ wallets on a second line."
            background={tiers && tiers.millionaire.wallets ? <p className="op-muted">{d.featured!.data.question}: {tiers.millionaire.wallets} {TIER_BADGE.millionaire} wallet{tiers.millionaire.wallets === 1 ? "" : "s"} in it now</p> : null} />
          <BentoCard name="Pings" Icon={Icon("spark")} href="/settings#pings" cta="Pick your categories"
            description="A push the moment a $1M+ wallet bets $25K+ in a category you follow. At most 5 a day."
            background={ping ? <p className="op-muted" data-testid="bento-ping">{pingText(ping).body}</p> : null} />
          <BentoCard name="Follow a millionaire" Icon={Icon("trophy")} href={startHref} cta="Show me"
            description="Pick a wallet that has made $1M+ and get a push every time it bets $10K or more. Tier and short address only, never who is behind it."
            background={ping ? <p className="op-muted">{boardLine(ping)}</p> : null} />
          <BentoCard className="mu-bento__card--wide" name="Best price" Icon={Icon("chart")} href="/#answer" cta="See a Read"
            description="YES and NO on Kalshi and Polymarket side by side, the cheaper one marked. In the US, Kalshi only."
            background={unusual ? <p className="op-muted">{unusual} unusual bet{unusual === 1 ? "" : "s"} on this market today</p> : null} />
        </BentoGrid>
      </div>
    </section>
  );
}

function Record({ d }: { d: OpenLanding }) {
  const wins = RECORD_WINDOWS.filter(w => d.record[w.key].length);
  const receipt = d.receipts ? receiptLine(d.receipts) : null;
  if (!wins.length && !receipt) return null;
  return (
    <section className="op-sec" aria-labelledby="record-h" id="record">
      <div className="op-wrap">
        <SectionHead id="record-h" eyebrow="The record" title="Real results, losses included" sub="What following every position of a tracker at the price Insidir showed, plus one point, made." />
        {wins.length ? (
          <Tabs label="Window" labels={wins.map(w => w.label)} testid="record" start={wins.length - 1}>
            {wins.map(w => (
              <ol key={w.key} className="op-rec op-card op-edge">
                {d.record[w.key].map(r => (
                  <li key={r.slug}>
                    <a className="op-rec__name" href={`/trackers/${r.slug}`}>{r.name}</a>
                    <span className={`op-rec__ret ${r.returnPct >= 0 ? "sk-up" : "sk-down"}`}>{r.returnPct >= 0 ? "+" : "−"}{Math.abs(r.returnPct * 100).toFixed(1)}%</span>
                    <span className="op-rec__n">{r.settled.toLocaleString("en-US")} settled</span>
                  </li>
                ))}
              </ol>
            ))}
          </Tabs>
        ) : null}
        {receipt ? <p className="op-receipt" data-testid="ping-receipts">{receipt}. Past results, not a promise.</p> : null}
      </div>
    </section>
  );
}

function Pricing({ startHref }: { startHref: string }) {
  return (
    <section className="op-sec" aria-labelledby="price-h" id="pricing">
      <div className="op-wrap">
        <div className="op-price op-card op-edge">
          <h2 id="price-h" className="op-price__h">${TRIAL.fee} for {TRIAL.days} days, then ${PLANS.insidir.price}/month.</h2>
          <ul>
            <li>The Millionaires&apos; board, live</li>
            <li>Pings when a $1M+ wallet bets $25K+ in your categories</li>
            <li>Unlimited Reads on any Polymarket or Kalshi market</li>
            <li>Every big bet of the last 24 hours, unusual ones flagged</li>
          </ul>
          <a className="op-btn op-primary" href={startHref} data-unlock="pricing">Start for ${TRIAL.fee}</a>
          <p className="op-hero__fine" style={{ marginTop: 12 }}>Cancel anytime.</p>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="op-sec" aria-labelledby="faq-h" id="faq">
      <div className="op-wrap">
        <SectionHead id="faq-h" eyebrow="FAQ" title="Questions" />
        <div className="op-faq">{OPEN_FAQ.map(f => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div>
    </section>
  );
}

export const OPEN_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "What's a $1M+ wallet?", a: "A Polymarket wallet whose all-time profit on Polymarket's public leaderboard is $1 million or more. $100K+ wallets are the next tier. We show the tier only: never a username, a rank, or who is behind a wallet." },
  ...FAQ,
];

function FinalCta({ startHref }: { startHref: string }) {
  return (
    <section className="op-sec" aria-labelledby="final-h">
      <div className="op-wrap"><div className="op-cta op-edge">
        <h2 id="final-h" className="op-h2">See where the millionaires are betting.</h2>
        <a className="op-btn op-primary" href={startHref} data-unlock="final">Start for ${TRIAL.fee}</a>
      </div></div>
    </section>
  );
}

export function OpenLandingPage({ d, startHref }: { d: OpenLanding; startHref: string }) {
  return (
    <div className="sk op" data-testid="landing">
      <LiveRefresh />
      <ViewAs />
      <span className="op-glow" aria-hidden="true" />
      <Header startHref={startHref} />
      <main>
        <Hero d={d} startHref={startHref} />
        <Board d={d} startHref={startHref} />
        <Numbers d={d} />
        <TheRead d={d} />
        <Bento d={d} startHref={startHref} />
        <Record d={d} />
        <Pricing startHref={startHref} />
        <Faq />
        <FinalCta startHref={startHref} />
      </main>
      <Footer />
    </div>
  );
}
