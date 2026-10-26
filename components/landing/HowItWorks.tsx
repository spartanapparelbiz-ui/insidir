/* 2. How it works, in 30 seconds: three panels, one sentence each (components/simple/Explainer). The 55¢ + 40¢
 * numbers are the owner's illustration and are labelled "Example" in the hero; the fees on them are computed with
 * the real fee functions. The Terminal shows the same panels on someone's first visit. */
import { takerFee, KALSHI_DEFAULT_MULTIPLIER, polymarketRate } from "@/lib/fees";
import { Explainer } from "@/components/simple/Explainer";

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

export function HowItWorks() {
  return (
    <section className="sec lp-how" data-section="how" aria-labelledby="how-h">
      <Explainer m={exampleMath()} />
    </section>
  );
}
