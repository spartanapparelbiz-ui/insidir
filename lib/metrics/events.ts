/* The paying-user funnel, logged per account and tied to its source (lib/attribution.ts):
 *   touch          a visit with a source (middleware.ts → /api/touch); a visitor's first is their first touch
 *   landing_view   the home page (already logged by app/page.tsx)
 *   account_created signup (already logged at sign-in; now also when the billing webhook makes the account)
 *   trial_start    the $1 trial's payment (Whop payment.succeeded, billing_reason subscription_create, or a payment
 *                  under the monthly price)
 *   trial_convert  the first $39 charge after it (billing_reason subscription_cycle, or a payment at the monthly price)
 *   sub_renewal    every later monthly charge
 *   sub_cancel     the membership set to cancel, or ended (membership.updated / membership.deactivated)
 *   refund         a refund (refund.created)
 * and activation: activation_follow2 (2+ wallets followed within 24 hours of signing up), brief_open (the Daily
 * Brief opened), alert_opened (an alert clicked; already logged by /api/alerts/opened).
 * Each billing and activation event is logged once (events.dedupe_key). Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { recordEvent } from "@/lib/analytics";
import { readTouch, sourceOf, type Touch } from "@/lib/attribution";
import { obj } from "@/lib/billing/whop";
import { PLANS } from "@/lib/plans";

export const BILLING_EVENTS = ["trial_start", "trial_convert", "sub_renewal", "sub_cancel", "refund"] as const;
export const ACTIVATION_EVENTS = ["activation_follow2", "brief_open", "alert_opened"] as const;

/** A Whop amount: a number, a numeric string, or { amount: "39.00" }. */
export function amountOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  const o = obj(v);
  return o ? amountOf(o.amount) : null;
}

export interface PaymentFacts { id: string | null; amount: number | null; reason: string | null; membershipId: string | null }
export function paymentFacts(payload: unknown): PaymentFacts {
  const d = obj(obj(payload)?.data) ?? {};
  const amount = amountOf(d.usd_total) ?? amountOf(d.total) ?? amountOf(d.final_amount) ?? amountOf(d.subtotal) ?? amountOf(d.amount);
  const membershipId = (typeof obj(d.membership)?.id === "string" ? obj(d.membership)!.id as string : null) ?? (typeof d.membership_id === "string" ? d.membership_id : null);
  return { id: typeof d.id === "string" ? d.id : null, amount, reason: typeof d.billing_reason === "string" ? d.billing_reason : null, membershipId };
}

/** Which funnel event a successful payment is: the trial's first charge, the first full charge, or a renewal. Pure. */
export function paymentKind(p: Pick<PaymentFacts, "amount" | "reason">, hasConverted: boolean): "trial_start" | "trial_convert" | "sub_renewal" | null {
  const price = PLANS.insidir.price;
  const first = p.reason === "subscription_create" || (p.reason === null && p.amount !== null && p.amount > 0 && p.amount < price / 2);
  if (first) return "trial_start";
  const cycle = p.reason === "subscription_cycle" || p.reason === "subscription_update" || (p.amount !== null && p.amount >= price / 2);
  if (!cycle) return null;
  return hasConverted ? "sub_renewal" : "trial_convert";
}

/** Whether a membership webhook says it's cancelling or ended. Pure. */
export function cancelled(type: string, payload: unknown): { membershipId: string; at: "period_end" | "now" } | null {
  const d = obj(obj(payload)?.data) ?? {};
  const id = typeof d.id === "string" && d.id.startsWith("mem_") ? d.id : null;
  if (!id) return null;
  if (type === "membership.deactivated" || d.status === "canceled" || d.status === "expired") return { membershipId: id, at: "now" };
  if (type === "membership.updated" && d.cancel_at_period_end === true) return { membershipId: id, at: "period_end" };
  return null;
}

const userSource = async (db: Db, userId: string): Promise<string> =>
  ((await db.execute(sql`select coalesce(source, 'direct') as s from terminal.users where id = ${userId}`)).rows[0] as { s?: string } | undefined)?.s ?? "direct";

/** Logs the funnel events a billing webhook stands for (after lib/billing/access.ts applied it to the account). */
export async function recordBillingFunnel(db: Db, type: string, payload: unknown, userId: string | null, now = Date.now()): Promise<string[]> {
  if (!userId) return [];
  const source = await userSource(db, userId);
  const out: string[] = [];
  const log = async (name: string, key: string, props: Record<string, string | number> = {}) => {
    if (await recordEvent({ name, userId, props: { source, ...props }, dedupeKey: key, at: new Date(now) })) out.push(name);
  };
  if (type === "payment.succeeded") {
    const p = paymentFacts(payload);
    // A payment is one funnel event, whatever Whop resends.
    if (p.id && (await db.execute(sql`select 1 from terminal.events where user_id = ${userId} and props->>'payment' = ${p.id} limit 1`)).rows.length) return out;
    const converted = ((await db.execute(sql`select 1 from terminal.events where user_id = ${userId} and name = 'trial_convert' limit 1`)).rows.length) > 0;
    const kind = paymentKind(p, converted);
    const props = { ...(p.amount !== null ? { amount: p.amount } : {}), ...(p.membershipId ? { membership: p.membershipId } : {}), ...(p.id ? { payment: p.id } : {}) };
    // A trial starts once per account; a conversion once per account; each renewal once per payment.
    if (kind === "trial_start") await log("trial_start", `trial_start:${userId}`, props);
    else if (kind === "trial_convert") await log("trial_convert", `trial_convert:${userId}`, props);
    else if (kind === "sub_renewal") await log("sub_renewal", `renewal:${p.id ?? `${userId}:${now}`}`, props);
  } else if (type.startsWith("membership.")) {
    if (type === "membership.activated") {
      // A trial that started without a payment webhook (or before it arrived): still one trial per account.
      const d = obj(obj(payload)?.data) ?? {};
      if (d.status === "trialing") await log("trial_start", `trial_start:${userId}`, { membership: String(d.id ?? "") });
    }
    const c = cancelled(type, payload);
    if (c) await log("sub_cancel", `sub_cancel:${c.membershipId}`, { membership: c.membershipId, at: c.at });
  } else if (type === "refund.created") {
    const d = obj(obj(payload)?.data) ?? {};
    const amount = amountOf(d.amount) ?? amountOf(d.total) ?? amountOf(d.usd_amount);
    await log("refund", `refund:${typeof d.id === "string" ? d.id : `${userId}:${now}`}`, amount !== null ? { amount } : {});
  }
  return out;
}

