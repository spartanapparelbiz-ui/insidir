/* Read-only check, run before Whop goes live: does anyone still pay through the old stock product's Stripe billing?
 *
 * The stock product (removed in #59) billed through Stripe ($1 trial, then $39/month) and kept its accounts in the
 * `public` schema of the same Railway database. Its code is gone, but Stripe keeps charging any subscription
 * that was never cancelled. This script only reads. It changes nothing in the database or in Stripe.
 *
 *   DATABASE_URL=… npx tsx scripts/legacy-billing-check.ts
 *   DATABASE_URL=… INSIDIR_STRIPE_SECRET_KEY=sk_live_… npx tsx scripts/legacy-billing-check.ts   # also asks Stripe
 *
 * Exits 1 if any legacy subscription still bills (Stripe active, trialing, past_due, unpaid or paused). */
import { Pool } from "pg";

const BILLING = new Set(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]);

interface Row { email: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; subscription_status: string | null; current_period_end: Date | null }

async function fromDatabase(url: string): Promise<{ rows: Row[]; terminalPaid: number | null }> {
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("begin transaction read only");
    const has = await client.query<{ ok: boolean }>(
      "select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'stripe_customer_id') as ok");
    const rows = has.rows[0]?.ok
      ? (await client.query<Row>(`select email, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end
           from public.users where stripe_customer_id is not null or subscription_status is not null order by email`)).rows
      : [];
    const t = await client.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema = 'terminal' and table_name = 'users'");
    const terminalPaid = t.rows[0]?.n ? (await client.query<{ n: number }>("select count(*)::int as n from terminal.users where plan <> 'free'")).rows[0]?.n ?? 0 : null;
    await client.query("rollback");
    return { rows, terminalPaid };
  } finally {
    client.release();
    await pool.end();
  }
}

interface StripeSub { id: string; status: string; customer: string; current_period_end?: number; items?: { data?: Array<{ current_period_end?: number }> } }

/** Every Stripe subscription that can still charge, read with GET /v1/subscriptions (read-only). */
async function fromStripe(key: string): Promise<StripeSub[]> {
  const out: StripeSub[] = [];
  let after: string | null = null;
  for (;;) {
    const q = new URLSearchParams({ status: "all", limit: "100" });
    if (after) q.set("starting_after", after);
    const res = await fetch(`https://api.stripe.com/v1/subscriptions?${q}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Stripe: HTTP ${res.status}`);
    const body = await res.json() as { data: StripeSub[]; has_more: boolean };
    out.push(...body.data.filter(s => BILLING.has(s.status)));
    if (!body.has_more || !body.data.length) return out;
    after = body.data[body.data.length - 1]!.id;
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL to the Railway Postgres URL.");
  const { rows, terminalPaid } = await fromDatabase(url);
  const live = rows.filter(r => r.subscription_status && BILLING.has(r.subscription_status));
  console.log(`Legacy accounts with Stripe billing data: ${rows.length}`);
  console.log(`Legacy accounts Stripe may still charge (per the database): ${live.length}`);
  for (const r of live) console.log(`  ${r.email}  ${r.subscription_status}  ${r.stripe_subscription_id ?? "-"}  period ends ${r.current_period_end?.toISOString() ?? "?"}`);
  if (terminalPaid !== null) console.log(`Terminal (current Whop production) accounts on a paid plan: ${terminalPaid}`);

  let stripeLive = 0;
  const key = process.env.INSIDIR_STRIPE_SECRET_KEY;
  if (key) {
    const subs = await fromStripe(key);
    stripeLive = subs.length;
    console.log(`Stripe subscriptions that can still charge (per Stripe): ${subs.length}`);
    for (const s of subs) console.log(`  ${s.id}  ${s.status}  customer ${s.customer}`);
  } else {
    console.log("Stripe itself was not asked (no INSIDIR_STRIPE_SECRET_KEY). The database can be stale: check Stripe → Subscriptions too.");
  }
  if (live.length || stripeLive) {
    console.log("\nSTOP: real customers still bill through Stripe. Do not cancel or migrate them without the owner.");
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 2; });
