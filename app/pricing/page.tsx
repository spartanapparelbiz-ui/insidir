/* Pricing (/pricing): one plan, on the terminal. The subscription block ($1 · 3 DAYS → $39/MO · CANCEL ANYTIME, what
 * members get as a two-column table, one Start for $1), visitor vs. member, this week's live numbers (read from the
 * database, none typed in), and billing questions. Billing is Whop's. */
import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { Frame } from "@/components/brand/app/Frame";
import { Panel, PanelGrid } from "@/components/terminal/Panel";
import { getViewer } from "@/lib/auth/viewer";
import { PAST, TRIAL_LINE } from "@/lib/copy";
import { MEMBER_GETS } from "@/lib/brand/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { proofStrip } from "@/lib/home/proof";
import { memo } from "@/lib/memo";
import { pulse } from "@/lib/millionaires/queries";
import { PLANS, TRIAL, isPaid } from "@/lib/plans";
import { planLine } from "@/lib/brand/plan-line";
import "../flow-terminal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing", description: `See who's betting on Kalshi. Kalshi won't show you. Every millionaire bet live, pings with the Kalshi price, every race, wallet records and copy tickets: $${TRIAL.fee} for ${TRIAL.days} days, then $${PLANS.insidir.price}/month.` };


const COMPARE: Array<[string, string, string]> = [
  ["The board", "60 minutes late", "Live"],
  ["Which side they took", "—", "Every bet"],
  ["Pings", "—", "Yes, with the Kalshi price"],
  ["Races", "One in full", "Every race"],
  ["Wallet records", "—", "Yes"],
  ["Copy tickets", "—", "Yes"],
];

const BILLING = [
  { id: "cancel", q: "How do I cancel?", a: "One tap in Account. No emails, no calls. You keep access until the end of the period you paid for." },
  { id: "dollar", q: `What is the $${TRIAL.fee} trial?`, a: `Your first ${TRIAL.days} days cost $${TRIAL.fee}, with everything a member gets. Cancel inside those ${TRIAL.days} days and $${TRIAL.fee} is all you pay.` },
  { id: "after", q: `What happens after ${TRIAL.days} days?`, a: `It becomes $${PLANS.insidir.price}/month, charged to the same card, until you cancel.` },
  { id: "refunds", q: "Can I get a refund?", a: "Write to hello@aethric.llc and we'll sort it out." },
];

interface Week { today: number; wallets: number; twins: number; audit: { ok: number; checked: number } | null; at: number }

async function thisWeek(now: number): Promise<Week | null> {
  if (!hasDatabase()) return null;
  const db = getDb();
  return memo("pricing:week", 60_000, async () => {
    const [p, w, t, proof] = await Promise.all([
      pulse(db, now).catch(() => null),
      db.execute(sql`select count(*)::int as n from terminal.watchlist where tier = 'millionaire'`).then(r => Number((r.rows[0] as { n: number }).n)).catch(() => 0),
      db.execute(sql`select count(*)::int as n from terminal.market_twins where status = 'approved'`).then(r => Number((r.rows[0] as { n: number }).n)).catch(() => 0),
      proofStrip(db, now).catch(() => null),
    ]);
    return { today: p?.countToday ?? 0, wallets: w, twins: t, audit: proof?.accuracy ? { ok: proof.accuracy.ok, checked: proof.accuracy.checked } : null, at: now };
  });
}

export default async function PricingPage() {
  const viewer = await getViewer();
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  const w = await thisWeek(Date.now());
  const items = w ? [
    w.wallets ? { label: "Millionaire wallets watched", value: w.wallets.toLocaleString("en-US"), testid: "week-positions" } : null,
    { label: "Millionaire bets today", value: w.today.toLocaleString("en-US"), testid: "week-bets" },
    { label: "Markets with a Kalshi twin", value: w.twins.toLocaleString("en-US"), testid: "week-twins" },
    w.audit ? { label: "Last accuracy audit", value: `${w.audit.ok} of ${w.audit.checked} matched`, testid: "week-check" } : null,
  ].filter(<T,>(x: T | null): x is T => x !== null) : [];
  return (
    <Frame member={member} current="account" testid="pricing-page">
      <div className="t-wrap tg-page">
        <header className="tg-head">
          <h1 className="tg-h1" id="p-h">See who&apos;s betting on Kalshi. Kalshi won&apos;t show you.</h1>
          <p className="tg-sub">Polymarket&apos;s bets are public. We watch its most profitable wallets and put the same market on Kalshi next to every bet.</p>
        </header>
        <PanelGrid>
          <Panel n={1} title="Subscription · Insidir" meta="One plan" span={2} testid="pricing-hero" source="Billing by Whop">
            <div className="tg-plan" data-testid="plan-card">
              <p className="tg-plan__line" data-testid="plan-line">{planLine()}</p>
              <p className="tg-plan__price">${PLANS.insidir.price}/month <span>after the trial</span></p>
              <p className="tg-body tg-muted">{TRIAL_LINE}. Cancel anytime.</p>
              <table className="t-table" data-testid="plan-features">
                <thead><tr><th scope="col">What members get</th><th scope="col" className="r">Included</th></tr></thead>
                <tbody>{MEMBER_GETS.map(t => <tr key={t}><td className="tg-wrapcell">{t}</td><td className="r t-blue">YES</td></tr>)}</tbody>
              </table>
              <div className="tg-row">
                {member ? <a className="tg-btn" href="/">Open Insidir</a> : <a className="t-cta t-cta--lg" href="/go" data-checkout="pricing">Start for ${TRIAL.fee}</a>}
                <span className="tg-note">Secure checkout. Apple Pay and Google Pay where your device has them.</span>
              </div>
            </div>
          </Panel>
          <Panel n={2} title="Visitor vs. member" testid="pricing-compare" source="Insidir plans">
            <table className="t-table" data-testid="compare">
              <thead><tr><th scope="col"><span className="b-sr">What you get</span></th><th scope="col">Visitor</th><th scope="col">Member</th></tr></thead>
              <tbody>{COMPARE.map(([k, v, m]) => <tr key={k}><th scope="row" className="tg-rowh">{k}</th><td className="t-muted">{v}</td><td><b>{m}</b></td></tr>)}</tbody>
            </table>
          </Panel>
          <Panel n={3} title="This week on Insidir" span={3} testid="pricing-week" source="Insidir database" fetchedAt={w?.at ?? null}
            empty={items.length ? null : "No live numbers right now."}>
            <dl className="tg-kpis">
              {items.map(i => <div key={i.testid} className="tg-kpi" data-testid={i.testid}><dt className="t-label">{i.label}</dt><dd className="tg-kpi__n">{i.value}</dd></div>)}
            </dl>
            <p className="tg-note">{PAST}</p>
          </Panel>
          <Panel n={4} title="Billing" span={3} testid="pricing-billing" source="Billing by Whop">
            <dl className="tg-qa">{BILLING.map(b => <div key={b.id} data-testid="faq-item"><dt>{b.q}</dt><dd>{b.a}</dd></div>)}</dl>
          </Panel>
        </PanelGrid>
      </div>
    </Frame>
  );
}
