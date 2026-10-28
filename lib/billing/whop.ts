/* Whop, our payment provider: memberships → plan, cancellation, the embedded checkout's plan ids, and webhook
 * signatures. Whop never logs anyone in to Insidir: accounts and log-in are ours (lib/auth/login.ts); Whop only says
 * who has paid. Docs: docs.whop.com/developer/guides/embed-checkout, /developer/guides/webhooks, /api-reference/memberships.
 *
 * Env:
 *   WHOP_API_KEY            account API key (server only): reads memberships and payments, cancels memberships
 *   WHOP_COMPANY_ID         biz_…
 *   WHOP_PLAN_INSIDIR       plan_… the embedded checkout sells (Insidir, $39/month)
 *   WHOP_PRODUCT_INSIDIR    prod_… (optional; any membership on this product also counts)
 *   WHOP_WEBHOOK_SECRET     ws_… signing secret of the webhook pointed at /api/billing/webhook */
import { whopRuntime } from "./config";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Plan } from "@/lib/types";

/** Whop's origin. Overridable only so end-to-end tests can point at a local mock Whop (qa/e2e/mock-whop.ts). */
const API_ORIGIN = (process.env.WHOP_API_ORIGIN ?? "https://api.whop.com").replace(/\/+$/, "");
export const WHOP_API = `${API_ORIGIN}/api/v1`;
/** Whop's Elements script (the embedded checkout). Overridable for the same reason. */
export const ELEMENTS_URL = process.env.WHOP_ELEMENTS_URL || "https://cdn.whop.com/elements/amber/elements.js";
export const WEBHOOK_TOLERANCE_SECONDS = 300;

const env = (k: string): string => process.env[k] ?? "";
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
export const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export type PaidPlan = Exclude<Plan, "free">;

/* ---------- memberships → plan ---------- */

export interface MembershipLite {
  id: string;
  status: string;
  productId: string | null;
  planId: string | null;
  cancelAtPeriodEnd: boolean;
  manageUrl: string | null;
  /** End of the current billing period (the next charge, or the last day of access once cancelled), ms; null if not recurring. */
  renewalPeriodEnd: number | null;
  /** The recurring price as Whop formats it ("$39.00 / month"); null if not recurring. */
  renewalPrice: string | null;
  user: { id: string | null; email: string | null; name: string | null };
  metadata: Record<string, string>;
}

/** Whop sends dates as ISO strings or Unix timestamps (seconds). */
function whopTime(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string" && v) { const n = Number(v); if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n; const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
}

export function readMetadata(v: unknown): Record<string, string> {
  const o = obj(v) ?? {};
  return Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => typeof e[1] === "string"));
}

export function readMembership(m: Record<string, unknown>): MembershipLite | null {
  const id = str(m.id);
  if (!id || !id.startsWith("mem_")) return null;
  const user = obj(m.user);
  return {
    id,
    status: str(m.status) ?? "",
    productId: str(obj(m.product)?.id),
    planId: str(obj(m.plan)?.id),
    cancelAtPeriodEnd: m.cancel_at_period_end === true,
    manageUrl: str(m.manage_url),
    renewalPeriodEnd: whopTime(m.renewal_period_end),
    renewalPrice: str(m.formatted_renewal_price),
    user: { id: str(user?.id) ?? str(m.user_id), email: str(user?.email)?.toLowerCase() ?? null, name: str(user?.name) },
    metadata: readMetadata(m.metadata),
  };
}

export function readMemberships(body: unknown): MembershipLite[] {
  const data = obj(body)?.data;
  if (!Array.isArray(data)) return [];
  return data.map(obj).filter((m): m is Record<string, unknown> => m !== null).map(readMembership).filter((m): m is MembershipLite => m !== null);
}

/** Statuses that give access. A membership set to cancel stays active (or "canceling") until its period ends;
 *  one behind on payment ("past_due") keeps access only until the end of the period already paid for. */
export const GRANTING = new Set(["active", "trialing", "canceling"]);
export function grants(m: Pick<MembershipLite, "status" | "renewalPeriodEnd">, now: number): boolean {
  if (GRANTING.has(m.status)) return true;
  return m.status === "past_due" && m.renewalPeriodEnd !== null && m.renewalPeriodEnd > now;
}

export interface PlanIds { insidirProduct: string; insidirPlan: string }
export const planIds = (): PlanIds => ({ insidirProduct: env("WHOP_PRODUCT_INSIDIR"), insidirPlan: env("WHOP_PLAN_INSIDIR") });

/** Whether a membership is for Insidir (its plan or its product). */
export function planOf(m: Pick<MembershipLite, "productId" | "planId">, ids: PlanIds): PaidPlan | null {
  return (ids.insidirProduct && m.productId === ids.insidirProduct) || (ids.insidirPlan && m.planId === ids.insidirPlan) ? "insidir" : null;
}

