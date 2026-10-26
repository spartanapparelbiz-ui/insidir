"use client";
/* The home hero: "serious type, wild world".
 *   Photos: the six black-and-white photos (public/hero), each zooming slowly from 100% to 108% over 6 s, then
 *   crossfading (1.2 s) into the next; it loops, each round ending on photo 6. Photo 1 loads with the page (preloaded,
 *   high priority); the other five load once the page is idle, and a photo only comes up once it has loaded. Under
 *   prefers-reduced-motion: photo 1 only, still.
 *   The fintech layer, readable at a glance: the "LIVE · big money moves" label, the headline, the button, and one
 *   real recent big move per photo (Sports, Markets and Stocks mixed) on a solid white card, never a made-up one.
 *   Below, the ticker strip: real moves scrolling on solid black, paused on hover.
 *   A dark scrim sits behind the words only; the card and the ticker are solid (photos never sit behind numbers).
 * Tracked (components/app/beacon.ts): the button, ticker taps. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import { beacon } from "@/components/app/beacon";
import { Photo, PHOTO_WIDE, type PhotoN } from "@/components/Photo";
import type { FeedItem } from "@/lib/moves/feed";
import type { TickerItem } from "@/lib/moves/ticker";

const PHOTOS: PhotoN[] = [1, 2, 3, 4, 5, 6];
const HOLD_MS = 6000;
const TAG: Record<string, string> = { sports: "Sports", markets: "Markets", stocks: "Stocks", crypto: "Crypto" };

function tagText(m: FeedItem): string {
  const sub = m.source === "sec" ? (m.ticker ?? (m.note?.includes("13F") ? "Big fund" : null)) : m.league && m.league !== "other" ? m.league : null;
  return `${TAG[m.tab] ?? ""}${sub ? ` · ${sub}` : ""}`;
}

function MoveCard({ m, late }: { m: FeedItem; late: boolean }) {
  return (
    <article className="hcard">
      <div className="hcard__top">
        <span className="hcard__tag">{tagText(m)}</span>
        <time className="hcard__ago" dateTime={new Date(m.at).toISOString()}>{m.ago}{late ? " · 30 min late" : ""}</time>
      </div>
      <p className="hcard__amt">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(m.amount)}</p>
      <p className="hcard__sentence">{m.sentence}</p>
      {m.payout ? <p className="hcard__payout">{m.payout}</p> : m.note ? <p className="hcard__note">{m.note}</p> : null}
    </article>
  );
}

export function Hero({ moves, ticker, late, trialLine, cta }: {
  moves: FeedItem[]; ticker: TickerItem[]; late: boolean; trialLine: string | null; cta: string;
}) {
  const [at, setAt] = useState(0);
  const [more, setMore] = useState(false);
  const [paused, setPaused] = useState(false);
  const loaded = useRef<Set<number>>(new Set([0]));

  // Photo 1 is fetched with the HTML, before anything else: the phone crop on phones, the wide one on wider screens.
  preload("/hero/1-m.avif", { as: "image", type: "image/avif", media: "(max-width: 899px)", fetchPriority: "high" });
  preload("/hero/1-d.avif", { as: "image", type: "image/avif", media: PHOTO_WIDE, fetchPriority: "high" });

  // The other five once the page is idle, and only without reduced motion.
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
      <div className="cine__photos" aria-hidden="true" data-moved={last !== null ? "" : undefined}>
        {PHOTOS.map((n, i) => (i === 0 || more) ? (
          <div key={n} className={`cine__slide${i === at ? " is-on" : i === last ? " is-prev" : ""}`}>
            <Photo n={n} eager={i === 0} onLoad={() => { loaded.current.add(i); }} />
          </div>
        ) : null)}
      </div>
      <div className="cine__scrim" aria-hidden="true" />
      <div className="wrap cine__in">
        <div className="cine__copy">
          <p className="cine__label"><span className="cine__dot" aria-hidden="true" />LIVE · big money moves</p>
          <h1 id="hero-h" className="cine__h">Follow the big money.</h1>
          <p className="cine__sub">The biggest bets and trades on Kalshi, Polymarket and Wall Street, the second they happen. In plain English.</p>
          <div className="cine__cta">
            <Link className="btn btn--onDark btn--big" href="/feed" data-cta="hero" onClick={() => beacon("hero_cta_click", "home")}>{cta}</Link>
          </div>
          {trialLine ? <p className="cine__trial">{trialLine}</p> : null}
          <p className="cine__fine">Public data. Not financial advice.</p>
        </div>
        <div className="cine__card" {...hold}>
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
