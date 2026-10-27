/* Pricing (docs/INSIDIR-V2.md §8): Free / Insidir ($1 for 3 days, then $39/mo, "Most popular") / Pro ($99/mo). Each plan is a
 * plain list; anything not live on production carries a "Soon" badge right in the bullet, so nobody pays for something
 * that isn't there yet (lib/features.ts). Billing itself is Whop's. */
import Link from "next/link";
import { isReady, type Feature } from "@/lib/features";
import { PLANS, TRIAL } from "@/lib/plans";
import type { Plan } from "@/lib/types";

interface Bullet { text: string; needs?: Feature }
export const PLAN_BULLETS: Record<Plan, Bullet[]> = {
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

/** What the $1 trial unlocks, ready features only (the lock sheet, components/lock). */
export const insidirUnlocks = (): string[] => PLAN_BULLETS.insidir.filter(b => !b.needs || isReady(b.needs)).map(b => b.text);

/** Each plan in one line, under its name. */
const PITCH: Record<Plan, string> = {
  free: "Look around. See what the big money did.",
  insidir: "See every big move the moment it happens.",
  pro: "For people who follow a lot of traders.",
};

const Check = () => <svg className="plan2__check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function PricingCards({ current, signedIn, insidirHref, proHref, level = 2, primary = false, actions = true, title = "Pick how fast you see the big money." }: {
  current: Plan; signedIn: boolean; insidirHref: string; proHref: string; level?: 1 | 2; primary?: boolean;
  /** Buttons on the cards (off on home: one action there, and the $1 trial once at the end). */
  actions?: boolean;
  /** The section title (null: none, when the page band already says it). */
  title?: string | null;
}) {
  const H = level === 1 ? "h1" : "h2";
  // Plan names sit one level under the section title (h2 on /pricing, h3 inside the home page's sections).
  const PlanH = level === 1 ? "h2" : "h3";
  const amount: Record<Plan, string> = { free: "$0", insidir: `$${TRIAL.price}`, pro: `$${PLANS.pro.price}` };
  const unit: Record<Plan, string> = { free: "forever", insidir: `for ${TRIAL.days} days`, pro: "/month" };
  const sub: Record<Plan, string> = { free: "No card needed.", insidir: `Then $${PLANS.insidir.price}/month. Cancel anytime.`, pro: "Cancel anytime." };
  return (
    <section className="sec2 pricing2" id="pricing" aria-labelledby={title ? "pricing-h" : undefined} aria-label={title ? undefined : "Plans"}>
      <div className="wrap">
        {title ? <H id="pricing-h" className="sec2__h">{title}</H> : null}
        <div className="plans2">
          {(["free", "insidir", "pro"] as const).map((p, i) => {
            const mine = signedIn && p === current;
            return (
              <article key={p} className={`plan2 rv${p === "insidir" ? " plan2--main" : ""}`} style={{ ["--i" as string]: i }} data-plan={p}>
                <div className="plan2__top">
                  <PlanH className="plan2__name">{PLANS[p].name}</PlanH>
                  {p === "insidir" ? <p className="plan2__flag">Most popular</p> : mine ? <p className="plan2__flag plan2__flag--mine">Your plan</p> : null}
                </div>
                <p className="plan2__pitch">{PITCH[p]}</p>
                <p className="plan2__price"><span className="plan2__amt">{amount[p]}</span> <span className="plan2__unit">{unit[p]}</span></p>
                <p className="plan2__sub">{sub[p]}</p>
                {!actions ? null : mine ? <Link className="btn btn--secondary btn--block" href="/settings">Manage your plan</Link>
                  : p === "free" ? <Link className="btn btn--secondary btn--block" href="/feed">See the live feed</Link>
                  : <a className={`btn btn--block ${p === "insidir" && primary ? "btn--primary" : "btn--secondary"}`}
                      href={p === "pro" ? proHref : insidirHref} data-checkout={`pricing-${p}`}>{p === "pro" ? "Go Pro" : `Try it for $${TRIAL.price}`}</a>}
                <ul className="plan2__list">
                  {PLAN_BULLETS[p].map(b => {
                    const soon = b.needs ? !isReady(b.needs) : false;
                    return <li key={b.text} className={soon ? "plan2__soon" : undefined}><Check />{b.text}{soon ? <span className="plan2__badge">Soon</span> : null}</li>;
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Every plan side by side, row by row: what you get on each. "Soon" where the feature isn't live yet. */
export function PlanCompare() {
  type Cell = string | boolean;
  const rows: Array<{ label: string; cells: [Cell, Cell, Cell]; needs?: Feature }> = [
    { label: "Big moves on sports and prediction markets", cells: ["30 min late", "Live", "Live"] },
    { label: "Insider stock trades (SEC filings)", cells: ["30 min late", "Live", "Live"], needs: "stocks" },
    { label: "Every result, won or lost", cells: [true, true, true] },
    { label: "Trader records: won, lost, all-time profit", cells: [false, true, true], needs: "records" },
    { label: "Follow traders and markets", cells: [false, "Up to 50", "Unlimited"], needs: "follows" },
    { label: "Phone and email alerts", cells: [false, true, true], needs: "alerts_push" },
    { label: "A daily email of the biggest moves", cells: [false, true, true], needs: "daily_email" },
    { label: "Custom alert rules", cells: [false, false, true], needs: "custom_rules" },
    { label: "Price gaps between Kalshi and Polymarket", cells: [false, false, true], needs: "price_gaps" },
  ];
  const cell = (c: Cell) => c === true ? <><Check /><span className="sr-only">Included</span></> : c === false ? <span className="cmp__no" aria-label="Not included">–</span> : c;
  return (
    <section className="sec2 cmp" aria-labelledby="cmp-h">
      <div className="wrap">
        <h2 id="cmp-h" className="sec2__h">Compare plans</h2>
        <div className="cmp__scroll">
          <table className="cmp__t">
            <thead><tr><th scope="col"><span className="sr-only">Feature</span></th>{(["free", "insidir", "pro"] as const).map(p => <th key={p} scope="col" className={p === "insidir" ? "cmp__main" : undefined}>{PLANS[p].name}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => {
                const soon = r.needs ? !isReady(r.needs) : false;
                return (
                  <tr key={r.label}>
                    <th scope="row">{r.label}{soon ? <span className="plan2__badge">Soon</span> : null}</th>
                    {r.cells.map((c, i) => <td key={i} className={i === 1 ? "cmp__main" : undefined}>{cell(c)}</td>)}
                  </tr>
                );
              })}
              <tr className="cmp__price"><th scope="row">Price</th><td>$0</td><td className="cmp__main">${TRIAL.price} for {TRIAL.days} days, then ${PLANS.insidir.price}/mo</td><td>${PLANS.pro.price}/mo</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** Three plain promises under the plans. */
export function PlanPromises() {
  const items: Array<[string, string, string]> = [
    ["M12 3v18M3 12h18", "Cancel in one click", "One tap in Account. No emails, no calls. You keep access until the period you paid for ends."],
    ["M5 12l4 4L19 6", "Secure checkout", "Payments run through Whop. We never see your card."],
    ["M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", "Real data, checked hourly", "Public records only, and every card links its source."],
  ];
  return (
    <section className="sec2 promise" aria-label="Our promises">
      <div className="wrap promise__grid">
        {items.map(([d, h, p]) => (
          <div key={h} className="promise__item">
            <svg viewBox="0 0 24 24" className="promise__icon" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <p className="promise__h">{h}</p>
            <p className="promise__p">{p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
