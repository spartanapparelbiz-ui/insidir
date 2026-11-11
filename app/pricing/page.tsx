/* Pricing (/pricing): one plan, on the homepage's system. What members get (pings with the Kalshi twin, every
 * millionaire bet live, every race, wallet records, copy tickets), $1 for 3 days then $39/month, visitor vs. member,
 * this week's live numbers (read from the database, none typed in), and billing questions. Billing is Whop's. */
import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { Frame } from "@/components/brand/app/Frame";
import { Faq } from "@/components/brand/Faq";
import { Lines, Panel, Pill, Stage } from "@/components/system";
import { getViewer } from "@/lib/auth/viewer";
import { PHOTOS, slotPhoto } from "@/lib/brand/images";
import { PAST, TRIAL_LINE } from "@/lib/copy";
import { MEMBER_GETS } from "@/lib/brand/copy";
import { getDb, hasDatabase } from "@/lib/db";
import { proofStrip } from "@/lib/home/proof";
import { memo } from "@/lib/memo";
import { pulse } from "@/lib/millionaires/queries";
import { PLANS, TRIAL, isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing", description: `See who's trading on Kalshi. Kalshi won't show you. Every millionaire trade live, pings with the Kalshi price, every race, wallet records and copy tickets: $${TRIAL.fee} for ${TRIAL.days} days, then $${PLANS.insidir.price}/month.` };


const COMPARE: Array<[string, string, string]> = [
  ["The board", "60 minutes late", "Live"],
  ["Which side they took", "—", "Every trade"],
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

interface Week { today: number; wallets: number; twins: number; audit: { ok: number; checked: number } | null }

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
    return { today: p?.countToday ?? 0, wallets: w, twins: t, audit: proof?.accuracy ? { ok: proof.accuracy.ok, checked: proof.accuracy.checked } : null };
  });
}

export default async function PricingPage() {
  const viewer = await getViewer();
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  const w = await thisWeek(Date.now());
  const items = w ? [
    w.wallets ? { label: "Millionaire wallets watched", value: w.wallets.toLocaleString("en-US"), testid: "week-positions" } : null,
    { label: "Millionaire trades today", value: w.today.toLocaleString("en-US"), testid: "week-bets" },
    { label: "Markets with a Kalshi twin", value: w.twins.toLocaleString("en-US"), testid: "week-twins" },
    w.audit ? { label: "Last accuracy audit", value: `${w.audit.ok} of ${w.audit.checked} matched`, testid: "week-check" } : null,
  ].filter(<T,>(x: T | null): x is T => x !== null) : [];
  return (
    <Frame member={member} current="account" testid="pricing-page">
      <Stage bg={{ kind: "photo", photo: slotPhoto("world"), dark: 0.55, priority: true }} first testid="pricing-hero" labelledBy="p-h">
        <div className="b-head">
          <Lines as="h1" id="p-h" lines={["See who's trading on Kalshi.", "Kalshi won't show you."]} size={56} />
          <p className="b-sub" data-m="lift">Polymarket&apos;s trades are public. We watch its most profitable wallets and put the same market on Kalshi next to every trade.</p>
        </div>
        <Panel className="s-col s-plan" testid="plan-card">
          <p className="b-label">Insidir</p>
          <p className="s-big b-num">${PLANS.insidir.price}<span className="b-small">/month</span></p>
          <p className="b-small">{TRIAL_LINE}. Cancel anytime.</p>
          <ul className="s-lockrows">{MEMBER_GETS.map(t => <li key={t}><span>✓ {t}</span></li>)}</ul>
          <div className="b-ctas">{member ? <Pill href="/">Open Insidir</Pill> : <Pill href="/go" data-checkout="pricing">Start for ${TRIAL.fee}</Pill>}</div>
          <p className="b-small">Secure checkout. Apple Pay and Google Pay where your device has them.</p>
        </Panel>
      </Stage>

      <Stage bg={{ kind: "photo", photo: PHOTOS.markets, dark: 0.7 }} testid="pricing-compare" labelledBy="cmp-h">
        <div className="b-head"><Lines as="h2" id="cmp-h" lines={["Visitor vs. member."]} size={48} /></div>
        <Panel className="s-col s-prose">
          <table data-testid="compare">
            <thead><tr><th scope="col"><span className="b-sr">What you get</span></th><th scope="col">Visitor</th><th scope="col">Member</th></tr></thead>
            <tbody>{COMPARE.map(([k, v, m]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td><td><b>{m}</b></td></tr>)}</tbody>
          </table>
        </Panel>
      </Stage>

      {items.length ? (
        <Stage bg={{ kind: "globe", dark: 0.6 }} testid="pricing-week" labelledBy="week-h">
          <div className="b-head"><Lines as="h2" id="week-h" lines={["This week on Insidir."]} size={48} /></div>
          <dl className="s-stats s-col">
            {items.map(i => <div key={i.testid} className="s-stat" data-testid={i.testid}><dt className="b-small">{i.label}</dt><dd className="b-num">{i.value}</dd></div>)}
          </dl>
          <p className="b-small b-center">{PAST}</p>
        </Stage>
      ) : null}

      <Stage bg={{ kind: "globe", dark: 0.7 }} testid="pricing-billing" labelledBy="bill-h">
        <div className="b-head"><Lines as="h2" id="bill-h" lines={["Billing."]} size={48} /></div>
        <Faq items={BILLING} />
      </Stage>
    </Frame>
  );
}
