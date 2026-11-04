/* POST /copies/pick (the "Pick a winner to copy" form): starts copying one copyable wallet or tracker
 * (pick=trader:<0x…> or tracker:<slug>; it must be copyable now, lib/copies/store.ts) for a member. With onboarding=1
 * it also marks onboarding done (skip=1 copies nothing). Records copy_started / onboarding_done / onboarding_skip, then
 * goes to ?next (/copies by default). Nothing is ever traded. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/analytics";
import { appUrl } from "@/lib/app-url";
import { safeNext } from "@/lib/auth/next";
import { SESSION_COOKIE, userForToken, VISITOR_COOKIE } from "@/lib/auth/session";
import { copyable } from "@/lib/copies/store";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { follow } from "@/lib/moves/store";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!user) return NextResponse.redirect(new URL("/login?next=/", appUrl()), 303);
  if (!isPaid(user.plan)) return NextResponse.redirect(new URL("/go", appUrl()), 303);
  const form = await req.formData().catch(() => null);
  const onboarding = form?.get("onboarding") === "1", skipped = form?.get("skip") === "1";
  const db = getDb(), now = Date.now();
  let picked: string | null = null;
  if (!skipped) {
    const [kind, target] = String(form?.get("pick") ?? "").split(":");
    const ok = (await copyable(db, now)).find(c => c.kind === kind && c.target === target);
    if (ok) { await follow(db, user.id, ok.kind, ok.target); picked = ok.kind; }
  }
  if (onboarding) await db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, user.id));
  const visitorId = req.cookies.get(VISITOR_COOKIE)?.value ?? null;
  if (picked) void recordEvent({ name: "copy_started", visitorId, userId: user.id, props: { kind: picked, onboarding } }).catch(() => undefined);
  if (onboarding) void recordEvent({ name: picked ? "onboarding_done" : "onboarding_skip", visitorId, userId: user.id, props: { copies: picked ? 1 : 0 } }).catch(() => undefined);
  return NextResponse.redirect(new URL(safeNext(String(form?.get("next") ?? "/copies")), appUrl()), 303);
}
