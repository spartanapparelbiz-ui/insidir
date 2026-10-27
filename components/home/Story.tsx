"use client";
/* "How Insidir works in 10 seconds": right after the hero. On desktop a phone stays pinned in the middle while the
 * page scrolls through four steps; each step swaps the phone's screen and the caption above it, and after the last
 * one "See the live feed" fades in under the phone. On phones (and under prefers-reduced-motion everywhere) the same
 * four steps stack, each with its own phone, animating in as it enters the screen (or simply all there).
 * Every number is real (lib/home/story.ts): one top trader's recent big move, their record and profit curve, and the
 * alert we'd send. Only transform and opacity animate. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { beacon } from "@/components/app/beacon";
import { LOGO } from "@/components/Wordmark";
import { Photo } from "@/components/Photo";
import { TabIcon } from "@/components/SiteHeader";
import { SPOT } from "@/lib/photos";
import type { Story as StoryData } from "@/lib/home/story";
import type { FeedItem } from "@/lib/moves/feed";
import { clockET, dollars } from "@/lib/moves/copy";

const TITLE = "How Insidir works in 10 seconds";
const PAST = "A real past move by a top trader.";
const CAPTIONS = [
  "A big bet happens.",
  "Insidir catches it in seconds.",
  "See who it is and if they usually win.",
  "Get pinged next time they move.",
] as const;

/* ---------- An iPhone 15 Pro, drawn to Apple's geometry ----------
 * Everything inside is laid out in iOS points (app/v2.css: --pt = the screen's width / 393): a 393 × 852 pt screen
 * with 55 pt corners, the Dynamic Island (126 × 37 pt, 11 pt from the top), the status bar, the home indicator
 * (134 × 5 pt), an 18 pt bezel inside a titanium band, and the action, volume and side buttons. The app screens are
 * Insidir's own (header photo band, cards, the tab bar), the way the installed web app looks on an iPhone. */

const pts = (n: number) => `calc(${n} * var(--pt))`;

function StatusBar({ time, lock = false }: { time: string; lock?: boolean }) {
  return (
    <div className="ios-sb" aria-hidden="true">
      <span className="ios-sb__time">{lock ? "" : time}</span>
      <span className="ios-sb__right">
        <svg viewBox="0 0 18 12" style={{ width: pts(18), height: pts(12) }}><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg viewBox="0 0 16 12" style={{ width: pts(16), height: pts(12) }}><path d="M8 11.6 5.6 9.2a3.4 3.4 0 0 1 4.8 0L8 11.6z" /><path d="M3.5 7.1a6.4 6.4 0 0 1 9 0l-1.3 1.3a4.6 4.6 0 0 0-6.4 0L3.5 7.1z" /><path d="M1.3 4.9a9.5 9.5 0 0 1 13.4 0l-1.3 1.3a7.7 7.7 0 0 0-10.8 0L1.3 4.9z" /></svg>
        <svg viewBox="0 0 27 13" style={{ width: pts(27), height: pts(13) }}><rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" strokeOpacity=".4" /><rect x="2" y="2" width="17" height="9" rx="2.4" /><path d="M25 4.5v4a2.2 2.2 0 0 0 0-4z" fillOpacity=".45" /></svg>
      </span>
    </div>
  );
}

function TabBar({ on }: { on: string }) {
  return (
    <nav className="ios-tabs" aria-hidden="true">
      {["Feed", "Top", "Following", "Account"].map(t => (
        <span key={t} className={`ios-tabs__item${t === on ? " is-on" : ""}`}><TabIcon name={t} className="ios-tabs__icon" />{t}</span>
      ))}
    </nav>
  );
}

function Card({ m, lead = false }: { m: FeedItem; lead?: boolean }) {
  return (
    <div className={`ph-card${lead ? " ph-card--lead" : ""}`}>
      <p className="ph-card__top"><span className="ph-tag">{m.tab === "sports" ? "Sports" : m.tab === "stocks" ? "Stocks" : "Markets"}</span><span>{m.ago}</span></p>
      <p className="ph-card__sentence">{m.sentence}</p>
      {m.payout ? <p className="ph-card__pay">{m.payout}</p> : null}
    </div>
  );
}

