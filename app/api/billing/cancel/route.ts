/* POST /api/billing/cancel (the button in Account): one click cancels the membership with Whop now (immediate: access
 * ends and nothing more is charged) and takes paid access away here at once. A reason is optional (kept in
 * terminal.cancel_reasons when given). Form posts come back to /settings, which confirms it on screen. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { recordEvent } from "@/lib/analytics";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { isCancelReason, reasonLabel } from "@/lib/billing/cancel-reasons";
import { cancelMembership } from "@/lib/billing/whop";
import { getDb } from "@/lib/db";
import { cancelReasons, users } from "@/lib/db/schema";

/** Immediate cancel: paid access ends here at once (Whop's webhook says the same moments later). */
const CANCELLED_NOW = () => ({ plan: "free" as const, membershipStatus: "canceled", cancelAtPeriodEnd: false, accessUntil: new Date(), planCheckedAt: new Date() });

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/settings${q}#billing`, appUrl()), 303);
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings", appUrl()), 303);
  const form = await req.formData().catch(() => null);
  const reason = form?.get("reason");
  if (!user.membershipId) return back("?cancel=none");
  const detail = String(form?.get("detail") ?? "").trim().slice(0, 500) || null;
  const db = getDb();
  const why = isCancelReason(reason) ? reason : null;
  if (why) await db.insert(cancelReasons).values({ userId: user.id, membershipId: user.membershipId, reason: why, detail });
  const ok = await cancelMembership(user.membershipId, why ? (detail ? `${reasonLabel(why)}: ${detail}` : reasonLabel(why)) : "Cancelled in Account").catch(() => false);
  if (!ok) return back("?cancel=failed");
  await db.update(users).set(CANCELLED_NOW()).where(eq(users.id, user.id));
  void recordEvent({ name: "cancel", userId: user.id, props: { reason: why ?? "none" } }).catch(() => undefined);
  return back("?cancel=done");
}
