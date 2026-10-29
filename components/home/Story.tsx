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
import { Photo, type PhotoN } from "@/components/Photo";
import { Wordmark } from "@/components/Wordmark";
import { MoveCard } from "@/components/v2/MoveCard";
import { LockedRecord } from "@/components/v2/LockedRecord";
import { Avatar } from "@/components/v2/Avatar";
import { TabIcon } from "@/components/TabIcon";
import { BAND, SPOT } from "@/lib/photos";
import type { Story as StoryData } from "@/lib/home/story";
import type { FeedItem } from "@/lib/moves/feed";
import { clockET } from "@/lib/moves/copy";

const TITLE = "How Insidir works in 10 seconds";
const PAST = "A real past position by a top-ranked trader.";
const CAPTIONS = [
  "A large position is opened.",
  "Insidir records it within seconds.",
  "The account and its record, in one view.",
  "An alert on its next position.",
] as const;

/* ---------- An iPhone 15 Pro showing Insidir exactly as it looks on iOS ----------
 * The frame is drawn to Apple's geometry (app/v2.css .iphone). The screen is the real app at an iPhone's 393 × 852 CSS
 * px viewport, scaled down to fit (--s, set from the screen's width): iOS's status bar (black, as the installed web
 * app sets it) over Insidir's own black nav, the dark app theme, the real header band, tabs, chips, move cards
 * (components/v2/MoveCard.tsx), profile head and record tiles, and the bottom tab bar above the home indicator.
 * The whole screen is inert and hidden from assistive tech: it's a picture of the product, not a second copy of it. */

const VW = 393;

function StatusBar({ time, lock = false }: { time: string; lock?: boolean }) {
  return (
    <div className={`ios-sb${lock ? " ios-sb--lock" : ""}`}>
      <span className="ios-sb__time">{lock ? "" : time}</span>
      <span className="ios-sb__right">
        <svg viewBox="0 0 18 12" width="18" height="12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg viewBox="0 0 16 12" width="16" height="12"><path d="M8 11.6 5.6 9.2a3.4 3.4 0 0 1 4.8 0L8 11.6z" /><path d="M3.5 7.1a6.4 6.4 0 0 1 9 0l-1.3 1.3a4.6 4.6 0 0 0-6.4 0L3.5 7.1z" /><path d="M1.3 4.9a9.5 9.5 0 0 1 13.4 0l-1.3 1.3a7.7 7.7 0 0 0-10.8 0L1.3 4.9z" /></svg>
        <svg viewBox="0 0 27 13" width="27" height="13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" strokeOpacity=".4" /><rect x="2" y="2" width="17" height="9" rx="2.4" /><path d="M25 4.5v4a2.2 2.2 0 0 0 0-4z" fillOpacity=".45" /></svg>
      </span>
    </div>
  );
}

/** Insidir's nav as a member sees it on a phone: the logo and the menu. */
function AppNav() {
  return (
    <header className="nav">
      <div className="wrap nav__in">
        <span className="wordmark"><Wordmark /></span>
        <span className="ios-menu"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
      </div>
    </header>
  );
}

/** The app's bottom tab bar (components/SiteHeader.tsx), above the home indicator's safe area. */
function AppTabs({ on }: { on: string }) {
  return (
    <nav className="tabbar">
      {["Trackers", "Activity", "Following", "Account"].map(t => (
        <span key={t} className="tabbar__item" aria-current={t === on ? "page" : undefined}><TabIcon name={t} /><span>{t}</span></span>
      ))}
    </nav>
  );
}

/** A header band (components/PageBand.tsx), without its heading semantics. */
function Band({ n, title, kicker }: { n: PhotoN; title: string; kicker?: string }) {
  return (
    <div className="pband">
      <Photo n={n} className="pband__photo" band />
      <div className="wrap pband__in">{kicker ? <p className="pband__kicker">{kicker}</p> : null}<p className="pband__h">{title}</p></div>
    </div>
  );
}