/** "Won 35 of 45 · +$4.4M all-time" → the two record tiles. */
function recordParts(r: string): { won: string; profit: string } | null {
  const m = /^Won (\d+) of (\d+) · (.+) all-time$/.exec(r);
  return m ? { won: `${m[1]} of ${m[2]}`, profit: m[3]! } : null;
}

const DATE_ET = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });

function Screen({ i, d }: { i: number; d: StoryData }) {
  const time = clockET(d.move.at).replace(/ (AM|PM) ET$/, "");
  if (i === 0) return (
    <div className="ios-app">
      <StatusBar time={time} />
      <div className="ios-nav"><span className="ios-nav__back"><svg viewBox="0 0 12 20" style={{ width: pts(12), height: pts(20) }}><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>Feed</span></div>
      <div className="ph-move">
        <p className="ph-card__top"><span className="ph-tag">{d.move.tab === "sports" ? "Sports" : d.move.tab === "stocks" ? "Stocks" : "Markets"}</span><span>{d.move.ago}</span></p>
        <p className="ph-amt">{dollars(d.move.amount)}</p>
        <p className="ph-sentence">{d.move.sentence}</p>
        {d.move.payout ? <p className="ph-card__pay ph-move__pay">{d.move.payout}</p> : null}
        <div className="ph-actions"><span className="ph-btn ph-btn--on">Follow</span><span className="ph-btn">See market</span></div>
        {d.move.sourceLink ? <p className="ph-src">{d.move.sourceLink.label} ↗</p> : null}
      </div>
      <TabBar on="Feed" />
    </div>
  );
  if (i === 1) return (
    <div className="ios-app">
      <div className="ph-band"><Photo n={SPOT.phoneFeed} band className="ph-band__photo" /><p className="ph-band__h">Live feed</p></div>
      <StatusBar time={time} />
      <p className="ph-live"><span className="ph-dot" />Live · updated 2s ago</p>
      <div className="ph-list">
        <Card m={d.move} lead />
        {d.feed.map(m => <Card key={m.id} m={m} />)}
      </div>
      <TabBar on="Feed" />
    </div>
  );
  if (i === 2) {
    const r = recordParts(d.trader.record);
    return (
      <div className="ios-app">
        <div className="ph-band ph-band--tall"><Photo n={SPOT.phoneProfile} band className="ph-band__photo" /><p className="ph-band__k">Polymarket wallet · Top trader</p><p className="ph-band__h ph-band__name">{d.trader.name}</p></div>
        <StatusBar time={time} />
        <div className="ph-tiles">
          {r ? <><div><p>Won</p><p className="ph-tile__v">{r.won}</p></div><div><p>All-time profit</p><p className="ph-tile__v ph-money">{r.profit}</p></div></>
            : <div className="ph-tile--wide"><p className="ph-tile__v">{d.trader.record}</p></div>}
        </div>
        {d.trader.chart ? (
          <div className="ph-chartbox">
            <p className="ph-chartbox__h">Profit over time</p>
            <div className="ph-chart">
              <svg viewBox={`0 0 ${d.trader.chart.width} ${d.trader.chart.height}`} preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" x2={d.trader.chart.width} y1={d.trader.chart.zeroY} y2={d.trader.chart.zeroY} className="ph-chart__zero" />
                <path d={d.trader.chart.path} className="ph-chart__line" />
              </svg>
            </div>
          </div>
        ) : null}
        <TabBar on="Top" />
      </div>
    );
  }
  return (
    <div className="ios-lock">
      <Photo n={SPOT.phoneWallpaper} className="ios-lock__wall" />
      <StatusBar time={time} lock />
      <svg className="ios-lock__pad" viewBox="0 0 14 18" style={{ width: pts(14), height: pts(18) }} aria-hidden="true"><path d="M3.5 8V5.5a3.5 3.5 0 0 1 7 0V8" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="1" y="8" width="12" height="9" rx="2.2" /></svg>
      <p className="ios-lock__date">{DATE_ET.format(new Date(d.move.at))}</p>
      <p className="ios-lock__time">{time}</p>
      <div className="ios-note">
        <span className="ios-note__icon"><svg viewBox={LOGO.markViewBox} aria-hidden="true"><path fillRule="evenodd" d={LOGO.mark} fill="currentColor" /></svg></span>
        <div className="ios-note__body">
          <p className="ios-note__head"><b>{d.alert.title}</b><span>now</span></p>
          <p className="ios-note__text">{d.alert.body}</p>
        </div>
      </div>
      <span className="ios-lock__btn ios-lock__btn--l"><svg viewBox="0 0 24 24"><path d="M7.5 2.5h9v3.2l-2.2 3.4v11a2.3 2.3 0 0 1-4.6 0v-11L7.5 5.7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="12" cy="13.2" r="1.1" fill="currentColor" /></svg></span>
      <span className="ios-lock__btn ios-lock__btn--r"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg></span>
    </div>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="iphone" aria-hidden="true">
      <span className="iphone__key iphone__key--action" /><span className="iphone__key iphone__key--up" /><span className="iphone__key iphone__key--down" /><span className="iphone__key iphone__key--side" />
      <div className="iphone__body">
        <div className="iphone__screen">
          {children}
          <span className="iphone__island" />
          <span className="iphone__home" />
        </div>
      </div>
    </div>
  );
}

