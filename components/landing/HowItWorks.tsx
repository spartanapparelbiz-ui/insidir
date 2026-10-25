/* 3. How it works. The 55¢ + 40¢ numbers are the owner's illustration and are labelled "Example"; the fees on it
 * are computed with the real fee functions. Under it, today's real green cross-venue row when one exists. */
import { SafetyLight } from "@/components/SafetyLight";
import { LOCK_LINE } from "@/lib/copy";
import type { FeedRow } from "@/lib/feed";
import { takerFee, KALSHI_DEFAULT_MULTIPLIER, polymarketRate } from "@/lib/fees";
import { centsText, pct, usd } from "@/lib/format";

/** The example: 100 sets, YES 55¢ on Kalshi + NO 40¢ on Polymarket, a sports market. */
const EX = { sets: 100, yes: 0.55, no: 0.4, category: "sports" } as const;

export function exampleMath() {
  const cost = EX.sets * (EX.yes + EX.no);
  const fees = takerFee({ venue: "kalshi", multiplier: KALSHI_DEFAULT_MULTIPLIER }, EX.sets, EX.yes)
    + takerFee({ venue: "polymarket", rate: polymarketRate(EX.category) }, EX.sets, EX.no);
  const payout = EX.sets;
  const profit = payout - cost - fees;
  return { cost, fees, payout, profit, roi: profit / (cost + fees) };
}

export function HowItWorks({ real }: { real: FeedRow | null }) {
  const m = exampleMath();
  const [a, b] = real ? real.legs : [];
  return (
    <section className="sec lp-how" data-section="how" aria-labelledby="how-h">
      <h2 id="how-h" className="sec__h">How it works</h2>
      <ol className="lp-steps">
        <li className="lp-step card">
          <span className="lp-step__n">1 · Example</span>
          <p className="lp-step__eq"><span>YES <b>55¢</b> on Kalshi</span><span>+ NO <b>40¢</b> on Polymarket</span><span>= <b>95¢</b> in</span></p>
          <p className="muted small">The two apps price the same event differently. Buy the opposite sides.</p>
        </li>
        <li className="lp-step card">
          <span className="lp-step__n">2 · Either way, $1 out</span>
          <div className="lp-outs">
            <p className="lp-out"><span className="dim">If YES wins</span><span>Kalshi YES pays <b>$1</b></span><span className="dim">Polymarket NO pays 0</span></p>
            <p className="lp-out"><span className="dim">If NO wins</span><span>Polymarket NO pays <b>$1</b></span><span className="dim">Kalshi YES pays 0</span></p>
          </div>
        </li>
        <li className="lp-step card">
          <span className="lp-step__n">3 · Minus fees</span>
          <p className="small">On {EX.sets} sets: {usd(m.cost)} in, {usd(m.fees)} taker fees, {usd(m.payout)} out either way.</p>
          <p><span className="big profit">{usd(m.profit)}</span> <span className="muted">({pct(m.roi)})</span></p>
        </li>
      </ol>
      <p className="lp-lock">{LOCK_LINE}</p>
      {real && a && b ? (
        <div className="lp-real card">
          <div className="lp-widget__top"><span className="tiny muted">Today&apos;s real one · 30 min delay</span><SafetyLight safety={real.safety} /></div>
          <p className="deal__title">{real.title}</p>
          <p className="lp-step__eq">
            <span>{a.side.toUpperCase()} <b>{centsText(a.priceCents)}</b> on {a.venueName}</span>
            <span>+ {b.side.toUpperCase()} <b>{centsText(b.priceCents)}</b> on {b.venueName}</span>
            <span>= <b>{centsText(Math.round((a.priceCents + b.priceCents) * 10) / 10)}</b> in</span>
          </p>
          <p className="small">After fees: <b className="profit">{pct(real.roi)}</b></p>
        </div>
      ) : null}
    </section>
  );
}
