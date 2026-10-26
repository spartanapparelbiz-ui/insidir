/* POST /api/waitlist {email, feature}: "Want a heads-up when it's live?" Saves one row per email per feature. */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabase } from "@/lib/db";
import { addWaitlist } from "@/lib/moves/store";
import { isFeature, validEmail } from "@/lib/moves/waitlist";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; feature?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const feature = typeof body?.feature === "string" ? body.feature : "";
  if (!validEmail(email)) return NextResponse.json({ error: "That email doesn't look right. Check it and try again." }, { status: 400 });
  if (!isFeature(feature)) return NextResponse.json({ error: "Unknown feature." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ error: "Couldn't save that just now. Try again in a minute." }, { status: 503 });
  await addWaitlist(getDb(), email, feature);
  return NextResponse.json({ ok: true, message: "Thanks. We'll email you when it's live." });
}
