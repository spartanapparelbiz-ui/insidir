/* 1. Hero: the A/B headline and CTA, and today's real top deal from the free (30-minute delayed) feed. */
import Link from "next/link";
import { SafetyLight } from "@/components/SafetyLight";
import type { FeedRow } from "@/lib/feed";
import { pct } from "@/lib/format";
import { Ago } from "./Ago";

export const HERO_SUB = "Insidir scans both apps every few seconds for prices that lock in a profit, after fees.";

export function Hero({ headline, cta, checkout, top, now }: { headline: string; cta: string; checkout: string; top: FeedRow | null; now: number }) {
  return (
    <section className="lp-hero" data-section="hero" aria-labelledby="hero-h">
      <div className="lp-hero__copy">
        <h1 id="hero-h" className="lp-hero__h">{headline}</h1>
        <p className="lp-hero__sub">{HERO_SUB}</p>
        <div className="lp-hero__ctas">
          <Link className="btn btn--primary" href="/terminal">{cta}</Link>
          <a className="btn btn--secondary" href={checkout} data-checkout="hero">Start for $39</a>
        </div>
        <p className="dim tiny">No signup to look. The free feed is 30 minutes late.</p>
      </div>
      {top ? <LiveWidget row={top} now={now} /> : null}
    </section>
  );
}

function LiveWidget({ row, now }: { row: FeedRow; now: number }) {
  const lock = row.kind !== "second_opinion";
  return (
    <Link className="lp-widget card" href="/terminal" aria-label="Today's top deal on the free feed">
      <div className="lp-widget__top">
        <span className="tiny muted">Today&apos;s top deal · 30 min delay</span>
        <SafetyLight safety={row.safety} />
      </div>
      <p className="lp-widget__title">{row.title}</p>
      <p className="deal__play">{row.play}</p>
      <div className="lp-widget__roi">
        <span className="num__k">{lock ? "ROI after fees" : "Price gap"}</span>
        <span className={`big${lock ? " profit" : ""}`}>{lock ? pct(row.roi) : `${row.gapCents ?? 0}¢`}</span>
      </div>
      <p className="dim tiny">Found <Ago at={row.foundAt} now={now} /> · prices as found, not live</p>
    </Link>
  );
}
