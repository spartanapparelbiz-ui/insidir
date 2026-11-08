/* POST /api/book, from the plain forms on /book (no JavaScript needed):
 *   action=placed id [fill]   an Autopilot match placed, at the member's fill price in cents (default: the limit)
 *   action=skipped id         an Autopilot match not placed
 *   action=fill kind id fill  correct the fill price of a copy (kind=copy) or a placed match (kind=match)
 *   action=push at            the daily summary push time ("HH:MM", empty = off)
 * Redirects back to /book. Members only; only their own rows. */
import { eq } from "drizzle-orm";
import { appUrl } from "@/lib/app-url";
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { DEFAULT_SETTINGS, users } from "@/lib/db/schema";
import { isPaid } from "@/lib/plans";
import { correctCopy, markMatch } from "@/lib/book/book";

export const dynamic = "force-dynamic";
const back = (req: NextRequest, q: string) => NextResponse.redirect(new URL(`/book?${q}`, appUrl()), 303);
const centsOf = (v: FormDataEntryValue | null) => { const n = Number(v); return v === null || v === "" || !Number.isFinite(n) ? null : n / 100; };

export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.user || !isPaid(viewer.plan)) return NextResponse.redirect(new URL("/login?next=/book", appUrl()), 303);
  const db = getDb(), userId = viewer.user.id, f = await req.formData();
  const action = String(f.get("action") ?? ""), id = Number(f.get("id"));
  if ((action === "placed" || action === "skipped") && Number.isInteger(id)) {
    return back(req, (await markMatch(db, userId, id, action, centsOf(f.get("fill")))) ? `marked=${action}` : "error=1");
  }
  if (action === "fill" && Number.isInteger(id)) {
    const fill = centsOf(f.get("fill"));
    if (fill === null) return back(req, "error=fill");
    const ok = f.get("kind") === "copy" ? await correctCopy(db, userId, id, fill) : await markMatch(db, userId, id, "placed", fill);
    return back(req, ok ? "saved=1" : "error=fill");
  }
  if (action === "push") {
    const at = String(f.get("at") ?? "");
    const v = /^([01]\d|2[0-3]):[0-5]\d$/.test(at) ? at : null;
    const s = { ...DEFAULT_SETTINGS, ...viewer.user.settings, bookPushAt: v };
    await db.update(users).set({ settings: s }).where(eq(users.id, userId));
    return back(req, "saved=1");
  }
  return back(req, "error=1");
}
