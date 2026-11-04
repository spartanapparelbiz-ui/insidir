/* Pricing (/pricing): one plan. "Copy the winners." on the left and the plan card on the right ($39/month, the $1
 * trial (lib/plans.ts TRIAL), the black "Start for $1", five checkmarks), then visitor vs. member, this week's live numbers, and
 * billing questions. Every number is read from the database; none is typed in. Billing is Whop's. */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { AsOf, SOURCES } from "@/components/data/AsOf";
import { PageHead, Sec } from "@/components/page/Page";
import { RevealGroup } from "@/components/motion/Reveal";
import { FaqV2, faqSchemaV2 } from "@/components/v2/Faq";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isWinner, traderFollowAll } from "@/lib/follow/records";
import { proofStrip, type Proof } from "@/lib/home/proof";
import { memo } from "@/lib/memo";
import { INCLUDED, PAST, TRIAL_DAYS, TRIAL_LINE } from "@/lib/copy";
import { PLANS, TRIAL, isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing", description: `Insidir is $${PLANS.insidir.price}/month: unlimited Reads on any Polymarket or Kalshi market, with proven money, the big bets and the best price. ${TRIAL_LINE}. Cancel anytime.` };

const PLAN_LIST = [...INCLUDED, "Pay first with Apple Pay or Google Pay, sign in after"];

const COMPARE: Array<[string, string, string]> = [
  ["Reads", "1", "Unlimited"],
  ["Proven money and price now", "Yes", "Yes"],
  ["Big bets of the last 24 hours", "—", "Yes"],
  ["The analyst line", "—", "Yes"],
  ["Share image", "Yes", "Yes"],
];

const BILLING = [
  { id: "cancel", q: "How do I cancel?", a: "One tap in Account, or on your Whop orders page. No emails, no calls. You keep access until the end of the period you paid for." },
  { id: "dollar", q: `What is the $${TRIAL.fee} trial?`, a: `Your first ${TRIAL.days} days cost $${TRIAL.fee}, with everything a member gets. Cancel inside those ${TRIAL.days} days and $${TRIAL.fee} is all you pay.` },
  { id: "after", q: `What happens after the first ${TRIAL_DAYS}?`, a: `It becomes $${PLANS.insidir.price}/month, charged by Whop on the same card, until you cancel.` },
  { id: "refunds", q: "Can I get a refund?", a: "Payments and refunds are handled by Whop. Request one from your Whop orders page, or write to hello@aethric.llc and we'll sort it out with them." },
];

const Check = () => <svg className="plan3__check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function PlanCard({ href, paid }: { href: string; paid: boolean }) {
  return (
    <div className="plan3" data-testid="plan-card">
      <p className="plan3__name">Insidir</p>
      <p className="plan3__price"><b className="num">${PLANS.insidir.price}</b><span>/month</span></p>
      <p className="plan3__trial">{TRIAL_LINE}. Cancel anytime.</p>
      {paid ? <Link className="btn btn--primary plan3__cta" href="/">Read a market</Link>
        : <Link className="btn btn--primary plan3__cta" href={href} data-checkout="pricing">Start for ${TRIAL.fee}</Link>}
      <p className="plan3__fine">Secure sign-in and payments by Whop.</p>
      <ul className="plan3__list">{PLAN_LIST.map(t => <li key={t}><Check />{t}</li>)}</ul>
    </div>
  );
}

interface Week { proof: Proof | null; proven: number; at: number }

async function thisWeek(now: number): Promise<Week> {
  if (!hasDatabase()) return { proof: null, proven: 0, at: now };
  const db = getDb();
  const [proof, traders] = await Promise.all([
    memo("home:proof", 20_000, () => proofStrip(db, now)).catch(() => null),
    traderFollowAll(db, now).catch(() => new Map()),
  ]);
  return { proof, at: now, proven: [...traders.values()].filter(t => isWinner(t.all)).length };
}

export default async function PricingPage() {
  const viewer = await getViewer();
  const href = unlockHref();
  const paid = isPaid(viewer.plan);
  const now = Date.now();
  const w = await thisWeek(now);
  const a = w.proof?.accuracy;
  const items = [
    w.proven ? { label: "Proven wallets right now", value: w.proven.toLocaleString("en-US"), note: "30+ settled positions and a positive followable return", testid: "week-positions" } : null,
    a ? { label: "Last accuracy audit", value: `${a.ok} of ${a.checked}`, note: "positions re-read from the source matched", testid: "week-check" } : null,
  ].filter(<T,>(x: T | null): x is T => x !== null);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/pricing" trialHref={href} />
      <main className="lp3 pgpage">
        <PageHead kicker="Pricing" title="See where the smart money is." sub="One plan. Paste any Polymarket or Kalshi market and read it: proven money on each side, the big bets of the last 24 hours, and the best price now."
          aside={<PlanCard href={href} paid={paid} />} />

        <Sec id="cmp-h" title="Visitor vs. member">
          <div className="rans__scroll">
            <table className="rtable vm__t" data-testid="compare">
              <thead><tr><th scope="col"><span className="sr-only">What you get</span></th><th scope="col">Visitor</th><th scope="col">Member</th></tr></thead>
              <RevealGroup as="tbody">{COMPARE.map(([k, v, m]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td><td><b>{m}</b></td></tr>)}</RevealGroup>
            </table>
          </div>
        </Sec>

        {items.length ? (
          <Sec id="week-h" title="This week on Insidir">
            <RevealGroup as="dl" className="proof__grid wk__grid">
              {items.map(i => <div key={i.testid} className="proof__item wk__item" data-testid={i.testid}><dt>{i.label}</dt><dd className="num">{i.value}</dd>{i.note ? <dd className="proof__note">{i.note}</dd> : null}</div>)}
            </RevealGroup>
            <p className="tcol__note">{PAST}</p>
            <AsOf at={w.at} live sources={[SOURCES.polymarket, SOURCES.kalshi, SOURCES.methodology]} />
          </Sec>
        ) : null}

        <FaqV2 title="Billing" items={BILLING} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2(BILLING) }} />
      </main>
    </>
  );
}