export function Story({ data }: { data: StoryData }) {
  const [step, setStep] = useState(0);
  const steps = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: "-50% 0px -50% 0px" });
    for (const el of steps.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);
  const cta = <Link className="btn btn--primary btn--big" href="/feed" onClick={() => beacon("hero_cta_click", "story")}>See the live feed</Link>;
  return (
    <section className="story" id="how" aria-labelledby="story-h">
      {/* The title: pinned with the phone on desktop, above the stacked steps on phones (one shows at a time). */}
      <div className="wrap story__head story__head--stack">
        <h2 id="story-h" className="sec2__h rv">{TITLE}</h2>
        {data.past ? <p className="story__note rv" style={{ ["--i" as string]: 1 }}>{PAST}</p> : null}
      </div>

      {/* Desktop: pinned phone, scroll-driven steps. */}
      <div className="story__pin" data-step={step}>
        <div className="story__stage">
          <div className="story__head">
            <h2 className="sec2__h">{TITLE}</h2>
            {data.past ? <p className="story__note">{PAST}</p> : null}
          </div>
          <div className="story__caps" aria-live="polite">
            {CAPTIONS.map((c, i) => <p key={c} className={`story__cap${i === step ? " is-on" : ""}`} aria-hidden={i === step ? undefined : true}><span className="story__n">{i + 1}</span>{c}</p>)}
          </div>
          <Phone>{[0, 1, 2, 3].map(i => <div key={i} className={`story__screen${i === step ? " is-on" : ""}`}><Screen i={i} d={data} /></div>)}</Phone>
          <div className={`story__cta${step === 3 ? " is-on" : ""}`}>{cta}</div>
        </div>
        <div className="story__steps">
          {[0, 1, 2, 3].map(i => <div key={i} className="story__step" data-i={i} ref={el => { steps.current[i] = el; }} />)}
        </div>
      </div>

      {/* Phones (and reduced motion): the same four steps, stacked. */}
      <ol className="wrap story__stack">
        {CAPTIONS.map((c, i) => (
          <li key={c} className="story__item rv">
            <h3 className="story__cap is-on"><span className="story__n">{i + 1}</span>{c}</h3>
            <Phone><div className="story__screen is-on"><Screen i={i} d={data} /></div></Phone>
          </li>
        ))}
        <li className="story__item story__item--cta rv">{cta}</li>
      </ol>
    </section>
  );
}
