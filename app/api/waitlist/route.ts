/* POST /api/waitlist {email, feature}: "Want a heads-up when it's live?" Saves one row per email per feature.
 * GET /api/waitlist?remove=&feature=&s=: the signed one-click unsubscribe link in the "it's live" email. */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabase } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { verifyUnsubscribe } from "@/lib/alerts/send";
import { waitlist } from "@/lib/db/schema";
import { addWaitlist } from "@/lib/moves/store";
import { isFeature, validEmail } from "@/lib/moves/waitlist";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; feature?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const feature = typeof body?.feature === "string" ? body.feature : "";
  if (!validEmail(email)) return NextResponse.json({ error: "That email doesn't look right. Check it and try again." }, { status: 400 });
  if (!isFeature(feature)) return NextResponse.json({ error: "Unknown feature." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ error: "Couldn't save that now. Try again in a minute." }, { status: 503 });
  await addWaitlist(getDb(), email, feature);
  return NextResponse.json({ ok: true, message: "Thanks. You're on the list." });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const email = (q.get("remove") ?? "").toLowerCase(), feature = q.get("feature") ?? "";
  if (!email || !isFeature(feature) || !verifyUnsubscribe(`waitlist:${email}`, q.get("s") ?? "")) return new NextResponse("That link isn't valid.", { status: 400 });
  if (hasDatabase()) await getDb().delete(waitlist).where(and(eq(waitlist.email, email), eq(waitlist.feature, feature)));
  return new NextResponse("Done. You won't get emails about this feature.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
