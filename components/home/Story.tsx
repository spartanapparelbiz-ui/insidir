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

function Mini({ m, lead = false }: { m: FeedItem; lead?: boolean }) {
  return (
    <div className={`ph-card${lead ? " ph-card--lead" : ""}`}>
      <p className="ph-card__top"><span>{m.tab === "sports" ? "Sports" : m.tab === "stocks" ? "Stocks" : "Markets"}</span><span>{m.ago}</span></p>
      <p className="ph-card__sentence">{m.sentence}</p>
      {m.payout ? <p className="ph-card__pay">{m.payout}</p> : null}
    </div>
  );
}

function Screen({ i, d }: { i: number; d: StoryData }) {
  if (i === 0) return (
    <div className="ph-screen ph-screen--bet">
      <p className="ph-kicker">{d.move.ago}</p>
      <p className="ph-amt">{dollars(d.move.amount)}</p>
      <p className="ph-sentence">{d.move.sentence}</p>
    </div>
  );
  if (i === 1) return (
    <div className="ph-screen ph-screen--feed">
      <p className="ph-title">Live feed</p>
      <p className="ph-live"><span className="ph-dot" />Live</p>
      <div className="ph-list">
        <Mini m={d.move} lead />
        {d.feed.map(m => <Mini key={m.id} m={m} />)}
      </div>
    </div>
  );
  if (i === 2) return (
    <div className="ph-screen ph-screen--profile">
      <p className="ph-kicker">Polymarket wallet · Top trader</p>
      <p className="ph-name">{d.trader.name}</p>
      <p className="ph-record">{d.trader.record}</p>
      {d.trader.chart ? (
        <div className="ph-chart">
          <svg viewBox={`0 0 ${d.trader.chart.width} ${d.trader.chart.height}`} preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" x2={d.trader.chart.width} y1={d.trader.chart.zeroY} y2={d.trader.chart.zeroY} className="ph-chart__zero" />
            <path d={d.trader.chart.path} className="ph-chart__line" />
          </svg>
        </div>
      ) : null}
      <p className="ph-note">Profit over time, by the day each market resolved.</p>
    </div>
  );
  return (
    <div className="ph-screen ph-screen--lock">
      {/* the time of the real move, Eastern */}
      <p className="ph-clock">{clockET(d.move.at).replace(/ (AM|PM) ET$/, "")}</p>
      <p className="ph-date">Lock screen</p>
      <div className="ph-push">
        <svg className="ph-push__icon" viewBox={LOGO.markViewBox} aria-hidden="true"><path fillRule="evenodd" d={LOGO.mark} fill="currentColor" /></svg>
        <div>
          <p className="ph-push__app">Insidir · now</p>
          <p className="ph-push__title">{d.alert.title}</p>
          <p className="ph-push__body">{d.alert.body}</p>
        </div>
      </div>
    </div>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return <div className="phone" aria-hidden="true"><div className="phone__notch" /><div className="phone__screen">{children}</div></div>;
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
