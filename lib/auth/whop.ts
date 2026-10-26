/* Whop: sign-in (OAuth 2.1 + PKCE, run on the server), membership → plan, cancellation and webhook signatures.
 * Docs: docs.whop.com/developer/guides/oauth, /developer/guides/webhooks, /api-reference/memberships.
 *
 * Env:
 *   WHOP_CLIENT_ID          app_… (OAuth client)
 *   WHOP_CLIENT_SECRET      optional; sent on the token exchange when set
 *   WHOP_API_KEY            account API key (server only): reads memberships, cancels them
 *   WHOP_COMPANY_ID         biz_…
 *   WHOP_PRODUCT_INSIDIR, WHOP_PRODUCT_PRO   prod_… ids that grant each plan
 *   WHOP_PLAN_INSIDIR, WHOP_PLAN_PRO         plan_… ids for the checkout links
 *   WHOP_WEBHOOK_SECRET     ws_… signing secret
 *   APP_URL                 https://insidir.com (OAuth redirect base)
 *
 * No Whop token is stored: after sign-in the user's plan is read with the account API key and our own session
 * cookie takes over, and the refresh token is revoked straight away. */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Plan } from "@/lib/types";

/** Whop's origins. Overridable only so end-to-end tests can point at a local mock Whop (qa/e2e/mock-whop.ts). */
const API_ORIGIN = (process.env.WHOP_API_ORIGIN ?? "https://api.whop.com").replace(/\/+$/, "");
const CHECKOUT_ORIGIN = (process.env.WHOP_CHECKOUT_ORIGIN ?? "https://whop.com").replace(/\/+$/, "");
export const WHOP_API = `${API_ORIGIN}/api/v1`;
export const WHOP_OAUTH = `${API_ORIGIN}/oauth`;
export const WEBHOOK_TOLERANCE_SECONDS = 300;

const env = (k: string): string => process.env[k] ?? "";
export const appUrl = (): string => (env("APP_URL") || "http://localhost:3000").replace(/\/$/, "");
export const redirectUri = (): string => appUrl() + "/auth/callback";

const b64url = (b: Buffer): string => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export interface PkceStart { url: string; state: string; verifier: string }

export function startAuthorize(): PkceStart {
  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(16));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env("WHOP_CLIENT_ID"),
    redirect_uri: redirectUri(),
    scope: "openid profile email",
    state,
    nonce: b64url(randomBytes(16)),
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
  });
  return { url: `${WHOP_OAUTH}/authorize?${params}`, state, verifier };
}

export interface WhopUser { id: string; email: string | null; name: string | null; username: string | null }

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

async function json(res: Response): Promise<Record<string, unknown>> {
  const body: unknown = await res.json().catch(() => null);
  return obj(body) ?? {};
}

/** Code → tokens → userinfo. Revokes the refresh token afterwards; nothing from Whop is kept but the profile. */
export async function finishAuthorize(code: string, verifier: string): Promise<WhopUser> {
  const res = await fetch(`${WHOP_OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code", code, redirect_uri: redirectUri(), client_id: env("WHOP_CLIENT_ID"), code_verifier: verifier,
      ...(env("WHOP_CLIENT_SECRET") ? { client_secret: env("WHOP_CLIENT_SECRET") } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const tokens = await json(res);
  const access = str(tokens.access_token);
  if (!res.ok || !access) throw new Error(`Whop sign-in failed (${res.status}): ${str(tokens.error_description) ?? str(tokens.error) ?? "no token"}`);
  const info = await json(await fetch(`${WHOP_OAUTH}/userinfo`, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(10_000) }));
  const id = str(info.sub);
  if (!id) throw new Error("Whop sign-in returned no user");
  const refresh = str(tokens.refresh_token);
  if (refresh) {
    void fetch(`${WHOP_OAUTH}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: refresh, client_id: env("WHOP_CLIENT_ID") }), signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
  }
  return { id, email: str(info.email), name: str(info.name), username: str(info.preferred_username) };
}

/* ---------- memberships → plan ---------- */

