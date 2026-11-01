/* POST /api/billing/cancel (the form in Account): one reason is required (lib/billing/cancel-reasons.ts), kept in
 * terminal.cancel_reasons, then the membership is cancelled with Whop at the end of the period they paid for; they keep
 * access until then. Without a reason nothing is cancelled. Form posts come back to /settings. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { recordEvent } from "@/lib/analytics";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { isCancelReason, reasonLabel } from "@/lib/billing/cancel-reasons";
import { cancelMembership } from "@/lib/billing/whop";
import { getDb } from "@/lib/db";
import { cancelReasons, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/settings${q}#billing`, appUrl()), 303);
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings", appUrl()), 303);
  const form = await req.formData().catch(() => null);
  const reason = form?.get("reason");
  if (!isCancelReason(reason)) return back("?cancel=reason");
  if (!user.membershipId) return back("?cancel=none");
  const detail = String(form?.get("detail") ?? "").trim().slice(0, 500) || null;
  const db = getDb();
  await db.insert(cancelReasons).values({ userId: user.id, membershipId: user.membershipId, reason, detail });
  const ok = await cancelMembership(user.membershipId, detail ? `${reasonLabel(reason)}: ${detail}` : reasonLabel(reason)).catch(() => false);
  if (!ok) return back("?cancel=failed");
  await db.update(users).set({ cancelAtPeriodEnd: true }).where(eq(users.id, user.id));
  void recordEvent({ name: "cancel", userId: user.id, props: { reason } }).catch(() => undefined);
  return back("?cancel=done");
}
