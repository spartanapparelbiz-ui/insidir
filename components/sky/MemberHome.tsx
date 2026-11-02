/* The member home in the dashboard frame (components/sky/Shell.tsx):
 *   Top           "Good evening, {first name}." (no name: "Good evening.") with the glass ask box and chips from their
 *                 categories, over a short money skyline (220px) of their categories' biggest bets.
 *   Moved         their markets where proven money moved since their last visit, in dollars (hidden when none did).
 *   This week     their categories as tabs over the same market cards as the home page.
 *   Your markets  rows: logo or portrait, title, the side proven money favors, a mini split, price, change today, a
 *                 dot if it moved.
 *   Your week     "Proven money was right on X of Y of your markets this week", and Share. */
import { ReadBox } from "@/components/read/ReadBox";
import { ReadPick } from "@/components/read/ReadPick";
import { chipText, type MarketCard as CardT } from "@/lib/nx/data";
import { movedLine, type MemberHomeData } from "@/lib/nx/member";
import type { YourMarket } from "@/lib/read/member";
import { artFor } from "@/lib/sky/art";
import type { SkyBet } from "@/lib/sky/sky-pure";
import { Art } from "./Art";
import { MarketCard, SplitBar } from "./Card";
import { Skyline } from "./Skyline";
import { Tabs } from "./Tabs";
import { Tick } from "./Tick";

const marketArt = (m: YourMarket, cats: Map<string, CardT>) => {
  const c = cats.get(m.key), d = m.latest.data;
  return artFor({ tab: c?.tab ?? null, league: c?.league ?? null, title: d.question, event: d.event, cat: c?.cat ?? null, yesLabel: d.yesLabel, noLabel: d.noLabel });
};

function Chips({ chips, testid }: { chips: CardT[]; testid: string }) {
  if (!chips.length) return null;
  return <div className="sk-chips" data-testid={testid}>{chips.map(c => <ReadPick key={c.key} venue={c.venue} id={c.id} className="sk-chip">{chipText(c)}</ReadPick>)}</div>;
}

function Top({ hello, chips, sky, cats, focus }: { hello: string; chips: CardT[]; sky: SkyBet[]; cats: string[]; focus: boolean }) {
  return (
    <section className="skm-top-band" aria-labelledby="hi-h">
      {sky.length ? <div className="skm-top-band__sky" aria-hidden="true"><Skyline bets={sky} height={220} phoneHeight={220} cats={cats} compact testid="member-skyline" /></div> : null}
      <div className="skm-top-band__in">
        <h1 id="hi-h" className="skm-hello" data-testid="hello">{hello}</h1>
        <ReadBox glass autoFocus={focus} label="Read" placeholder="Paste a Polymarket or Kalshi link, or ask about any market" />
        <Chips chips={chips} testid="member-chips" />
      </div>
    </section>
  );
}

