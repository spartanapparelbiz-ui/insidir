/* Pricing (docs/V2.md §8): Free / Insidir ($1 for 3 days, then $39/mo, "Recommended") / Pro ($99/mo). Each plan is a
 * plain list; anything not live on production says "(coming soon)" right in the bullet, so nobody pays for something
 * that isn't there yet (lib/features.ts). Billing itself is Whop's. */
import Link from "next/link";
import { isReady, type Feature } from "@/lib/features";
import { PLANS, TRIAL } from "@/lib/plans";
import type { Plan } from "@/lib/types";

interface Bullet { text: string; needs?: Feature }
const PLAN_BULLETS: Record<Plan, Bullet[]> = {
  free: [{ text: "See big moves 30 minutes late" }, { text: "Sports and prediction markets" }, { text: "Every result, won or lost" }],
  insidir: [
    { text: "Every big move, live", needs: "feed" },
    { text: "Trader records: won, lost, all-time profit", needs: "records" },
    { text: "Follow up to 50 traders or markets", needs: "follows" },
    { text: "Phone and email alerts when they move", needs: "alerts_push" },
    { text: "A daily email of the biggest moves", needs: "daily_email" },
  ],
  pro: [
    { text: "Everything in Insidir" },
    { text: "Custom alert rules: any tab, league or size", needs: "custom_rules" },
    { text: "Unlimited follows", needs: "follows" },
    { text: "Price gaps between Kalshi and Polymarket", needs: "price_gaps" },
  ],
};

export function PricingCards({ current, signedIn, insidirHref, proHref, level = 2, primary = false }: {
  current: Plan; signedIn: boolean; insidirHref: string; proHref: string; level?: 1 | 2; primary?: boolean;
}) {
  const H = level === 1 ? "h1" : "h2";
  const price: Record<Plan, string> = { free: "$0", insidir: `$${TRIAL.price} for ${TRIAL.days} days`, pro: `$${PLANS.pro.price}/mo` };
  const sub: Record<Plan, string> = { free: "Free forever", insidir: `then $${PLANS.insidir.price}/mo. Cancel anytime.`, pro: "For people who follow a lot." };
  return (
    <section className="sec2 pricing2" id="pricing" aria-labelledby="pricing-h">
      <div className="wrap">
        <H id="pricing-h" className="sec2__h">Pick how fast you see the big money.</H>
        <div className="plans2">
          {(["free", "insidir", "pro"] as const).map(p => {
            const mine = signedIn && p === current;
            return (
              <article key={p} className={`plan2${p === "insidir" ? " plan2--main" : ""}`} data-plan={p}>
                {p === "insidir" ? <p className="plan2__flag">Recommended</p> : null}
                <h3 className="plan2__name">{PLANS[p].name}</h3>
                <p className="plan2__price">{price[p]}</p>
                <p className="plan2__sub">{sub[p]}</p>
                <ul className="plan2__list">
                  {PLAN_BULLETS[p].map(b => {
                    const soon = b.needs ? !isReady(b.needs) : false;
                    return <li key={b.text} className={soon ? "plan2__soon" : undefined}>{b.text}{soon ? " (coming soon)" : ""}</li>;
                  })}
                </ul>
                {mine ? <Link className="btn btn--secondary btn--block" href="/settings">Your plan</Link>
                  : p === "free" ? <Link className="btn btn--secondary btn--block" href="/feed">See the live feed</Link>
                  : <a className={`btn btn--block ${p === "insidir" && primary ? "btn--primary" : p === "insidir" ? "btn--primary" : "btn--secondary"}`}
                      href={p === "pro" ? proHref : insidirHref} data-checkout={`pricing-${p}`}>{p === "pro" ? "Go Pro" : `Try it for $${TRIAL.price}`}</a>}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