/** Saves where an account came from, once: its first and last touch (from the cookies at signup, else the visitor's
 *  logged first touch) and the source it's counted under. Never overwrites. */
export async function attributeUser(db: Db, userId: string, cookies: { first?: string | null; last?: string | null; visitorId?: string | null } = {}): Promise<void> {
  let first: Touch | null = readTouch(cookies.first), last: Touch | null = readTouch(cookies.last);
  const vid = cookies.visitorId ?? ((await db.execute(sql`select visitor_id from terminal.users where id = ${userId}`)).rows[0] as { visitor_id?: string } | undefined)?.visitor_id ?? null;
  if (!first && vid) {
    const r = (await db.execute(sql`select props from terminal.events where visitor_id = ${vid} and name = 'touch' order by at asc limit 1`)).rows[0] as { props?: Record<string, string> } | undefined;
    if (r?.props) first = readTouch(JSON.stringify({ ...r.props, at: 0 }));
  }
  if (!last && vid) {
    const r = (await db.execute(sql`select props from terminal.events where visitor_id = ${vid} and name = 'touch' order by at desc limit 1`)).rows[0] as { props?: Record<string, string> } | undefined;
    if (r?.props) last = readTouch(JSON.stringify({ ...r.props, at: 0 }));
  }
  // An account from before first-touch tracking keeps its UTM tags as its source.
  const legacy = ((await db.execute(sql`select utm from terminal.users where id = ${userId}`)).rows[0] as { utm?: Record<string, string> | null } | undefined)?.utm ?? null;
  const source = first ? first.source : legacy ? sourceOf({ ref: legacy.utm_medium === "ref" ? legacy.utm_source : undefined, utm_source: legacy.utm_source }) : "direct";
  await db.execute(sql`update terminal.users set
      first_touch = coalesce(first_touch, ${first ? JSON.stringify(first) : null}::jsonb),
      last_touch = coalesce(last_touch, ${last ? JSON.stringify(last) : first ? JSON.stringify(first) : null}::jsonb),
      source = case when source is null or source = '(before tracking)' and ${Boolean(first)} then ${source} else source end,
      visitor_id = coalesce(visitor_id, ${vid})
    where id = ${userId}`);
}

/** Activation: 2 or more wallets followed within 24 hours of signing up (checked on each follow). */
export async function checkFollowActivation(db: Db, userId: string, now = Date.now()): Promise<boolean> {
  const r = (await db.execute(sql`select u.created_at, u.source,
      (select count(*)::int from terminal.follows f where f.user_id = u.id and f.kind = 'trader' and f.created_at <= u.created_at + interval '24 hours') as n
    from terminal.users u where u.id = ${userId}`).catch(() => ({ rows: [] }))).rows[0] as { created_at?: string; source?: string; n?: number } | undefined;
  if (!r?.created_at || Number(r.n) < 2) return false;
  if (now - new Date(r.created_at).getTime() > 24 * 3_600_000 + 60_000) return false;
  return recordEvent({ name: "activation_follow2", userId, props: { source: r.source ?? "direct" }, dedupeKey: `activation_follow2:${userId}` });
}

/** Activation: the Daily Brief opened (once per account per day; the first counts for activation). */
export async function recordBriefOpen(userId: string, visitorId: string | null, via: string, now = Date.now()): Promise<void> {
  const day = new Date(now).toISOString().slice(0, 10);
  await recordEvent({ name: "brief_open", userId, visitorId, props: { via }, dedupeKey: `brief_open:${userId}:${day}` }).catch(() => undefined);
}

/** One row per account per day it used Insidir signed in (retention). Written at most once per process per day. */
const seen = new Set<string>();
export async function markActive(db: Db, userId: string, now = Date.now()): Promise<void> {
  const day = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const k = `${userId}:${day}`;
  if (seen.has(k)) return;
  if (seen.size > 50_000) seen.clear();
  seen.add(k);
  await db.execute(sql`insert into terminal.user_activity (user_id, day) values (${userId}, ${day}::date) on conflict do nothing`).catch(() => { seen.delete(k); });
}
