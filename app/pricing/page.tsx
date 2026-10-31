/* Pricing (/pricing): one plan. "Follow the big money." on the left and the plan card on the right ($39/month, the $1
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
import { topTrackers } from "@/lib/follow/board";
import { hundredLine, roiText } from "@/lib/follow/math";
import { proofStrip, type Proof } from "@/lib/home/proof";
import { memo } from "@/lib/memo";
import { PAST } from "@/lib/copy";
import { PLANS, TRIAL, isPaid } from "@/lib/plans";
import { trackerStats } from "@/lib/trackers-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing", description: `Insidir is $${PLANS.insidir.price}/month: every open position from winning trackers live, followable records for every tracker and trader, analyst notes, Research and Following. Your first week is $1. Cancel anytime.` };

const PLAN_LIST = [
  "Every open position from winning trackers, live",
  "Followable records for every tracker and trader",
  "Analyst notes on every position",
  "Research over all of Insidir's data",
  "The leaderboard and Following",
];

const COMPARE: Array<[string, string, string]> = [
  ["Large positions", "30 minutes late", "Live"],
  ["Open positions from winning trackers", "3", "All of them"],
  ["Research", "3 questions a day", "Unlimited, with CSV export"],
  ["Analyst notes", "On delayed positions", "On live positions"],
  ["Following", "—", "Yes"],
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
      {paid ? <Link className="btn btn--primary plan3__cta" href="/open">Open Insidir</Link>
        : <Link className="btn btn--primary plan3__cta" href={href} data-checkout="pricing">Start for ${TRIAL.fee}</Link>}
      <p className="plan3__fine">Secure sign-in and payments by Whop.</p>
      <ul className="plan3__list">{PLAN_LIST.map(t => <li key={t}><Check />{t}</li>)}</ul>
    </div>
  );
}

interface Week { proof: Proof | null; best: { name: string; slug: string; roi: string; line: string } | null; at: number }

async function thisWeek(now: number): Promise<Week> {
  if (!hasDatabase()) return { proof: null, best: null, at: now };
  const db = getDb();
  const [proof, stats] = await Promise.all([
    memo("home:proof", 20_000, () => proofStrip(db, now)).catch(() => null),
    memo("home:stats", 20_000, () => trackerStats(db, now)).catch(() => null),
  ]);
  const top = stats ? topTrackers(stats, 1)[0] : undefined;
  return { proof, at: now, best: top ? { name: top.t.name, slug: top.t.slug, roi: roiText(top.r.net, top.r.staked), line: hundredLine(top.r) } : null };
}

export default async function PricingPage() {
  const viewer = await getViewer();
  const href = unlockHref();
  const paid = isPaid(viewer.plan);
  const now = Date.now();
  const w = await thisWeek(now);
  const a = w.proof?.accuracy;
  const items = [
    w.proof ? { label: "Large positions tracked, last 7 days", value: w.proof.positionsWeek.toLocaleString("en-US"), testid: "week-positions" } : null,
    w.best ? { label: `Best tracker: ${w.best.name}`, value: w.best.roi, note: <>followable ROI · {w.best.line} <Link href={`/trackers/${w.best.slug}`}>See it</Link></>, testid: "week-best" } : null,
    a ? { label: "Last accuracy check", value: `${a.ok} of ${a.checked}`, note: "positions re-read from the source matched", testid: "week-check" } : null,
  ].filter(<T,>(x: T | null): x is T => x !== null);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} current="/pricing" trialHref={href} />
      <main className="lp3 pgpage">
        <PageHead kicker="Pricing" title="Follow the big money." sub="One plan with everything in it. Every large position on Polymarket, Kalshi and SEC filings, the record of whoever placed it, and what following it would have made."
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
              {items.map(i => <div key={i.testid} className="proof__item wk__item" data-testid={i.testid}><dt>{i.label}</dt><dd className="num" data-count="">{i.value}</dd>{i.note ? <dd className="proof__note">{i.note}</dd> : null}</div>)}
            </RevealGroup>
            <p className="tcol__note">{PAST}</p>
            <AsOf at={w.at} live sources={[SOURCES.polymarket, SOURCES.kalshi, SOURCES.sec, SOURCES.methodology]} />
          </Sec>
        ) : null}

        <FaqV2 title="Billing" items={BILLING} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchemaV2(BILLING) }} />
      </main>
    </>
  );
}
