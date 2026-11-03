/* POST /api/go/save {cats, where, size, remind}: the /go quiz, saved once they've signed in: their categories (the
 * first is their home's), where they bet, their normal size, whether to remind them before the trial charges, and the
 * older onboarding's leagues (betOn) so Tonight keeps working. Marks them onboarded. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/lib/analytics";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { betOnFor, isSize, isWhere, parseCats } from "@/lib/go/data";

export async function POST(req: NextRequest) {
  if (!hasDatabase()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const viewer = await getViewer();
  if (!viewer.user) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { cats?: unknown; where?: unknown; size?: unknown; remind?: unknown };
  const cats = parseCats(Array.isArray(b.cats) ? b.cats.join(",") : String(b.cats ?? ""));
  const go = { categories: cats, where: isWhere(b.where) ? b.where : null, size: isSize(b.size) ? b.size : null };
  const settings = { ...viewer.user.settings, go, betOn: betOnFor(cats), remindBeforeCharge: b.remind !== false };
  const now = new Date();
  await getDb().update(users).set({ settings, ...(viewer.user.onboarded ? {} : { onboardedAt: now }) }).where(eq(users.id, viewer.user.id));
  void recordEvent({ name: "go_saved", visitorId: null, userId: viewer.user.id, props: { cats: cats.join(","), where: go.where ?? "", size: go.size ?? "" } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
