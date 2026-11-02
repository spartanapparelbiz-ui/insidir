/* The member home (app/page.tsx for members), in the new design system. Phone-first.
 *   Banner          the home page's photo (#0A0C10 at 70%), "Good evening, {first name}." and the glass ask box with
 *                   chips from their categories.
 *   Moved           their markets where proven money moved since their last visit, in dollars; one line when nothing
 *                   did.
 *   This week       their categories as tabs over Kalshi-style market cards.
 *   Your markets    dense rows: title, the side proven money favors, a mini split, price, change today, a dot if moved.
 *   Your week       "Proven money was right on X of Y of your markets this week", the results, and Share.
 * A new member with no markets sees "Start with these" chips; no section is ever blank. */
import { ReadBox } from "@/components/read/ReadBox";
import { ReadPick } from "@/components/read/ReadPick";
import { clockET } from "@/lib/moves/copy";
import { chipText, type MarketCard as Card } from "@/lib/nx/data";
import type { MemberHomeData } from "@/lib/nx/member";
import type { PhotoName } from "@/lib/photos";
import type { YourMarket } from "@/lib/read/member";
import { HeroPhoto, MarketCard, SplitBar } from "./Bits";
import { Tabs } from "./Tabs";
import { fmt } from "@/lib/nx/fmt";
import { Tick } from "./Tick";

