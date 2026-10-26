/* Checkout fallback: creates a Whop checkout configuration (plan, metadata { customer_id: our user id }, redirect to
 * the live Terminal) and sends the buyer to its purchase_url. Used when the embedded Checkout element is off (the
 * sandbox) or fails to load. Signed-in users only, so the purchase is always tied to an account. */
import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/analytics";
import { SESSION_COOKIE, userForToken, VISITOR_COOKIE } from "@/lib/auth/session";
import { createCheckout, type PaidPlan } from "@/lib/whop/billing";
import { appUrl } from "@/lib/whop/config";

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const raw = form?.get("plan");
  const plan: PaidPlan = raw === "pro" ? "pro" : "insidir";
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(`/pricing?plan=${plan}`)}`, appUrl()), 303);
  if (user.plan === plan || user.plan === "pro") return NextResponse.redirect(new URL("/settings", appUrl()), 303);
  try {
    const url = await createCheckout(plan, user.id, req.cookies.get("insidir_aff")?.value ?? null);
    await recordEvent({ name: "checkout_start", visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, userId: user.id, props: { plan, where: "redirect" } })
      .catch(() => undefined);
    return NextResponse.redirect(url, 303);
  } catch (e) {
    console.error("checkout configuration failed:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(new URL(`/pricing?plan=${plan}&checkout=failed`, appUrl()), 303);
  }
}
