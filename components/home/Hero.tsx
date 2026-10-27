"use client";
/* The home hero: "serious type, wild world".
 *   Photos: eight of the sixteen graded photos (public/hero, lib/photos.ts HERO_PHOTOS), each zooming slowly from 100%
 *   to 108% over 6 s, then crossfading (1.2 s) into the next; it loops, each round ending on the summit. Photo 1 loads
 *   with the page (preloaded, high priority); the others load once the page is idle, and a photo only comes up once it has loaded. Under
 *   prefers-reduced-motion: photo 1 only, still.
 *   Said plainly, for a first-time visitor in 5 seconds: what it is ("Live tracker for sports bets, prediction markets
 *   and insider stock trades"), the headline, what it shows (who, how much, whether they usually win), the button and
 *   three points. Over the card, "LIVE · big money moves" (only while every source is current; otherwise "Catching
 *   up · last update 6m ago"). The card is one real recent big move per photo (Sports, Markets and Stocks mixed),
 *   never a made-up one, playing as a 3-second demo: the sentence types in, then the payout, then the record line.
 *   Below, the ticker strip: real moves scrolling on solid black, paused on hover.
 *   A dark scrim sits behind the words only; the card and the ticker are solid (photos never sit behind numbers).
 * Tracked (components/app/beacon.ts): the button, ticker taps. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import { beacon } from "@/components/app/beacon";
import { Photo, PHOTO_WIDE } from "@/components/Photo";
import { HERO_PHOTOS } from "@/lib/photos";
import { TimeAgo } from "@/components/TimeAgo";
import { dollars } from "@/lib/moves/copy";
import type { FeedItem, FeedStatus } from "@/lib/moves/feed";
import type { TickerItem } from "@/lib/moves/ticker";

const PHOTOS = HERO_PHOTOS;
const HOLD_MS = 6000;
const TAG: Record<string, string> = { sports: "Sports", markets: "Markets", stocks: "Stocks", crypto: "Crypto" };

function tagText(m: FeedItem): string {
  const sub = m.source === "sec" ? (m.ticker ?? (m.note?.includes("13F") ? "Big fund" : null)) : m.league && m.league !== "other" ? m.league : null;
  return `${TAG[m.tab] ?? ""}${sub ? ` · ${sub}` : ""}`;
}

/** The third line of the demo: the trader's record for members; for free visitors, that one exists (it's a members'
 *  feature, so the number itself is never sent); Kalshi trades are anonymous, so they have none. */
function recordText(m: FeedItem): string | null {
  if (m.record) return m.record;
  if (m.source === "polymarket" && m.wallet) return "Their win record is one tap away for members.";
  return null;
}

/** One move as a 3-second demo of the product: the amount counts up and the sentence types in, then the payout (or the
 *  filing dates) appears, then the record line. Without JS, or under reduced motion, it is simply all there. */
function MoveCard({ m, late }: { m: FeedItem; late: boolean }) {
  const [typed, setTyped] = useState<number | null>(null);
  const [step, setStep] = useState(2);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const text = m.sentence, per = Math.max(14, Math.min(40, 1500 / text.length));
    let i = 0, t2 = 0, t3 = 0;
    setTyped(0); setStep(0);
    const t = window.setInterval(() => {
      i += 1; setTyped(i);
      if (i >= text.length) {
        window.clearInterval(t);
        t2 = window.setTimeout(() => setStep(1), 180);
        t3 = window.setTimeout(() => setStep(2), 760);
      }
    }, per);
    return () => { window.clearInterval(t); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [m.sentence]);
  const typing = typed !== null && typed < m.sentence.length;
  const second = m.payout ? <p className="hcard__payout">{m.payout}</p> : m.note ? <p className="hcard__note">{m.note}</p> : null;
  const rec = recordText(m);
  return (
    <article className="hcard" data-demo={typed === null ? "pending" : "run"}>
      <div className="hcard__top">
        <span className="hcard__tag">{tagText(m)}</span>
        <TimeAgo className="hcard__ago" at={m.at} initial={m.ago} suffix={late ? " · 30 min late" : ""} />
      </div>
      <p className="hcard__amt" data-count={m.amount} data-fmt="dollars">{dollars(m.amount)}</p>
      <p className="hcard__sentence">
        <span className="sr-only">{m.sentence}</span>
        <span aria-hidden="true">{typed === null ? m.sentence : m.sentence.slice(0, typed)}{typing ? <span className="hcard__caret" /> : null}</span>
      </p>
      <div className={`hcard__line${step >= 1 ? " is-on" : ""}`}>{second}</div>
      {rec ? <p className={`hcard__rec hcard__line${step >= 2 ? " is-on" : ""}${m.record ? "" : " hcard__rec--locked"}`}>{m.record ? null : <LockGlyph />}{rec}</p> : null}
    </article>
  );
}

function LockGlyph() {
  return <svg className="hcard__lock" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v7h-9z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}

