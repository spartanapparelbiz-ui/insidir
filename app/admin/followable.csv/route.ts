/* /admin/followable.csv (behind the admin sign-in): the followable QA sheet (lib/follow/report.ts). */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminCookie } from "@/lib/admin";
import { getDb, hasDatabase } from "@/lib/db";
import { followableCsv } from "@/lib/follow/report";

export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  if (!verifyAdminCookie(jar.get(ADMIN_COOKIE)?.value, Date.now())) return new NextResponse("Sign in on /admin first.", { status: 401 });
  if (!hasDatabase()) return new NextResponse("No database.", { status: 503 });
  const now = Date.now();
  return new NextResponse(await followableCsv(getDb(), now), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="followable-${new Date(now).toISOString().slice(0, 10)}.csv"` } });
}
