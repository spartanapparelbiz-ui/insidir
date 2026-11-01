/* Pricing (/pricing): one plan. "Copy the winners." on the left and the plan card on the right ($39/month, the $1
 * first week, the black "Start for $1", five checkmarks), then visitor vs. member, this week's live numbers, and
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
import { copyable } from "@/lib/copies/store";
import { hundredLine, roiText } from "@/lib/follow/math";
import { proofStrip, type Proof } from "@/lib/home/proof";
import { memo } from "@/lib/memo";
import { INCLUDED, PAST } from "@/lib/copy";
import { PLANS, TRIAL, isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing", description: `Insidir is $${PLANS.insidir.price}/month: copy the wallets that win on Polymarket and Kalshi, see every bet they make live, and your P&L at your size. Your first week is $1. Cancel anytime.` };

const PLAN_LIST = [...INCLUDED, "A one-line analyst note on every move"];

const COMPARE: Array<[string, string, string]> = [
  ["The winners and their records", "Yes", "Yes"],
  ["New moves from the winners", "3, 30 minutes late", "All of them, live"],
  ["Copy a winner", "—", "Yes"],
  ["Your P&L at your size, weekly recap", "—", "Yes"],
  ["Open on Kalshi in the US", "—", "Yes"],
];

const BILLING = [
  { id: "cancel", q: "How do I cancel?", a: "One tap in Account, or on your Whop orders page. No emails, no calls. You keep access until the end of the period you paid for." },
  { id: "dollar", q: "What is the $1 week?", a: `Your first ${TRIAL.days} days cost $${TRIAL.fee}, with everything a member gets. Cancel inside those ${TRIAL.days} days and $${TRIAL.fee} is all you pay.` },
  { id: "after", q: "What happens after the first week?", a: `It becomes $${PLANS.insidir.price}/month, charged by Whop on the same card, until you cancel.` },
  { id: "refunds", q: "Can I get a refund?", a: "Payments and refunds are handled by Whop. Request one from your Whop orders page, or write to hello@aethric.llc and we'll sort it out with them." },
];

const Check = () => <svg className="plan3__check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function PlanCard({ href, paid }: { href: string; paid: boolean }) {
  return (
    <div className="plan3" data-testid="plan-card">
      <p className="plan3__name">Insidir</p>
      <p className="plan3__price"><b className="num">${PLANS.insidir.price}</b><span>/month</span></p>
      <p className="plan3__trial">Your first week is ${TRIAL.fee}. Cancel anytime.</p>
      {paid ? <Link className="btn btn--primary plan3__cta" href="/">My copies</Link>
        : <Link className="btn btn--primary plan3__cta" href={href} data-checkout="pricing">Start for ${TRIAL.fee}</Link>}
      <p className="plan3__fine">Secure sign-in and payments by Whop.</p>
      <ul className="plan3__list">{PLAN_LIST.map(t => <li key={t}><Check />{t}</li>)}</ul>
    </div>
  );
}

interface Week { proof: Proof | null; copyable: number; best: { name: string; href: string; roi: string; line: string } | null; at: number }

async function thisWeek(now: number): Promise<Week> {
  if (!hasDatabase()) return { proof: null, copyable: 0, best: null, at: now };
  const db = getDb();
  const [proof, list] = await Promise.all([
    memo("home:proof", 20_000, () => proofStrip(db, now)).catch(() => null),
    memo("home:copyable", 20_000, () => copyable(db, now)).catch(() => []),
  ]);
  const top = list[0];
  return { proof, copyable: list.length, at: now, best: top ? { name: top.label, href: top.kind === "trader" ? `/p/${top.target}` : `/trackers/${top.target}`, roi: roiText(top.record.net, top.record.staked), line: hundredLine(top.record) } : null };
}

export default async function PricingPage() {
  const viewer = await getViewer();
  const href = unlockHref();
  const paid = isPaid(viewer.plan);
  const now = Date.now();
  const w = await thisWeek(now);
  const a = w.proof?.accuracy;
  const items = [
    w.copyable ? { label: "Copyable winners right now", value: w.copyable.toLocaleString("en-US"), note: "wallets and trackers with 30+ settled positions", testid: "week-positions" } : null,
    w.best ? { label: `Best to copy: ${w.best.name}`, value: w.best.roi, note: <>followable return · {w.best.line} <Link href={w.best.href}>See it</Link></>, testid: "week-best" } : null,
    a ? { label: "Last accuracy check", value: `${a.ok} of ${a.checked}`, note: "positions re-read from the source matched", testid: "week-check" } : null,
  ].filter(<T,>(x: T | null): x is T => x !== null);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/pricing" trialHref={href} />
      <main className="lp3 pgpage">
        <PageHead kicker="Pricing" title="Copy the winners." sub="One plan. Pick a wallet or tracker with a real record on Polymarket and Kalshi, and every bet it makes shows up for you, with what copying it has made at your size."
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
