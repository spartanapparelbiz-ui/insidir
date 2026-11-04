/* POST /api/admin/twins: approve, deny or reopen twins (form fields: id (repeatable), action = approve | deny | pending;
 * or action = approve-candidates to approve every exact candidate on the page). Admin only. */
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { appUrl } from "@/lib/app-url";
import { getDb, hasDatabase } from "@/lib/db";
import { decideTwins } from "@/lib/twins/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!verifyAdminCookie(req.cookies.get(ADMIN_COOKIE)?.value, Date.now())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ error: "No database." }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const action = String(form?.get("action") ?? "");
  const ids = (form?.getAll("id") ?? []).map(String).filter(x => /^[\w.:-]{3,200}$/.test(x)).slice(0, 500);
  const status = action === "approve" || action === "approve-candidates" ? "approved" : action === "deny" ? "denied" : action === "pending" ? "pending" : null;
  if (!status) return NextResponse.redirect(new URL("/admin/twins?error=action", appUrl()), 303);
  const n = await decideTwins(getDb(), ids, status, "admin", Date.now());
  return NextResponse.redirect(new URL(`/admin/twins?saved=${n}`, appUrl()), 303);
}
