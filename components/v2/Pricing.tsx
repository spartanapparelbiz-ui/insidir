/* Pricing: one plan, Insidir: "$39/month · all N trackers" (N counted, never typed), the $1 first week as small print,
 * cancel anytime. It leads with what a member gets that a visitor doesn't: every open position from winning trackers,
 * live; followable records for every tracker and trader; the leaderboard with what each one holds now; Following.
 * Then what's coming, marked "(coming soon)", so nobody pays for something that isn't there yet (lib/features.ts).
 * No invented numbers, no promises: performance is past results. The button opens the checkout on /start; sign-in and
 * billing are Whop's. */
import Link from "next/link";
import { isReady, type Feature } from "@/lib/features";
import { PLANS, PRICE, TRIAL } from "@/lib/plans";
import { GET_CTA, PAST } from "@/lib/copy";
import { visibleTrackers } from "@/lib/trackers";

/** Every tracker a member gets today (crypto counts once it's live). */
export const trackerCount = (): number => visibleTrackers(isReady).length;
import type { Plan } from "@/lib/types";

interface Bullet { text: string; needs?: Feature }
/** Everything Insidir gives a member; the unready ones show as "(coming soon)". */
export const FEATURES: Bullet[] = [
  { text: "Every open position from winning trackers, live (visitors see 3, 30 minutes late)", needs: "feed" },
  { text: "Followable records for every tracker and trader: what $100 on each position would have made", needs: "records" },
  { text: "The leaderboard, with what each tracker and trader holds now", needs: "records" },
  { text: "Following: the trackers and traders you pick, in one feed", needs: "follows" },
  { text: "Every large position, live: sports, prediction markets and insider stock trades", needs: "feed" },
  { text: "Every result, won or lost" },
  { text: "Phone alerts when they move", needs: "alerts_push" },
  { text: "Custom alert rules: any tab, league or size", needs: "custom_rules" },
  { text: "Price gaps between Kalshi and Polymarket", needs: "price_gaps" },
  { text: "Crypto", needs: "crypto" },
];

const ready = (b: Bullet) => !b.needs || isReady(b.needs);
/** What the plan unlocks today (the lock sheet, components/lock). */
export const insidirUnlocks = (): string[] => FEATURES.filter(ready).map(b => b.text);

const Check = () => <svg className="plan2__check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** /start's list: at most five live things, no repeats; everything not live yet goes in one quiet line under it. */
const START_LIST: Bullet[] = [
  { text: "Every open position from winning trackers, live", needs: "feed" },
  { text: "Followable records for every tracker and trader", needs: "records" },
  { text: "The leaderboard, with what each one holds now", needs: "records" },
  { text: "Following: the trackers and traders you pick", needs: "follows" },
  { text: "Every large position, live, including insider stock trades", needs: "feed" },
];
const SOON_NAME: Record<string, string> = { alerts_push: "phone alerts", custom_rules: "custom alert rules", price_gaps: "price gaps", crypto: "crypto" };
export const startList = (): string[] => START_LIST.filter(ready).map(b => b.text).slice(0, 5);
export const comingSoonLine = (): string | null => {
  const soon = FEATURES.filter(b => !ready(b)).map(b => SOON_NAME[b.needs ?? ""]).filter((x): x is string => Boolean(x));
  return soon.length ? `More coming: ${soon.join(", ")}.` : null;
};

export function StartList() {
  const more = comingSoonLine();
  return (
    <>
      <ul className="plan2__list start__list" data-testid="start-list">{startList().map(t => <li key={t}><Check />{t}</li>)}</ul>
      {more ? <p className="start__more">{more}</p> : null}
    </>
  );
}

/** The plan's features as a list: ready ones first, then the coming-soon ones. */
export function FeatureList({ className = "plan2__list" }: { className?: string }) {
  const live = FEATURES.filter(ready), soon = FEATURES.filter(b => !ready(b));
  return (
    <ul className={className}>
      {live.map(b => <li key={b.text}><Check />{b.text}</li>)}
      {soon.map(b => <li key={b.text} className="plan2__soon"><Check />{b.text} (coming soon)</li>)}
    </ul>
  );
}

export function PricingCards({ current, signedIn, href, level = 2, actions = true, title = "One plan. Everything in it." }: {
  current: Plan; signedIn: boolean; href: string; level?: 1 | 2;
  /** The button on the card (off on home, where the action is once, at the end). */
  actions?: boolean;
  /** The section title (null: none, when the page band already says it). */
  title?: string | null;
}) {
  const H = level === 1 ? "h1" : "h2";
  const PlanH = level === 1 ? "h2" : "h3";
  const mine = signedIn && current === "insidir";
  return (
    <section className="sec2 pricing2" id="pricing" aria-labelledby={title ? "pricing-h" : undefined} aria-label={title ? undefined : "Plan"}>
      <div className="wrap">
        {title ? <H id="pricing-h" className="sec2__h">{title}</H> : null}
        <article className="plan2 plan2--main plan2--one rv" data-plan="insidir">
          <div className="plan2__head">
            <div className="plan2__top">
              <PlanH className="plan2__name">{PLANS.insidir.name}</PlanH>
              {mine ? <p className="plan2__flag plan2__flag--mine">Your plan</p> : null}
            </div>
            <p className="plan2__pitch">Every open position from the trackers that made money for anyone following them, live, with each one&apos;s record. {PAST}</p>
            <p className="plan2__price"><span className="plan2__amt">${PLANS.insidir.price}</span> <span className="plan2__unit">/month · all {trackerCount()} trackers</span></p>
            <p className="plan2__sub plan2__fine">First week ${TRIAL.fee}. Cancel anytime. Secure sign-in and payments by Whop.</p>
            {!actions ? null : mine ? <Link className="btn btn--secondary btn--block" href="/settings">Manage your plan</Link>
              : <Link className="btn btn--primary btn--big btn--block" href={href} data-checkout="pricing">{GET_CTA}</Link>}
          </div>
          {/* The same list as /start: five live lines at most, then one "More coming" line. */}
          <div className="plan2__features"><StartList /></div>
        </article>
      </div>
    </section>
  );
}

/** Three plain promises under the plan. */
export function PlanPromises() {
  const items: Array<[string, string, string]> = [
    ["M12 3v18M3 12h18", "Cancel anytime", "On your Whop orders page (Account → Manage subscription). You keep access until the month you paid for ends."],
    ["M5 12l4 4L19 6", "Secure sign-in and payments by Whop", "Checkout runs right on this site. We never see your card."],
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

export { PRICE };
