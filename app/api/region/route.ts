/* Sets the visitor's region (and the signed-in user's). US visitors only ever see Kalshi and Polymarket US. */
import { appUrl } from "@/lib/auth/whop";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { REGION_COOKIE, SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const region = form.get("region");
  const next = String(form.get("next") ?? "/feed");
  if (region !== "us" && region !== "non_us") return NextResponse.json({ error: "region must be us or non_us" }, { status: 400 });
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (user) await getDb().update(users).set({ region }).where(eq(users.id, user.id));
  const res = NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/feed", appUrl()), 303);
  res.cookies.set(REGION_COOKIE, region, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 365 * 86_400 });
  return res;
}
