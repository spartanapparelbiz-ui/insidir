/* The top bar's "Pro view" toggle (a plain form post, so it works without JS). Saves the choice in a cookie and, for
 * a signed-in user, in their settings; then goes back to the page it came from. */
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, userForToken } from "@/lib/auth/session";
import { appUrl } from "@/lib/auth/whop";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { readView, VIEW_COOKIE } from "@/lib/view";

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const view = readView(String(form?.get("view") ?? ""));
  const next = String(form?.get("next") ?? "/terminal");
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (user) await getDb().update(users).set({ settings: { ...user.settings, proView: view === "pro" } }).where(eq(users.id, user.id));
  const res = NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/terminal", appUrl()), 303);
  res.cookies.set(VIEW_COOKIE, view, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 365 * 86_400 });
  return res;
}
