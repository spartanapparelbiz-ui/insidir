/* 7. Pricing: three cards whose prices and features come from PLANS (lib/plans.ts). Shared with /pricing. */
import Link from "next/link";
import type { Plan } from "@/lib/types";
import { COMPETITOR_PRICE_LINE, planCards } from "./model";

export function Pricing({ current, signedIn, insidirHref, proHref }: { current: Plan; signedIn: boolean; insidirHref: string; proHref: string }) {
  const cards = planCards();
  return (
    <section className="sec" id="pricing" data-section="pricing" aria-labelledby="pricing-h">
      <h2 id="pricing-h" className="sec__h">Pricing</h2>
      <div className="lp-plans">
        {cards.map(c => {
          const mine = signedIn && c.plan === current;
          const href = c.plan === "free" ? "/terminal" : c.plan === "pro" ? proHref : insidirHref;
          const label = c.plan === "free" ? "See live deals" : `Start ${c.plan === "pro" ? "Pro " : ""}for $${c.price}`;
          return (
            <article key={c.plan} className={`lp-plan card${c.plan === "insidir" ? " lp-plan--main" : ""}`} data-plan={c.plan} data-price={c.price}>
              <h3 className="lp-plan__name">{c.name}</h3>
              <p className="tiny muted">{c.tagline}</p>
              <p className="lp-plan__price"><span className="big">${c.price}</span>{c.price ? <span className="muted">/mo</span> : null}</p>
              <ul className="lp-plan__list">
                {c.inherits ? <li className="muted">Everything in {c.inherits}, plus:</li> : null}
                {c.features.map(f => <li key={f}>{f}</li>)}
              </ul>
              {mine ? <Link className="btn btn--secondary btn--block" href="/settings">Your plan</Link>
                : c.plan === "free" ? <Link className="btn btn--secondary btn--block" href={href}>{label}</Link>
                : <a className={`btn btn--block ${c.plan === "insidir" ? "btn--primary" : "btn--secondary"}`} href={href} data-checkout={`pricing-${c.plan}`}>{label}</a>}
            </article>
          );
        })}
      </div>
      <p className="small muted">{COMPETITOR_PRICE_LINE} Cancel anytime in one click.</p>
    </section>
  );
}