export function Hero({ moves, ticker, late, trialLine, cta, status }: {
  moves: FeedItem[]; ticker: TickerItem[]; late: boolean; trialLine: string | null; cta: string;
  /** The sources' freshness (lib/moves/feed.ts): "LIVE" only while every source is current. */
  status: FeedStatus | null;
}) {
  const live = status?.state === "live";
  const [at, setAt] = useState(0);
  const [more, setMore] = useState(false);
  const [paused, setPaused] = useState(false);
  const loaded = useRef<Set<number>>(new Set([0]));

  // Photo 1 is fetched with the HTML, before anything else: the phone crop on phones, the wide one on wider screens.
  preload("/hero/1-m.avif", { as: "image", type: "image/avif", media: "(max-width: 899px)", fetchPriority: "high" });
  preload("/hero/1-d.avif", { as: "image", type: "image/avif", media: PHOTO_WIDE, fetchPriority: "high" });

  // The others once the page is idle, and only without reduced motion.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const go = () => setMore(true);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const start = () => (w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 2500 }) : window.setTimeout(go, 1200));
    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  // Every 6 s, the next photo that has loaded (and its move card). Holds while the card or ticker is hovered or focused.
  useEffect(() => {
    if (!more || paused) return;
    const t = window.setTimeout(() => {
      setAt(i => {
        for (let k = 1; k <= PHOTOS.length; k++) { const j = (i + k) % PHOTOS.length; if (loaded.current.has(j)) return j; }
        return i;
      });
    }, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [at, more, paused]);

  const prev = useRef(0);
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => { if (prev.current !== at) { setLast(prev.current); prev.current = at; } }, [at]);

  const move = moves.length ? moves[at % moves.length]! : null;
  const hold = { onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false), onFocus: () => setPaused(true), onBlur: () => setPaused(false) };

  return (
    <section className="cine" aria-labelledby="hero-h" data-section="hero">
      <div className="cine__photos" aria-hidden="true" data-par="" data-moved={last !== null ? "" : undefined}>
        {PHOTOS.map((n, i) => (i === 0 || more) ? (
          <div key={n} className={`cine__slide${i === at ? " is-on" : i === last ? " is-prev" : ""}`}>
            <Photo n={n} eager={i === 0} onLoad={() => { loaded.current.add(i); }} />
          </div>
        ) : null)}
      </div>
      <div className="cine__scrim" aria-hidden="true" />
      <div className="wrap cine__in">
        <div className="cine__copy">
          <p className="cine__label">Live tracker for sports bets, prediction markets and insider stock trades</p>
          <h1 id="hero-h" className="cine__h">Follow the big money.</h1>
          <p className="cine__sub">Insidir shows you the biggest bets and stock trades the moment they happen: who made them, how much, and whether they usually win.</p>
          <div className="cine__cta">
            <Link className="btn btn--onDark btn--big" href="/feed" data-cta="hero" onClick={() => beacon("hero_cta_click", "home")}>{cta}</Link>
            <ul className="cine__points">
              <li>Sports · Prediction markets · Stocks</li>
              <li>Real public data</li>
              <li>Alerts to your phone</li>
            </ul>
          </div>
          {trialLine ? <p className="cine__trial">{trialLine}</p> : null}
          <p className="cine__fine">Public data. Not financial advice.</p>
        </div>
        <div className="cine__card" {...hold}>
          <p className={`cine__live${live ? "" : " cine__live--behind"}`}><span className="cine__dot" aria-hidden="true" />{live ? "LIVE · big money moves" : status?.text ?? "Catching up"}</p>
          {move ? (
            <Link href={move.source === "sec" ? "/feed?tab=stocks" : `/market/${encodeURIComponent(move.marketId)}`} className="hcard__link" aria-label={`${move.sentence} See the market.`}>
              <MoveCard key={move.id} m={move} late={late} />
            </Link>
          ) : (
            <div className="hcard hcard--wait">
              <p className="hcard__tag">Catching up</p>
              <p className="hcard__sentence">The next big move shows up here the second it happens.</p>
            </div>
          )}
        </div>
      </div>
      {ticker.length ? (
        <div className="ticker" {...hold}>
          <p className="sr-only">Latest big moves</p>
          <div className="ticker__track" style={{ ["--n" as string]: ticker.length }}>
            {[0, 1].map(copy => (
              <ul key={copy} className="ticker__list" aria-hidden={copy === 1 ? true : undefined}>
                {ticker.map(t => (
                  <li key={t.id}>
                    <Link className="ticker__item" href={t.href} tabIndex={copy === 1 ? -1 : undefined} onClick={() => beacon("ticker_click", t.tab)}>
                      <span className="ticker__who">{t.who}</span> · <span className="ticker__amt">{t.amount}</span> {t.what} · <span className="ticker__ago">{t.ago}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Reports once when the feed preview right after the hero scrolls into view. */
export function PreviewSeen({ children, className, labelledBy }: { children: React.ReactNode; className?: string; labelledBy: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { beacon("feed_preview_view", "home"); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <section ref={ref} className={className} aria-labelledby={labelledBy} id="preview">{children}</section>;
}