const TAB_PHOTO = (tab: string): PhotoN => (tab === "sports" ? BAND.feed.sports : tab === "stocks" ? BAND.feed.stocks : BAND.feed.markets);

function AppScreen({ time, children, tab }: { time: string; children: React.ReactNode; tab: string }) {
  return (
    <div className="ios-app theme-night">
      <StatusBar time={time} />
      <div className="ios-app__page">
        <AppNav />
        <div className="ios-app__scroll">{children}</div>
        <AppTabs on={tab} />
      </div>
    </div>
  );
}

/** "Won 35 of 45 · +$4.4M all-time" → win rate and profit. */
function recordParts(r: string): { won: number; of: number; profit: string } | null {
  const m = /^Won (\d+) of (\d+) · (.+) all-time$/.exec(r);
  return m ? { won: Number(m[1]), of: Number(m[2]), profit: m[3]! } : null;
}

const DATE_ET = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });
const NOOP = "";

function Screen({ i, d }: { i: number; d: StoryData }) {
  const time = clockET(d.move.at).replace(/ (AM|PM) ET$/, "");
  const card = (m: FeedItem, lead = false) => (
    <div key={m.id} className={lead ? "ios-lead" : undefined}><MoveCard m={m} follow="off" trialHref={NOOP} /></div>
  );
  if (i === 0) return (
    <AppScreen time={time} tab="Activity">
      <div className="app2 market">
        <Band n={TAB_PHOTO(d.move.tab)} title={d.move.marketTitle} kicker={d.move.eventTitle !== d.move.marketTitle ? d.move.eventTitle : undefined} />
        <div className="wrap">
          <div className="market__head">{d.move.payout ? <div className="market__pays"><p>{d.move.payout}</p></div> : null}<span className="btn btn--secondary ios-btn">Follow market</span></div>
          <p className="block__h ios-block">Large positions in this market</p>
          <div className="feed2__list ios-list">{card(d.move, true)}</div>
        </div>
      </div>
    </AppScreen>
  );
  if (i === 1) return (
    <AppScreen time={time} tab="Activity">
      <div className="app2">
        <Band n={TAB_PHOTO(d.move.tab)} title="Activity" />
        <div className="wrap">
          <div className="feed2__head"><div className="feed2__meta"><p className="status status--live"><span className="status__dot" />Live · updated 2s ago</p></div></div>
          <div className="tabs">{["Sports", "Markets", "Stocks"].map(t => <span key={t} className="tabs__tab" aria-pressed={t.toLowerCase() === d.move.tab}>{t}</span>)}<span className="tabs__tab tabs__tab--soon">Crypto <span className="soon soon--short">Soon</span></span></div>
          <div className="chips">{["$10K+", "$50K+", "$100K+"].map((c, k) => <span key={c} className="chip2" aria-pressed={k === 0}>{c}</span>)}</div>
          <div className="ios-new"><span className="btn btn--primary newmoves__btn">1 new position · Show</span></div>
          <ol className="feed2__list ios-list">{[card(d.move, true), ...d.feed.map(m => card(m))]}</ol>
        </div>
      </div>
    </AppScreen>
  );
  if (i === 2) {
    const r = recordParts(d.trader.record);
    return (
      <AppScreen time={time} tab="Top">
        <div className="app2 trader profile">
          <div className="trader__head">
            <Photo n={SPOT.phoneProfile} className="trader__photo" band />
            <div className="trader__id"><Avatar face={d.trader.face} size="profile" /><div><p className="trader__kicker">Polymarket wallet</p><p className="trader__name">{d.trader.name}</p><p className="source source--dark">Where this comes from: this Polymarket wallet on Polygon{"\u00a0↗"}</p></div></div>
            <span className="btn btn--secondary">Follow</span>
          </div>
          <div className="wrap">
            <p className="note pnote">One trader can use several wallets; this record covers this wallet only. <u>About our data</u></p>
            {d.trader.blurred ? <LockedRecord /> : r ? (
              <dl className="record record--wide">
                <div><dt>Win rate</dt><dd>{Math.round((r.won / r.of) * 100)}%</dd><span className="record__sub">Won {r.won} of {r.of} resolved</span></div>
                <div><dt>All-time net P&L</dt><dd className={r.profit.startsWith("-") || r.profit.startsWith("−") ? "loss" : "money"}>{r.profit}</dd></div>
              </dl>
            ) : null}
            {d.trader.chart ? (
              <section className="block">
                <p className="block__h">Net P&L over time</p>
                <div className="ios-chart">
                  <svg className="pchart" viewBox={`0 0 ${d.trader.chart.width} ${d.trader.chart.height}`} preserveAspectRatio="none">
                    <line x1="0" x2={d.trader.chart.width} y1={d.trader.chart.zeroY} y2={d.trader.chart.zeroY} className="pchart__zero" />
                    <path d={d.trader.chart.path} className="pchart__line" />
                  </svg>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </AppScreen>
    );
  }
  return (
    <div className="ios-lock">
      <Photo n={SPOT.phoneWallpaper} className="ios-lock__wall" />
      <StatusBar time={time} lock />
      <svg className="ios-lock__pad" viewBox="0 0 14 18" width="14" height="18"><path d="M3.5 8V5.5a3.5 3.5 0 0 1 7 0V8" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="1" y="8" width="12" height="9" rx="2.2" /></svg>
      <p className="ios-lock__date">{DATE_ET.format(new Date(d.move.at))}</p>
      <p className="ios-lock__time">{time}</p>
      <div className="ios-note">
        <span className="ios-note__icon"><img src="/icons/apple-touch-icon.png" alt="" width="38" height="38" /></span>
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
    <div className="iphone" aria-hidden="true" inert>
      <span className="iphone__key iphone__key--action" /><span className="iphone__key iphone__key--up" /><span className="iphone__key iphone__key--down" /><span className="iphone__key iphone__key--side" />
      <div className="iphone__body">
        <div className="iphone__screen">
          <div className="ios-vp">
            {children}
            <span className="iphone__island" />
            <span className="iphone__home" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Scales each phone's 393px viewport to its screen's real width. */
function useFitPhones(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(es => { for (const e of es) (e.target as HTMLElement).style.setProperty("--s", String(e.contentRect.width / VW)); });
    el.querySelectorAll<HTMLElement>(".iphone__screen").forEach(s => ro.observe(s));
    return () => ro.disconnect();
  }, [root]);
}

export function Story({ data, alerts = false }: { data: StoryData;
  /** Phone alerts are live: the fourth step (the alert on the lock screen) shows. Until then, three steps. */
  alerts?: boolean }) {
  const caps = alerts ? CAPTIONS : CAPTIONS.slice(0, 3);
  const idx = caps.map((_, i) => i), last = caps.length - 1;
  const [step, setStep] = useState(0);
  const root = useRef<HTMLElement>(null);
  useFitPhones(root);
  const steps = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: "-50% 0px -50% 0px" });
    for (const el of steps.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);
  const cta = <Link className="btn btn--primary btn--big" href="/feed" onClick={() => beacon("hero_cta_click", "story")}>Open Activity</Link>;
  return (
    <section className="story" id="how" aria-labelledby="story-h" ref={root}>
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
            {caps.map((c, i) => <p key={c} className={`story__cap${i === step ? " is-on" : ""}`} aria-hidden={i === step ? undefined : true}><span className="story__n">{i + 1}</span>{c}</p>)}
          </div>
          <Phone>{idx.map(i => <div key={i} className={`story__screen${i === step ? " is-on" : ""}`}><Screen i={i} d={data} /></div>)}</Phone>
          <div className={`story__cta${step === last ? " is-on" : ""}`}>{cta}</div>
        </div>
        <div className="story__steps">
          {idx.map(i => <div key={i} className="story__step" data-i={i} ref={el => { steps.current[i] = el; }} />)}
        </div>
      </div>

      {/* Phones (and reduced motion): the same four steps, stacked. */}
      <ol className="wrap story__stack">
        {caps.map((c, i) => (
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