export interface MembershipLite {
  id: string;
  status: string;
  productId: string | null;
  planId: string | null;
  cancelAtPeriodEnd: boolean;
  manageUrl: string | null;
}

/** Statuses that grant access. A membership set to cancel at period end stays "active" until then. */
export const GRANTING = new Set(["active", "trialing"]);

export function readMemberships(body: unknown): MembershipLite[] {
  const data = obj(body)?.data;
  if (!Array.isArray(data)) return [];
  return data.map(obj).filter((m): m is Record<string, unknown> => m !== null).map(m => ({
    id: str(m.id) ?? "",
    status: str(m.status) ?? "",
    productId: str(obj(m.product)?.id),
    planId: str(obj(m.plan)?.id),
    cancelAtPeriodEnd: m.cancel_at_period_end === true,
    manageUrl: str(m.manage_url),
  })).filter(m => m.id);
}

export interface PlanIds { insidirProduct: string; proProduct: string; insidirPlan: string; proPlan: string }
export const planIds = (): PlanIds => ({
  insidirProduct: env("WHOP_PRODUCT_INSIDIR"), proProduct: env("WHOP_PRODUCT_PRO"), insidirPlan: env("WHOP_PLAN_INSIDIR"), proPlan: env("WHOP_PLAN_PRO"),
});

/** The best plan any granting membership gives, and that membership. Pure. */
export function planFrom(memberships: readonly MembershipLite[], ids: PlanIds): { plan: Plan; membership: MembershipLite | null } {
  const granting = memberships.filter(m => GRANTING.has(m.status));
  const is = (m: MembershipLite, product: string, plan: string) => Boolean((product && m.productId === product) || (plan && m.planId === plan));
  const pro = granting.find(m => is(m, ids.proProduct, ids.proPlan));
  if (pro) return { plan: "pro", membership: pro };
  const ins = granting.find(m => is(m, ids.insidirProduct, ids.insidirPlan));
  if (ins) return { plan: "insidir", membership: ins };
  return { plan: "free", membership: null };
}

const apiHeaders = () => ({ Authorization: `Bearer ${env("WHOP_API_KEY")}`, Accept: "application/json" });

/** Reads the user's memberships with the account API key (server-side verification). */
export async function fetchMemberships(userId: string): Promise<MembershipLite[]> {
  const q = new URLSearchParams();
  q.append("user_ids[]", userId);
  for (const s of ["active", "trialing", "past_due", "canceled", "expired"]) q.append("statuses[]", s);
  if (env("WHOP_COMPANY_ID")) q.set("account_id", env("WHOP_COMPANY_ID"));
  q.set("first", "50");
  const res = await fetch(`${WHOP_API}/memberships?${q}`, { headers: apiHeaders(), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Whop memberships: HTTP ${res.status}`);
  return readMemberships(await res.json());
}

/** One-click cancel: access continues to the end of the paid period. */
export async function cancelMembership(membershipId: string): Promise<void> {
  const res = await fetch(`${WHOP_API}/memberships/${encodeURIComponent(membershipId)}/cancel`, {
    method: "POST", headers: { ...apiHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ cancel_at_period_end: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Whop cancel: HTTP ${res.status}`);
}

/** The Whop checkout for a plan. Set each Whop product's "redirect after purchase" to `${APP_URL}/auth/login?next=/terminal`,
 *  so a buyer comes back, is signed in (Whop skips consent once approved) and lands on the live Terminal. */
export function checkoutUrl(plan: Exclude<Plan, "free">): string | null {
  const id = plan === "pro" ? env("WHOP_PLAN_PRO") : env("WHOP_PLAN_INSIDIR");
  return id ? `${CHECKOUT_ORIGIN}/checkout/${encodeURIComponent(id)}` : null;
}

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

/** The Whop user a membership or payment webhook is about. */
export function webhookUserId(payload: unknown): string | null {
  const data = obj(obj(payload)?.data);
  return str(obj(data?.user)?.id) ?? str(data?.user_id) ?? str(obj(obj(data?.member)?.user)?.id);
}
