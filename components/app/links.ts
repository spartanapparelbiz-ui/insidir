/* Where Unlock buttons go: straight to Whop checkout when it's configured, else sign-in (which lands on /terminal).
 * Server only (reads env). */
import { checkoutUrl } from "@/lib/auth/whop";

export const unlockHref = (plan: "insidir" | "pro" = "insidir", next = "/terminal"): string =>
  checkoutUrl(plan) ?? `/auth/login?next=${encodeURIComponent(next)}`;

export const vapidPublicKey = (): string => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