/** "insidir" when any Insidir membership gives access now, with that membership (else the latest one, for its dates). Pure. */
export function planFrom(memberships: readonly MembershipLite[], ids: PlanIds, now = Date.now()): { plan: Plan; membership: MembershipLite | null } {
  const ours = memberships.filter(m => planOf(m, ids));
  const granting = ours.find(m => grants(m, now));
  return granting ? { plan: "insidir", membership: granting } : { plan: "free", membership: ours[0] ?? null };
}

const apiHeaders = () => ({ Authorization: `Bearer ${env("WHOP_API_KEY")}`, Accept: "application/json" });

/** Every membership a Whop user has with us (server-side, with the account API key). */
export async function fetchMemberships(whopUserId: string): Promise<MembershipLite[]> {
  const q = new URLSearchParams();
  q.append("user_ids[]", whopUserId);
  for (const s of ["active", "trialing", "canceling", "past_due", "canceled", "expired", "completed"]) q.append("statuses[]", s);
  if (env("WHOP_COMPANY_ID")) q.set("company_id", env("WHOP_COMPANY_ID"));
  q.set("first", "50");
  const res = await fetch(`${WHOP_API}/memberships?${q}`, { headers: apiHeaders(), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Whop memberships: HTTP ${res.status}`);
  return readMemberships(await res.json());
}

export async function fetchMembership(id: string): Promise<MembershipLite | null> {
  const res = await fetch(`${WHOP_API}/memberships/${encodeURIComponent(id)}`, { headers: apiHeaders(), signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Whop membership: HTTP ${res.status}`);
  const body = obj(await res.json());
  return body ? readMembership(body) : null;
}

/** The membership a payment belongs to, and its metadata (what our checkout put there). */
export async function fetchPayment(id: string): Promise<{ membershipId: string | null; metadata: Record<string, string>; email: string | null; whopUserId: string | null } | null> {
  const res = await fetch(`${WHOP_API}/payments/${encodeURIComponent(id)}`, { headers: apiHeaders(), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const p = obj(await res.json());
  return p ? readPayment(p) : null;
}

export function readPayment(p: Record<string, unknown>) {
  const user = obj(p.user);
  return { membershipId: str(obj(p.membership)?.id) ?? str(p.membership_id), metadata: readMetadata(p.metadata),
    email: str(user?.email)?.toLowerCase() ?? null, whopUserId: str(user?.id) ?? str(p.user_id) };
}

/** One-click cancel: access continues to the end of the paid period. */
export async function cancelMembership(membershipId: string): Promise<void> {
  const res = await fetch(`${WHOP_API}/memberships/${encodeURIComponent(membershipId)}/cancel`, {
    method: "POST", headers: { ...apiHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ cancel_at_period_end: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Whop cancel: HTTP ${res.status}`);
}

/** The Whop plan the embedded checkout sells, if configured. */
/** The plan the checkout sells: WHOP_PLAN_INSIDIR, else the one `npm run whop:setup` checked is exactly 7 days for $1,
 *  then $39/month (lib/billing/setup.ts). Null keeps checkout closed. */
export const checkoutPlanId = async (): Promise<string | null> => (await whopRuntime()).planId;

/* ---------- webhooks (Standard Webhooks) ---------- */

/** HMAC-SHA256 over `${id}.${timestamp}.${body}` with the `ws_…` secret, base64, in `webhook-signature` as
 *  "v1,<sig>" (several may be space-separated). The key is the secret string itself, as Whop's docs state; a
 *  `whsec_` secret (the Standard Webhooks convention) is base64-decoded instead. Rejects stale timestamps. */
export function verifyWebhook(body: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, secret: string, nowSeconds: number): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret, "utf8");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some(part => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** What a billing webhook is about: the membership (directly, or through a payment or refund), the Whop user and
 *  email when the payload carries them, and our checkout's metadata. Pure. */
export interface WebhookRef { membershipId: string | null; paymentId: string | null; whopUserId: string | null; email: string | null; metadata: Record<string, string>; membership: MembershipLite | null }
export function webhookRef(type: string, payload: unknown): WebhookRef {
  const data = obj(obj(payload)?.data) ?? {};
  if (type.startsWith("membership.")) {
    const m = readMembership(data);
    return { membershipId: m?.id ?? null, paymentId: null, whopUserId: m?.user.id ?? null, email: m?.user.email ?? null, metadata: m?.metadata ?? {}, membership: m };
  }
  if (type.startsWith("payment.")) {
    const p = readPayment(data);
    return { membershipId: p.membershipId, paymentId: str(data.id), whopUserId: p.whopUserId, email: p.email, metadata: p.metadata, membership: null };
  }
  if (type.startsWith("refund.") || type.startsWith("dispute.")) {
    const pay = obj(data.payment) ?? {};
    const p = readPayment(pay);
    return { membershipId: p.membershipId, paymentId: str(pay.id) ?? str(data.payment_id), whopUserId: p.whopUserId, email: p.email, metadata: p.metadata, membership: null };
  }
  return { membershipId: null, paymentId: null, whopUserId: null, email: null, metadata: {}, membership: null };
}
