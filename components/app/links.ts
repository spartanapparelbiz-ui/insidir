/* Where Unlock and plan buttons go: our own /pricing page with that plan's checkout open, so the buyer never
 * leaves insidir.com (it asks for Sign in with Whop first when needed). */
import type { PaidPlan } from "@/lib/whop/billing";

export const checkoutPath = (plan: PaidPlan = "insidir"): string => `/pricing?plan=${plan}`;

/** `next` is kept for callers; checkout always ends on the live Terminal. */
export const unlockHref = (plan: PaidPlan = "insidir", _next = "/terminal"): string => checkoutPath(plan);

export const vapidPublicKey = (): string => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