function Moved({ mine, now, cats }: { mine: YourMarket[]; now: number; cats: Map<string, CardT> }) {
  const moved = mine.filter(m => m.moved && movedLine(m, now));
  if (!moved.length) return null;
  return (
    <section className="skm-sec sk-reveal" aria-labelledby="moved-h" data-testid="moved">
      <h2 id="moved-h" className="sk-h2 skm-h">Moved since your last visit</h2>
      <div className="sk-row">
        {moved.map(m => {
          const d = m.latest.data, p = d.proven;
          return (
            <a key={m.key} className="sk-card skm-moved" href={`/read/${m.latest.id}`}>
              <span className="sk-card__top"><Art art={marketArt(m, cats)} /><span className="sk-card__cat"><span className="sk-live" aria-hidden="true" /> Moved</span></span>
              <span className="sk-card__t">{m.latest.question || d.question}</span>
              <span className="sk-card__money"><span className="sk-num sk-up" data-testid="moved-change">{movedLine(m, now)}</span><SplitBar yes={p.yes.dollars} no={p.no.dollars} yesLabel={d.yesLabel} noLabel={d.noLabel} /></span>
              <span className="sk-card__foot">{m.price !== null ? <span className="sk-card__price"><Tick value={m.price} format="cents" /><small>{d.yesLabel}</small></span> : <span />}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function ThisWeek({ tabs }: { tabs: MemberHomeData["tabs"] }) {
  if (!tabs.length) return null;
  return (
    <section className="skm-sec sk-reveal" aria-labelledby="cats-h">
      <div className="sk-sec__head"><h2 id="cats-h" className="sk-h2 skm-h">This week in your categories</h2><a className="sk-pill sk-sm" href="/markets">All markets</a></div>
      <Tabs label="Your categories" labels={tabs.map(t => t.label)} testid="member-tabs">
        {tabs.map(t => <div key={t.key} className="sk-row">{t.cards.map(c => <MarketCard key={c.key} c={c} />)}</div>)}
      </Tabs>
    </section>
  );
}

function Yours({ mine, chips, cats }: { mine: YourMarket[]; chips: CardT[]; cats: Map<string, CardT> }) {
  return (
    <section className="skm-sec sk-reveal" aria-labelledby="your-markets-h" id="your-markets">
      <div className="sk-sec__head"><h2 id="your-markets-h" className="sk-h2 skm-h">Your markets</h2>{mine.length ? <a className="sk-pill sk-sm" href="/library">Library</a> : null}</div>
      {mine.length ? (
        <ul className="skm-rows sk-panel" data-testid="your-markets">
          {mine.map(m => {
            const d = m.latest.data, p = d.proven, share = p.yesShare;
            const fav = share === null || share === 0.5 ? null : share > 0.5 ? d.yesLabel : d.noLabel;
            const chg = m.price !== null && m.dayOpen !== null ? Math.round((m.price - m.dayOpen) * 100) : null;
            // The split: proven money's, or every tracked big bet's when no proven money holds a position.
            const big = d.big ?? null, bigShare = big?.yesShare ?? null;
            const bigFav = fav === null && bigShare !== null && bigShare !== 0.5 ? (bigShare > 0.5 ? d.yesLabel : d.noLabel) : null;
            const split = p.yes.dollars + p.no.dollars > 0 ? { yes: p.yes.dollars, no: p.no.dollars } : big ? { yes: big.yes.dollars, no: big.no.dollars } : { yes: 0, no: 0 };
            const total = split.yes + split.no;
            return (
              <li key={m.key}>
                <a className="skm-row" href={`/read/${m.latest.id}`}>
                  <Art art={marketArt(m, cats)} size={32} />
                  <span className="skm-row__main">
                    <span className="skm-row__t">{m.latest.question || d.question}</span>
                    {fav ? <span className="sk-meta">Proven money favors <b className="skm-fav">{fav}</b></span> : bigFav ? <span className="sk-meta">Big money favors <b className="skm-fav">{bigFav}</b></span> : <span className="sk-meta">No big money yet</span>}
                  </span>
                  {total > 0 ? <span className="skm-row__bar" aria-hidden="true"><i style={{ width: `${Math.round((split.yes / total) * 100)}%` }} /></span> : <span />}
                  <span className="skm-row__nums sk-num">
                    {m.price !== null ? <b><Tick value={m.price} format="cents" /></b> : null}
                    {chg ? <span className={chg > 0 ? "sk-up" : "sk-down"}>{chg > 0 ? "+" : "−"}{Math.abs(chg)}¢</span> : null}
                  </span>
                  {m.moved ? <span className="sk-live skm-row__dot" role="img" aria-label="Moved since your last visit" /> : <span />}
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <div data-testid="start-with"><p className="sk-muted">Start with these: the busiest markets in your categories now.</p><Chips chips={chips} testid="start-chips" /></div>
      )}
    </section>
  );
}

function Week({ w, following }: { w: MemberHomeData["week"]; following: number }) {
  if (!w.of && !following) return null;
  return (
    <section className="skm-sec sk-reveal" aria-labelledby="week-h" data-testid="week-recap">
      <div className="sk-sec__head"><h2 id="week-h" className="sk-h2 skm-h">Your week</h2>{w.of ? <a className="sk-pill sk-sm" href="/week/image" target="_blank" rel="noopener" data-testid="week-share">Share</a> : null}</div>
      {w.of ? <p className="skm-week">Proven money was right on <b className="sk-num sk-up">{w.right}</b> of <b className="sk-num">{w.of}</b> of your markets this week.</p>
        : <p className="skm-week">You follow <b className="sk-num">{following}</b> {following === 1 ? "market" : "markets"}. How proven money did on them shows here as they settle.</p>}
    </section>
  );
}

export function MemberHome({ d, hello, sky, cats, now, focus }: { d: MemberHomeData; hello: string; sky: SkyBet[]; cats: string[]; now: number; focus: boolean }) {
  const byKey = new Map(d.tabs.flatMap(t => t.cards).map(c => [c.key, c]));
  return (
    <div data-testid="member-home">
      <Top hello={hello} chips={d.chips} sky={sky} cats={cats} focus={focus} />
      <Moved mine={d.mine} now={now} cats={byKey} />
      <ThisWeek tabs={d.tabs} />
      <Yours mine={d.mine} chips={d.chips} cats={byKey} />
      <Week w={d.week} following={d.mine.length} />
    </div>
  );
}