const DAY_ET = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const sameEtDay = (a: number, b: number) => DAY_ET.format(new Date(a)) === DAY_ET.format(new Date(b));
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v), "usd")}`;

/** "+$120K proven on Chiefs since 9:14 AM ET": the side whose proven dollars changed most. */
export function movedLine(m: YourMarket, now: number): string | null {
  const s = m.since;
  if (!s || (s.yes === 0 && s.no === 0)) return null;
  const d = m.latest.data, yes = Math.abs(s.yes) >= Math.abs(s.no);
  const v = yes ? s.yes : s.no, label = yes ? d.yesLabel : d.noLabel;
  return `${signed(v)} proven on ${label} since ${sameEtDay(s.at, now) ? clockET(s.at) : DAY_ET.format(new Date(s.at))}`;
}

function Chips({ chips, testid }: { chips: Card[]; testid: string }) {
  if (!chips.length) return null;
  return <div className="nx-chips nx-chips--left" data-testid={testid}>{chips.map(c => <ReadPick key={c.key} venue={c.venue} id={c.id} className="nx-chip">{chipText(c)}</ReadPick>)}</div>;
}

function Banner({ first, greet, chips, photo, focus }: { first: string | null; greet: string; chips: Card[]; photo: PhotoName; focus: boolean }) {
  return (
    <section className="nxm-banner" aria-labelledby="hi-h">
      <HeroPhoto name={photo} priority />
      <div className="nx-shade nx-shade--70" />
      <div className="nx-grid nxm-banner__grid" aria-hidden="true" />
      <div className="nxm-banner__in">
        <h1 id="hi-h" className="nxm-banner__h">{greet}{first ? `, ${first}` : ""}.</h1>
        <ReadBox glass autoFocus={focus} label="Read" placeholder="Paste a Polymarket or Kalshi link, or ask about any market" />
        <Chips chips={chips} testid="member-chips" />
      </div>
    </section>
  );
}

function Moved({ mine, now }: { mine: YourMarket[]; now: number }) {
  const moved = mine.filter(m => m.moved && movedLine(m, now));
  return (
    <section className="nxm-sec" aria-labelledby="moved-h" data-testid="moved">
      <div className="nxm-sec__h"><h2 id="moved-h">Moved since your last visit</h2></div>
      {moved.length ? (
        <div className="nx-row">
          {moved.map(m => {
            const d = m.latest.data, p = d.proven;
            return (
              <a key={m.key} className="nx-panel nxm-moved" href={`/read/${m.latest.id}`}>
                <span className="nx-label"><span className="nx-live" aria-hidden="true" /> Moved</span>
                <span className="nxm-moved__t">{m.latest.question || d.question}</span>
                <span className="nxm-moved__chg nx-up" data-testid="moved-change">{movedLine(m, now)}</span>
                <SplitBar yes={p.yes.dollars} no={p.no.dollars} yesLabel={d.yesLabel} noLabel={d.noLabel} />
                {m.price !== null ? <span className="nxm-moved__price"><Tick value={m.price} format="cents" /> <span className="nx-muted">{d.yesLabel}</span></span> : null}
              </a>
            );
          })}
        </div>
      ) : <p className="nx-muted" data-testid="moved-none">Nothing moved since your last visit.</p>}
    </section>
  );
}

function ThisWeek({ tabs }: { tabs: MemberHomeData["tabs"] }) {
  if (!tabs.length) return null;
  return (
    <section className="nxm-sec" aria-labelledby="week-cats-h">
      <div className="nxm-sec__h"><h2 id="week-cats-h">This week in your categories</h2><a className="nx-pill nx-pill--sm nx-pill--ghost" href="/markets">All markets</a></div>
      <Tabs label="Your categories" labels={tabs.map(t => t.label)} testid="member-tabs">
        {tabs.map((t, ti) => <div key={t.key} className="nx-row">{t.cards.map((c, i) => <MarketCard key={c.key} c={c} priority={ti === 0 && i < 1} />)}</div>)}
      </Tabs>
    </section>
  );
}

function Yours({ mine, chips }: { mine: YourMarket[]; chips: Card[] }) {
  return (
    <section className="nxm-sec" aria-labelledby="your-markets-h" id="your-markets">
      <div className="nxm-sec__h"><h2 id="your-markets-h">Your markets</h2>{mine.length ? <a className="nx-pill nx-pill--sm nx-pill--ghost" href="/library">Library</a> : null}</div>
      {mine.length ? (
        <ul className="nxm-rows nx-panel" data-testid="your-markets">
          {mine.map(m => {
            const d = m.latest.data, p = d.proven, share = p.yesShare;
            const fav = share === null || share === 0.5 ? null : share > 0.5 ? d.yesLabel : d.noLabel;
            const chg = m.price !== null && m.dayOpen !== null ? Math.round((m.price - m.dayOpen) * 100) : null;
            return (
              <li key={m.key}>
                <a className="nxm-row" href={`/read/${m.latest.id}`}>
                  <span className="nxm-row__main">
                    <span className="nxm-row__t">{m.moved ? <span className="nx-live nxm-row__dot" aria-label="Moved since your last visit" /> : null}{m.latest.question || d.question}</span>
                    {fav ? <span className="nx-muted nxm-row__fav">Proven money favors <b className="nx-up">{fav}</b></span> : null}
                    {p.yes.dollars + p.no.dollars > 0 ? <span className="nxm-row__bar" aria-hidden="true"><i style={{ width: `${Math.round((p.yes.dollars / (p.yes.dollars + p.no.dollars)) * 100)}%` }} /></span> : null}
                  </span>
                  <span className="nxm-row__nums">
                    {m.price !== null ? <b><Tick value={m.price} format="cents" /></b> : null}
                    {chg ? <span className={chg > 0 ? "nx-up" : "nx-down"}>{chg > 0 ? "+" : "−"}{Math.abs(chg)}¢ today</span> : null}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <div data-testid="start-with">
          <p className="nx-muted">Start with these: the busiest markets in your categories now.</p>
          <Chips chips={chips} testid="start-chips" />
        </div>
      )}
    </section>
  );
}

function Week({ w }: { w: MemberHomeData["week"] }) {
  if (!w.of) return null;
  return (
    <section className="nxm-sec" aria-labelledby="your-week-h" data-testid="week-recap">
      <div className="nxm-sec__h"><h2 id="your-week-h">Your week</h2><a className="nx-pill nx-pill--sm" href="/week/image" target="_blank" rel="noopener" data-testid="week-share">Share ›</a></div>
      <p className="nxm-week__big">Proven money was right on <b className="nx-up">{w.right}</b> of <b>{w.of}</b> of your markets this week.</p>
      <table className="nxm-week">
        <thead><tr><th scope="col">Market</th><th scope="col">Proven money on</th><th scope="col">Won</th><th scope="col">Result</th></tr></thead>
        <tbody>{w.lines.map(l => <tr key={l.key}><td>{l.question}</td><td>{l.provenSide}</td><td>{l.won}</td><td className={l.right ? "nx-up" : "nx-down"}>{l.right ? "Right" : "Wrong"}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

export function MemberHome({ d, first, greet, photo, now, focus }: { d: MemberHomeData; first: string | null; greet: string; photo: PhotoName; now: number; focus: boolean }) {
  return (
    <div data-testid="member-home">
      <Banner first={first} greet={greet} chips={d.chips} photo={photo} focus={focus} />
      {d.mine.length ? <Moved mine={d.mine} now={now} /> : null}
      <ThisWeek tabs={d.tabs} />
      <Yours mine={d.mine} chips={d.chips} />
      <Week w={d.week} />
    </div>
  );
}
