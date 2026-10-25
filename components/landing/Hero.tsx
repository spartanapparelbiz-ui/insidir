/* 1. Hero: the A/B headline, one CTA into the feed, and a REAL deal from the last 24 hours, animated with CSS only:
 * the two prices, what they add up to, the $1 back, and what's left per $1. Free visitors get the per-$1 math only
 * (no dollar size or total profit) and only deals older than the free feed's delay. When the scanner isn't live,
 * the widget says so rather than looking live. */
import Link from "next/link";
import { SafetyLight } from "@/components/SafetyLight";
import { centsText, pct } from "@/lib/format";
import type { ReceiptRow } from "@/lib/queries";
import { VENUE_NAME } from "@/lib/types";
import { Ago } from "./Ago";
import { perDollar } from "./model";

export const HERO_SUB = "Insidir checks both apps every few seconds for prices that lock in a profit, after fees.";

export function Hero({ headline, cta, deal, delayed, live, now }: {
  headline: string; cta: string; deal: ReceiptRow | null; delayed: boolean; live: boolean; now: number;
}) {
  return (
    <section className="lp-hero" data-section="hero" aria-labelledby="hero-h">
      <div className="lp-hero__copy">
        <h1 id="hero-h" className="lp-hero__h">{headline}</h1>
        <p className="lp-hero__sub">{HERO_SUB}</p>
      </div>
      <div className="lp-hero__deal">
        {!live ? <p className="lp-paused tiny" role="status">Live data paused, retrying</p> : null}
        {deal ? <HeroDeal r={deal} delayed={delayed} now={now} /> : null}
      </div>
      <div className="lp-hero__cta">
        <Link className="btn btn--primary btn--block lp-cta" href="/terminal">{cta}</Link>
        <p className="dim tiny">Free to look. No signup.</p>
      </div>
    </section>
  );
}

function HeroDeal({ r, delayed, now }: { r: ReceiptRow; delayed: boolean; now: number }) {
  const o = r.snapshot;
  const m = perDollar(o);
  const [a, b] = o.legs;
  if (!m || !a || !b) return null;
  // The bar is $1 wide: side A, side B, fees, and the green profit that's left.
  const w = (c: number) => `${Math.max(0, Math.min(100, c))}%`;
  return (
    <figure className="lp-deal card" aria-label="A real deal Insidir found">
      <figcaption className="lp-deal__top">
        <span className="tiny muted">Real deal · found <Ago at={r.detectedAt} now={now} />{delayed ? " · 30 min delay" : ""}</span>
        <SafetyLight safety={o.safety} />
      </figcaption>
      <p className="lp-deal__title">{o.title}</p>
      <div className="lp-deal__legs">
        <p className="lp-deal__leg lp-a"><span className="dim">Buy {a.side.toUpperCase()} on {VENUE_NAME[a.venue]}</span><b>{centsText(m.aCents)}</b></p>
        <p className="lp-deal__leg lp-b"><span className="dim">Buy {b.side.toUpperCase()} on {VENUE_NAME[b.venue]}</span><b>{centsText(m.bCents)}</b></p>
        <p className="lp-deal__leg lp-eq"><span className="dim">You pay</span><b>{centsText(m.inCents)}</b></p>
        <p className="lp-deal__leg lp-out"><span className="dim">You get back, either way</span><b>$1</b></p>
      </div>
      <div className="lp-bar" aria-hidden="true">
        <span className="lp-bar__a" style={{ width: w(m.aCents) }} />
        <span className="lp-bar__b" style={{ width: w(m.bCents) }} />
        <span className="lp-bar__f" style={{ width: w(m.feeCents) }} />
        <span className="lp-bar__p" style={{ width: w(m.profitCents) }} />
      </div>
      <p className="lp-deal__profit">
        <span className="dim small">After {centsText(m.feeCents)} in fees, you keep</span>
        <span><b className="lp-deal__big profit">{centsText(m.profitCents)}</b> <span className="muted small">per $1 ({pct(m.roi)})</span></span>
      </p>
    </figure>
  );
}
