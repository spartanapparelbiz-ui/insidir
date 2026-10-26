/* Checkout and subscriptions through the Whop SDK. Server only.
 *
 * Checkout: /pricing embeds Whop's Checkout element so buyers stay on insidir.com. The fallback (and the sandbox
 * default, since Elements has no sandbox yet) is a checkout configuration created here: the plan, our own user id
 * in metadata (Whop copies it onto the payment and the membership) and a redirect back to the live Terminal.
 * Access is never granted from the redirect: users.checkAccess decides (lib/whop/access.ts). */
import type { Plan } from "@/lib/types";
import { whop } from "./client";
import { appUrl, whopConfig } from "./config";

export type PaidPlan = Exclude<Plan, "free">;

/** Where a buyer lands after paying: the live Terminal with its welcome line. */
export const afterCheckoutUrl = (): string => `${appUrl()}/terminal?welcome=1`;

export const planId = (plan: PaidPlan): string => whopConfig().plans[plan];

export async function createCheckout(plan: PaidPlan, customerId: string, affiliateCode: string | null): Promise<string> {
  const id = planId(plan);
  if (!id) throw new Error(`No Whop plan configured for ${plan}`);
  const cfg = await whop().checkoutConfigurations.create({
    plan_id: id,
    metadata: { customer_id: customerId },
    redirect_url: afterCheckoutUrl(),
    ...(affiliateCode ? { affiliate_code: affiliateCode } : {}),
  });
  if (!cfg.purchase_url) throw new Error("Whop returned no purchase_url");
  return cfg.purchase_url;
}

export interface MembershipView { id: string; productId: string; status: string; cancelAtPeriodEnd: boolean; periodEnd: string | null }

/** Statuses that still bill or still grant access, i.e. something one-click cancel should act on. */
const LIVE = ["active", "trialing", "past_due"] as const;

/** The user's live Insidir and Pro memberships. */
export async function liveMemberships(whopUserId: string): Promise<MembershipView[]> {
  const c = whopConfig();
  const products = [c.products.insidir, c.products.pro].filter(Boolean);
  if (!whopUserId || !products.length) return [];
  const page = await whop().memberships.list({ user_id: whopUserId, product_ids: products, statuses: [...LIVE], first: 20,
    ...(c.companyId ? { account_id: c.companyId } : {}) });
  return page.data.filter(m => products.includes(m.product_id ?? m.product?.id)).map(m => ({
    id: m.id, productId: m.product_id ?? m.product?.id, status: m.status, cancelAtPeriodEnd: m.cancel_at_period_end, periodEnd: m.current_period_end,
  }));
}

/** One-click cancel: every live membership stops renewing; access continues until Whop's period end. */
export async function cancelAtPeriodEnd(whopUserId: string): Promise<number> {
  let n = 0;
  for (const m of await liveMemberships(whopUserId)) {
    if (m.cancelAtPeriodEnd) continue;
    await whop().memberships.cancel({ id: m.id, cancel_at_period_end: true });
    n++;
  }
  return n;
}
